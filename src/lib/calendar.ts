import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';

const calendar = google.calendar('v3');

interface TimeSlot {
  start: Date;
  end: Date;
}

interface CalendarCredentials {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export async function findOptimalTimes(
  req: NextApiRequest,
  participants: string[],
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
  }
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

    // Calculate time range based on preferences
    const now = new Date();
    const timeMin = new Date(now);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 14); // Look 2 weeks ahead

    // Get free/busy information for all participants
    const freeBusyResponse = await calendar.freebusy.query({
      auth,
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: participants.map(email => ({ id: email })),
      },
    });

    const busySlots = freeBusyResponse.data.calendars || {};
    
    // Find available slots that work for everyone
    const availableSlots = findAvailableSlots(
      timeMin,
      timeMax,
      busySlots,
      preferences
    );

    return availableSlots;
  } catch (error) {
    console.error('Calendar API Error:', error);
    throw new Error('Failed to find optimal meeting times');
  }
}

function findAvailableSlots(
  start: Date,
  end: Date,
  busySlots: any,
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
  }
): TimeSlot[] {
  const availableSlots: TimeSlot[] = [];
  const durationInMinutes = getDurationInMinutes(preferences.durationType);
  const workingHours = getWorkingHours(preferences.timePreference);

  let current = new Date(start);
  while (current < end) {
    // Only check during working hours
    if (isWithinWorkingHours(current, workingHours)) {
      const slotEnd = new Date(current.getTime() + durationInMinutes * 60000);
      
      // Check if this slot works for all participants
      if (isSlotAvailable(current, slotEnd, busySlots)) {
        availableSlots.push({
          start: new Date(current),
          end: slotEnd,
        });
      }
    }
    
    // Move to next 30-minute slot
    current.setMinutes(current.getMinutes() + 30);
  }

  return availableSlots.slice(0, 5); // Return top 5 slots
}

function getDurationInMinutes(durationType?: string): number {
  switch (durationType) {
    case '30min':
      return 30;
    case '2hours':
      return 120;
    case '1hour':
    default:
      return 60;
  }
}

function getWorkingHours(timePreference?: string): { start: number; end: number } {
  switch (timePreference) {
    case 'morning':
      return { start: 9, end: 12 };
    case 'afternoon':
      return { start: 12, end: 17 };
    case 'evening':
      return { start: 17, end: 20 };
    default:
      return { start: 9, end: 20 };
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
  for (const calendar of Object.values(busySlots)) {
    const busy = (calendar as any).busy || [];
    for (const slot of busy) {
      const busyStart = new Date(slot.start);
      const busyEnd = new Date(slot.end);
      
      // Check for overlap
      if (start < busyEnd && end > busyStart) {
        return false;
      }
    }
  }
  
  return true;
} 