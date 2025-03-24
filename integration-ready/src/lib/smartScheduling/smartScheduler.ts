import OpenAI from 'openai';
import { calendar_v3 } from 'googleapis';
import { UserPreferences, MeetingType, TimePreference } from '../types/preferences.js';

export interface SchedulingResult {
  suggestedTimes: Array<{
    start: string;
    end: string;
    score: number;
    reason: string;
  }>;
  conflicts: Array<{
    start: string;
    end: string;
    reason: string;
  }>;
}

export interface SchedulingRequest {
  userId: string;
  userPrefs: UserPreferences;
  meetingType: MeetingType;
  preferredDuration?: number;
  earliestTime: string;
  latestTime: string;
}

export interface Attendee {
  email: string;
  name?: string;
}

export class SmartScheduler {
  private openai: OpenAI;
  private calendar: calendar_v3.Calendar;

  constructor(openaiApiKey: string, calendar: calendar_v3.Calendar) {
    this.openai = new OpenAI({
      apiKey: openaiApiKey
    });
    this.calendar = calendar;
  }

  private async getCalendarEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      return [];
    }
  }

  private isWithinTimeRange(
    time: Date,
    range: TimePreference
  ): boolean {
    const hour = time.getUTCHours();
    const minute = time.getUTCMinutes();
    const [startHour, startMinute] = range.start.split(':').map(Number);
    const [endHour, endMinute] = range.end.split(':').map(Number);

    const timeMinutes = hour * 60 + minute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }

  private isPreferredTime(
    time: Date,
    meetingPrefs: MeetingType,
    userPrefs: UserPreferences
  ): boolean {
    const prefs = userPrefs.meetingPreferences[meetingPrefs];
    if (!prefs.preferredTimeRanges || prefs.preferredTimeRanges.length === 0) {
      return true; // No specific time preferences
    }

    return prefs.preferredTimeRanges.some(range =>
      this.isWithinTimeRange(time, range)
    );
  }

  private calculateSlotScore(
    start: Date,
    end: Date,
    request: SchedulingRequest,
    attendees: Attendee[]
  ): { score: number; reason: string } {
    let score = 1.0;
    const reasons: string[] = [];

    // Check if it's within working hours
    const dayOfWeek = start.getDay();
    const workingHours = request.userPrefs.workingHours[dayOfWeek];
    if (!workingHours) {
      return { score: 0, reason: 'Outside of working hours' };
    }

    // Check if it's a preferred or avoided day
    if (request.userPrefs.preferredDays.includes(dayOfWeek)) {
      score *= 1.2;
      reasons.push('Preferred day');
    } else if (request.userPrefs.avoidDays.includes(dayOfWeek)) {
      score *= 0.5;
      reasons.push('Avoided day');
    }

    // Check if it's during preferred time ranges
    if (this.isPreferredTime(start, request.meetingType, request.userPrefs)) {
      score *= 1.3;
      reasons.push('Preferred time range');
    } else {
      score *= 0.01; // Heavily penalize slots outside preferred time ranges
      reasons.push('Outside preferred time range');
    }

    // Check for work domain emails (if applicable)
    const workDomains = ['company.com']; // Add your work domains
    const isWorkMeeting = attendees.every(a => {
      if (!a.email) return false;
      return workDomains.some(domain => a.email.endsWith(domain));
    });

    if (isWorkMeeting && request.userPrefs.defaultContext === 'work') {
      score *= 1.1;
      reasons.push('Work context match');
    }

    return {
      score,
      reason: reasons.join(', ') || 'Standard time slot',
    };
  }

  public async findAvailableSlots(
    request: SchedulingRequest,
    attendees: Attendee[] = []
  ): Promise<SchedulingResult> {
    const suggestedTimes: SchedulingResult['suggestedTimes'] = [];
    const conflicts: SchedulingResult['conflicts'] = [];
    const processedConflicts = new Set<string>(); // Track processed conflicts

    try {
      const { userId, userPrefs, meetingType, earliestTime, latestTime } = request;
      const duration = request.preferredDuration ||
        userPrefs.meetingPreferences[meetingType]?.preferredDuration ||
        30;

      // Get busy times from all relevant calendars
      const calendarsToCheck = userPrefs?.calendarsToCheck || ['primary'];
      const busyTimes: Array<{ start: Date; end: Date }> = [];

      for (const calendarId of calendarsToCheck) {
        const events = await this.getCalendarEvents(
          calendarId,
          earliestTime,
          latestTime
        );

        events.forEach(event => {
          if (event.start?.dateTime && event.end?.dateTime) {
            busyTimes.push({
              start: new Date(event.start.dateTime),
              end: new Date(event.end.dateTime),
            });
          }
        });
      }

      // Sort busy times
      busyTimes.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Find available slots
      let currentTime = new Date(earliestTime);
      const endTime = new Date(latestTime);
      const slotDuration = duration * 60 * 1000; // Convert to milliseconds
      const bufferTime = (userPrefs.minTimeBetweenMeetings || 15) * 60 * 1000;

      while (currentTime < endTime) {
        const slotEnd = new Date(currentTime.getTime() + slotDuration);

        // Check if slot conflicts with any busy time
        const conflict = busyTimes.find(
          busy =>
            (currentTime >= busy.start && currentTime < busy.end) ||
            (slotEnd > busy.start && slotEnd <= busy.end) ||
            (currentTime <= busy.start && slotEnd >= busy.end)
        );

        if (!conflict) {
          const { score, reason } = this.calculateSlotScore(
            currentTime,
            slotEnd,
            request,
            attendees
          );

          if (score > 0) {
            suggestedTimes.push({
              start: currentTime.toISOString(),
              end: slotEnd.toISOString(),
              score,
              reason,
            });
          }

          // Move to next slot (add buffer after the end of the current slot)
          currentTime = new Date(slotEnd.getTime() + bufferTime);
        } else {
          // Only add unique conflicts
          const conflictKey = `${conflict.start.toISOString()}-${conflict.end.toISOString()}`;
          if (!processedConflicts.has(conflictKey)) {
            conflicts.push({
              start: conflict.start.toISOString(),
              end: conflict.end.toISOString(),
              reason: 'Busy time',
            });
            processedConflicts.add(conflictKey);
          }

          // Move to end of conflict
          currentTime = new Date(conflict.end.getTime() + bufferTime);
        }
      }

      // Sort suggested times by score
      suggestedTimes.sort((a, b) => b.score - a.score);

      // Filter out low-scoring suggestions (those far outside preferred times)
      const highScoringTimes = suggestedTimes.filter(slot => {
        const score = parseFloat(slot.score.toString());
        return score >= 0.1; // Only keep reasonably good slots
      });

      return {
        suggestedTimes: highScoringTimes.slice(0, 5), // Return top 5 suggestions
        conflicts: Array.from(new Set(conflicts)), // Ensure unique conflicts
      };
    } catch (error) {
      console.error('Error finding available slots:', error);
      return { suggestedTimes: [], conflicts: [] };
    }
  }
}
