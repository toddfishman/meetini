import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';
import { prisma } from './prisma';
import { ParsedMeetingRequest } from './openai';

const calendar = google.calendar('v3');

interface TimeSlot {
  start: Date;
  end: Date;
  score: number;  // Higher score means better slot
}

interface CalendarCredentials {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

interface UserPreference {
  workingHours: {
    start: string;
    end: string;
  };
  timezone: string;
  defaultDuration: number;
}

export async function findOptimalTimes(
  req: NextApiRequest,
  participants: string[],
  parsedRequest: ParsedMeetingRequest
): Promise<TimeSlot[]> {
  try {
    const token = await getToken({ req });
    if (!token) throw new Error('No token found');

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    const credentials = token.credentials as CalendarCredentials;
    auth.setCredentials(credentials);

    // Get user preferences for all Meetini users
    const userPreferences = new Map<string, UserPreference>();
    const meetiniUsers = await prisma.user.findMany({
      where: {
        email: {
          in: participants
        }
      },
      include: {
        preferences: true
      }
    });

    meetiniUsers.forEach(user => {
      if (user.preferences) {
        userPreferences.set(user.email, {
          workingHours: user.preferences.workingHours || { start: '09:00', end: '17:00' },
          timezone: user.preferences.timezone || 'America/Los_Angeles',
          defaultDuration: user.preferences.defaultDuration || 30
        });
      }
    });

    // Use timeConstraints from the parsed request
    const timeMin = new Date(parsedRequest.timeConstraints.startDate);
    const timeMax = new Date(parsedRequest.timeConstraints.endDate);
    
    // Only adjust times if they're in the past
    const now = new Date();
    if (timeMin < now) {
      // If the requested time is today, use 15 mins from now
      if (timeMin.toDateString() === now.toDateString()) {
        timeMin.setTime(now.getTime() + 15 * 60000);
      } else {
        // If it's a past date, use 9am tomorrow
        timeMin.setDate(now.getDate() + 1);
        timeMin.setHours(9, 0, 0, 0);
      }
    }

    // If a specific time is requested and it's at least 15 mins in the future
    if (parsedRequest.timeConstraints.specificTime) {
      const [hours, minutes] = parsedRequest.timeConstraints.specificTime.split(':').map(Number);
      const specificTime = new Date(timeMin);
      specificTime.setHours(hours, minutes, 0, 0);
      
      if (specificTime > now) {
        const isAvailable = await checkAvailability(
          specificTime,
          getDurationInMinutes(parsedRequest.preferences.durationType, parsedRequest),
          participants,
          auth,
          userPreferences
        );

        if (isAvailable) {
          const end = new Date(specificTime);
          end.setMinutes(end.getMinutes() + getDurationInMinutes(parsedRequest.preferences.durationType, parsedRequest));
          return [{ start: specificTime, end, score: 100 }];
        }
      }
    }

    // Get free/busy information for all participants
    const freeBusyResponse = await calendar.freebusy.query({
      auth,
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: participants.map(email => ({ id: email }))
      }
    });

    const busySlots = freeBusyResponse.data.calendars || {};

    // Find available slots considering everyone's preferences and availability
    const availableSlots = findAvailableSlots(
      timeMin,
      timeMax,
      busySlots,
      parsedRequest,
      userPreferences
    );

    if (availableSlots.length === 0) {
      throw new Error('No available time slots found that work for all participants');
    }

    // Sort by score (best slots first) and return top 5
    return availableSlots
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

  } catch (error) {
    console.error('Error finding optimal times:', error);
    throw error;
  }
}

async function checkAvailability(
  startTime: Date,
  duration: number,
  participants: string[],
  auth: any,
  userPreferences: Map<string, UserPreference>
): Promise<boolean> {
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + duration);

  // Check calendar availability
  const freeBusyResponse = await calendar.freebusy.query({
    auth,
    requestBody: {
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      items: participants.map(email => ({ id: email }))
    }
  });

  const busySlots = freeBusyResponse.data.calendars || {};

  // Check if anyone is busy
  for (const email of participants) {
    const calendar = busySlots[email];
    if (calendar?.busy && calendar.busy.length > 0) {
      return false;
    }

    // Check against user preferences if they're a Meetini user
    const prefs = userPreferences.get(email);
    if (prefs) {
      const localTime = new Date(startTime.toLocaleString('en-US', { timeZone: prefs.timezone }));
      const [startHour, startMinute] = prefs.workingHours.start.split(':').map(Number);
      const [endHour, endMinute] = prefs.workingHours.end.split(':').map(Number);

      if (
        localTime.getHours() < startHour ||
        (localTime.getHours() === startHour && localTime.getMinutes() < startMinute) ||
        localTime.getHours() > endHour ||
        (localTime.getHours() === endHour && localTime.getMinutes() > endMinute)
      ) {
        return false;
      }
    }
  }

  return true;
}

function findAvailableSlots(
  start: Date,
  end: Date,
  busySlots: any,
  parsedRequest: ParsedMeetingRequest,
  userPreferences: Map<string, UserPreference>
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const duration = getDurationInMinutes(parsedRequest.preferences.durationType, parsedRequest);
  const workingHours = getWorkingHours(parsedRequest.preferences.timePreference, parsedRequest.preferences.locationType);
  const slotInterval = 30; // minutes

  let currentSlot = new Date(start);
  while (currentSlot < end) {
    // Check if this slot works for everyone
    const endTime = new Date(currentSlot);
    endTime.setMinutes(endTime.getMinutes() + duration);

    if (
      isWithinWorkingHours(currentSlot, workingHours) &&
      isSlotAvailable(currentSlot, endTime, busySlots) &&
      isWithinUserPreferences(currentSlot, endTime, userPreferences)
    ) {
      // Calculate a score for this slot based on how ideal it is
      const score = calculateSlotScore(
        currentSlot,
        parsedRequest.preferences.timePreference,
        parsedRequest.preferences.locationType
      );
      
      slots.push({
        start: new Date(currentSlot),
        end: new Date(endTime),
        score
      });
    }

    // Move to next slot
    currentSlot.setMinutes(currentSlot.getMinutes() + slotInterval);
  }

  return slots;
}

function calculateSlotScore(
  time: Date,
  timePreference: string,
  locationType: string
): number {
  let score = 50; // Base score
  const hour = time.getHours();
  const dayOfWeek = time.getDay();

  // Adjust score based on time of day preference
  switch (timePreference) {
    case 'morning':
      score += hour >= 9 && hour <= 11 ? 30 : 0;
      break;
    case 'afternoon':
      score += hour >= 13 && hour <= 15 ? 30 : 0;
      break;
    case 'evening':
      score += hour >= 17 && hour <= 19 ? 30 : 0;
      break;
  }

  // Adjust score based on location type
  switch (locationType) {
    case 'coffee':
      score += hour >= 9 && hour <= 11 ? 20 : -10;
      break;
    case 'restaurant':
      score += (hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 20) ? 20 : -10;
      break;
    case 'bar':
      score += hour >= 16 && hour <= 19 ? 20 : -10;
      break;
    case 'office':
      score += hour >= 10 && hour <= 16 ? 20 : -10;
      break;
  }

  // Prefer weekdays for business meetings
  if (locationType === 'office' || locationType === 'virtual') {
    score += (dayOfWeek >= 1 && dayOfWeek <= 5) ? 10 : -10;
  }

  // Prefer weekends for social meetings
  if (locationType === 'bar' || locationType === 'restaurant') {
    score += (dayOfWeek === 0 || dayOfWeek === 6) ? 10 : 0;
  }

  return Math.max(0, Math.min(100, score)); // Keep score between 0 and 100
}

function getWorkingHours(timePreference?: string, locationType?: string): { start: number; end: number } {
  // First check location type for specific constraints
  switch (locationType) {
    case 'coffee':
      return { start: 8, end: 11 };
    case 'restaurant':
      return { start: 11, end: 21 };
    case 'bar':
      return { start: 16, end: 23 };
    case 'office':
      return { start: 9, end: 17 };
  }

  // If no location type or it's virtual, use time preference
  switch (timePreference) {
    case 'morning':
      return { start: 9, end: 12 };
    case 'afternoon':
      return { start: 12, end: 17 };
    case 'evening':
      return { start: 17, end: 20 };
    default:
      return { start: 9, end: 17 };
  }
}

function isWithinWorkingHours(
  time: Date,
  workingHours: { start: number; end: number }
): boolean {
  const hour = time.getHours();
  return hour >= workingHours.start && hour < workingHours.end;
}

function isSlotAvailable(
  start: Date,
  end: Date,
  busySlots: any
): boolean {
  // Check each participant's calendar
  for (const email in busySlots) {
    const calendar = busySlots[email];
    if (!calendar) continue;

    // Check if the proposed time overlaps with any busy slots
    for (const busy of calendar.busy || []) {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);

      if (
        (start >= busyStart && start < busyEnd) ||
        (end > busyStart && end <= busyEnd) ||
        (start <= busyStart && end >= busyEnd)
      ) {
        return false;
      }
    }
  }

  return true;
}

function getDurationInMinutes(durationType?: string, parsedRequest?: ParsedMeetingRequest): number {
  switch (durationType) {
    case '30min':
      return 30;
    case '1hour':
      return 60;
    case '2hours':
      return 120;
    default:
      // If no duration specified, check if it's a coffee meeting (default 30) or regular meeting (default 60)
      return parsedRequest?.preferences?.locationType === 'coffee' ? 30 : 60;
  }
}

export async function createCalendarEvent(
  req: NextApiRequest,
  eventDetails: {
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    attendees: Array<{ email: string; name?: string }>;
    virtual?: boolean;
  }
): Promise<string> {
  const token = await getToken({ req });
  if (!token?.credentials) {
    throw new Error('No calendar access');
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials(token.credentials as CalendarCredentials);

  const event = {
    summary: eventDetails.summary,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.start.toISOString(),
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: eventDetails.end.toISOString(),
      timeZone: 'America/Los_Angeles',
    },
    attendees: eventDetails.attendees,
    location: eventDetails.location,
    conferenceData: eventDetails.virtual ? {
      createRequest: {
        requestId: `meetini-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    } : undefined,
    guestsCanModify: true,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: true,
    reminders: {
      useDefault: true
    }
  };

  const calendarEvent = await calendar.events.insert({
    auth,
    calendarId: 'primary',
    requestBody: event,
    conferenceDataVersion: eventDetails.virtual ? 1 : 0,
    sendUpdates: 'all'
  });

  return calendarEvent.data.htmlLink || '';
}