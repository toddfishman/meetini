import { getToken } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';

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
    if (!token?.accessToken) throw new Error('No token found');

    // Calculate time range based on preferences
    const now = new Date();
    const timeMin = new Date(now);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 14); // Look 2 weeks ahead

    // Get free/busy information for all participants
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: participants.map(email => ({ id: email })),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    const busySlots = Object.values(data.calendars || {}).flatMap(
      (calendar: any) => calendar.busy || []
    );

    // Find available slots
    return findAvailableSlots(timeMin, timeMax, busySlots, preferences);
  } catch (error) {
    console.error('Failed to find optimal times:', error);
    return [];
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
  const duration = getDurationInMinutes(preferences.durationType);
  const workingHours = getWorkingHours(preferences.timePreference);

  let current = new Date(start);
  while (current < end) {
    const slotEnd = new Date(current.getTime() + duration * 60000);

    if (
      isWithinWorkingHours(current, workingHours) &&
      isSlotAvailable(current, slotEnd, busySlots)
    ) {
      availableSlots.push({
        start: new Date(current),
        end: slotEnd,
      });
    }

    // Move to next 30-minute slot
    current.setMinutes(current.getMinutes() + 30);
  }

  return availableSlots;
}

function getDurationInMinutes(durationType?: string): number {
  switch (durationType) {
    case '30min':
      return 30;
    case '1hour':
      return 60;
    case '2hours':
      return 120;
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
      return { start: 17, end: 21 };
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
  busySlots: Array<{ start: string; end: string }>
): boolean {
  return !busySlots.some(busy => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    return (
      (start >= busyStart && start < busyEnd) ||
      (end > busyStart && end <= busyEnd) ||
      (start <= busyStart && end >= busyEnd)
    );
  });
} 