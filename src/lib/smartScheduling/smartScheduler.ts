import OpenAI from 'openai';
import { calendar_v3 } from 'googleapis';
import { UserPreferences, MeetingType, TimePreference } from '../types/preferences.js';
import { CalendarCache } from './calendarCache';

interface SmartSchedulingContext {
  suggestedSlots: Array<{
    start: Date;
    end: Date;
    confidence: number;
    reasoning: string;
  }>;
  meetingContext: {
    type: string;
    duration: number;
    isInPerson: boolean;
    location?: string;
  };
}

interface TimeSlot {
  start: Date;
  end: Date;
}

interface BusyPeriod {
  start: Date;
  end: Date;
  email: string;
}

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
  naturalLanguageInput?: string;
  attendees: Attendee[];
}

export interface Attendee {
  email: string;
  name?: string;
}

export class SmartScheduler {
  private openai: OpenAI;
  private calendar: calendar_v3.Calendar;
  private calendarCache: CalendarCache;

  constructor(openaiApiKey: string, calendar: calendar_v3.Calendar) {
    this.openai = new OpenAI({
      apiKey: openaiApiKey
    });
    this.calendar = calendar;
    this.calendarCache = CalendarCache.getInstance();
  }

  private async analyzeMeetingRequest(
    input: string, 
    attendees: Attendee[],
    busyPeriods: BusyPeriod[]
  ): Promise<SmartSchedulingContext> {
    // First, verify we have calendar data for all attendees
    const attendeeCalendars = new Map<string, BusyPeriod[]>();
    attendees.forEach(attendee => {
      const calendar = busyPeriods.filter(period => period.email === attendee.email);
      attendeeCalendars.set(attendee.email, calendar);
    });

    // Log calendar data for verification
    console.log('Calendar data by attendee:');
    attendeeCalendars.forEach((calendar, email) => {
      console.log(`\n${email} has ${calendar.length} busy periods:`);
      calendar.slice(0, 3).forEach(period => {
        console.log(`- ${period.start.toLocaleString()} to ${period.end.toLocaleString()}`);
      });
      if (calendar.length > 3) console.log(`... and ${calendar.length - 3} more`);
    });

    // Format calendar data for OpenAI
    const formattedCalendars = attendees.map(attendee => {
      const calendar = attendeeCalendars.get(attendee.email) || [];
      return {
        email: attendee.email,
        name: attendee.name,
        busyPeriods: calendar.map(period => ({
          start: period.start.toLocaleString(),
          end: period.end.toLocaleString()
        }))
      };
    });

    const currentTime = new Date();
    const systemPrompt = `You are an intelligent scheduling assistant that understands human context and calendar availability.

Current time: ${currentTime.toLocaleString()}

IMPORTANT RULES:
1. NEVER suggest times for today or tomorrow unless explicitly requested
2. Default to next week for "soon" or unspecified timeframes
3. Morning coffee meetings should be between 9:30 AM and 11:30 AM
4. Consider all attendees' calendars equally important
5. Suggest times that work for EVERYONE
6. Explain your reasoning for each suggested time

Available Calendars:
${formattedCalendars.map(cal => 
  `\n${cal.name} (${cal.email}):
   - Has ${cal.busyPeriods.length} conflicts
   - Next 3 conflicts: ${cal.busyPeriods.slice(0, 3).map(p => 
     `\n     * ${p.start} to ${p.end}`
   ).join('')}`
).join('\n')}`;

    const userPrompt = `Analyze this meeting request: "${input}"

Requirements:
1. Suggest 3-5 specific time slots that work for ALL attendees
2. Each slot must avoid ALL conflicts for ALL attendees
3. For each slot, explain WHY you chose it considering:
   - The type of meeting (coffee = morning preference)
   - Each person's calendar conflicts
   - Lead time (prefer next week unless specified otherwise)
   - Duration (coffee = 30-45 minutes)

Return a JSON object with:
{
  "suggestedSlots": [
    {
      "start": "ISO date string",
      "end": "ISO date string",
      "confidence": 0-1 score,
      "reasoning": "Detailed explanation of why this slot works for everyone"
    }
  ],
  "meetingContext": {
    "type": "COFFEE",
    "duration": 30,
    "isInPerson": true
  }
}`;

    // Log the complete prompt for debugging
    console.log('\nSystem Prompt:', systemPrompt);
    console.log('\nUser Prompt:', userPrompt);

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    console.log('\nOpenAI Response:', JSON.stringify(response, null, 2));

    // Validate the response
    const suggestions = response.suggestedSlots.map(slot => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      
      // Verify this slot doesn't conflict with any calendars
      const hasConflicts = Array.from(attendeeCalendars.values()).some(calendar =>
        calendar.some(busy => 
          (start >= busy.start && start < busy.end) ||
          (end > busy.start && end <= busy.end)
        )
      );

      if (hasConflicts) {
        console.error('OpenAI suggested a time with conflicts:', start, end);
        return null;
      }

      return {
        start,
        end,
        confidence: slot.confidence,
        reasoning: `${slot.reasoning}\n(Verified: No calendar conflicts for any attendee)`
      };
    }).filter(Boolean);

    if (suggestions.length === 0) {
      console.error('No valid conflict-free times were suggested by OpenAI');
    }

    return {
      suggestedSlots: suggestions,
      meetingContext: response.meetingContext
    };
  }

  public async findAvailableSlots(request: SchedulingRequest): Promise<SchedulingResult> {
    try {
      console.time('scheduling');

      // Get all busy periods for all attendees first
      const timeMin = new Date();
      const timeMax = new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days out
      
      console.log('Fetching calendar data for:', request.attendees);
      const busyPeriods = await this.getAllAttendeesEvents(
        timeMin,
        timeMax,
        request.attendees
      );
      console.log('Found busy periods:', busyPeriods);
      
      // Let OpenAI analyze the request and suggest slots
      const analysis = await this.analyzeMeetingRequest(
        request.naturalLanguageInput || '',
        request.attendees,
        busyPeriods
      );
      console.log('Analysis result:', analysis);

      // Convert the suggested slots to the expected format
      const suggestedTimes = analysis.suggestedSlots.map(slot => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        score: slot.confidence,
        reason: slot.reasoning
      }));

      // Sort by confidence
      suggestedTimes.sort((a, b) => b.score - a.score);

      return {
        suggestedTimes,
        conflicts: busyPeriods.map(busy => ({
          start: busy.start.toISOString(),
          end: busy.end.toISOString(),
          reason: `Calendar conflict for ${busy.email}`
        }))
      };
    } catch (error) {
      console.error('Error finding available slots:', error);
      throw error;
    }
  }

  private async getAllAttendeesEvents(
    timeMin: Date,
    timeMax: Date,
    attendees: Attendee[]
  ): Promise<BusyPeriod[]> {
    // Fetch all calendars in parallel using cache
    const calendarPromises = attendees.map(attendee =>
      this.calendarCache.getEvents(attendee.email, timeMin, timeMax, this.calendar)
        .then(events => ({
          email: attendee.email,
          events: events
        }))
    );

    const results = await Promise.all(calendarPromises);

    // Convert all events to BusyPeriods
    const busyPeriods: BusyPeriod[] = [];
    for (const { email, events } of results) {
      for (const event of events) {
        if (event.start?.dateTime && event.end?.dateTime) {
          busyPeriods.push({
            start: new Date(event.start.dateTime),
            end: new Date(event.end.dateTime),
            email
          });
        }
      }
    }

    // Sort by start time for faster processing
    busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());
    return busyPeriods;
  }
}
