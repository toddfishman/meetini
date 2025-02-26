import { google } from 'googleapis';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';

export type CalendarProvider = 'google' | 'outlook' | 'apple' | 'manual';

interface TimeSlot {
  start: string;
  end: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
}

interface CalendarPreferences {
  workingHours?: {
    start: string; // HH:mm format
    end: string;
  };
  workDays?: number[]; // 0-6, where 0 is Sunday
  timezone?: string;
}

export async function getCalendarEvents(
  userId: string,
  provider: CalendarProvider,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { calendarAccounts: true }
  });

  if (!user) throw new Error('User not found');

  switch (provider) {
    case 'google':
      return getGoogleCalendarEvents(user, startDate, endDate);
    case 'outlook':
      return getOutlookCalendarEvents(user, startDate, endDate);
    case 'apple':
      return getAppleCalendarEvents(user, startDate, endDate);
    case 'manual':
      return getManualCalendarEvents(user, startDate, endDate);
    default:
      throw new Error('Unsupported calendar provider');
  }
}

export async function findAvailableSlots(
  participants: { userId: string; provider: CalendarProvider }[],
  startDate: string,
  endDate: string,
  duration: number, // in minutes
  preferences?: CalendarPreferences
): Promise<TimeSlot[]> {
  // Get all participants' events
  const allEvents = await Promise.all(
    participants.map(async ({ userId, provider }) => {
      return getCalendarEvents(userId, provider, startDate, endDate);
    })
  );

  // Convert to busy slots
  const busySlots = allEvents.flat().map(event => ({
    start: DateTime.fromISO(event.start),
    end: DateTime.fromISO(event.end)
  }));

  // Find free slots
  const start = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);
  const slots: TimeSlot[] = [];

  let current = start;
  while (current < end) {
    const slotEnd = current.plus({ minutes: duration });
    
    // Check if slot is within working hours and work days
    if (isWithinWorkingHours(current, preferences) && isWorkDay(current, preferences)) {
      // Check if slot overlaps with any busy slots
      const isAvailable = !busySlots.some(busy => 
        (current >= busy.start && current < busy.end) ||
        (slotEnd > busy.start && slotEnd <= busy.end) ||
        (current <= busy.start && slotEnd >= busy.end)
      );

      if (isAvailable) {
        slots.push({
          start: current.toISO(),
          end: slotEnd.toISO()
        });
      }
    }

    current = current.plus({ minutes: 30 }); // Check every 30 minutes
  }

  return slots;
}

// Helper functions
function isWithinWorkingHours(
  dateTime: DateTime,
  preferences?: CalendarPreferences
): boolean {
  if (!preferences?.workingHours) return true;

  const [startHour, startMinute] = preferences.workingHours.start.split(':').map(Number);
  const [endHour, endMinute] = preferences.workingHours.end.split(':').map(Number);
  
  const start = dateTime.set({ hour: startHour, minute: startMinute });
  const end = dateTime.set({ hour: endHour, minute: endMinute });

  return dateTime >= start && dateTime < end;
}

function isWorkDay(
  dateTime: DateTime,
  preferences?: CalendarPreferences
): boolean {
  if (!preferences?.workDays?.length) return true;
  return preferences.workDays.includes(dateTime.weekday % 7);
}

// Provider-specific implementations
async function getGoogleCalendarEvents(
  user: any,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const googleAccount = user.calendarAccounts.find(
    (account: any) => account.provider === 'google'
  );
  
  if (!googleAccount?.accessToken) {
    throw new Error('Google Calendar not connected');
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: googleAccount.accessToken });
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate,
    timeMax: endDate,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (response.data.items || []).map((event: any) => ({
    id: event.id,
    title: event.summary,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    location: event.location,
  }));
}

async function getOutlookCalendarEvents(
  user: any,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  // Implement Outlook calendar integration
  return [];
}

async function getAppleCalendarEvents(
  user: any,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  // Implement Apple calendar integration
  return [];
}

async function getManualCalendarEvents(
  user: any,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const manualEvents = await prisma.manualEvent.findMany({
    where: {
      userId: user.id,
      start: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
  });

  return manualEvents.map(event => ({
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    location: event.location || undefined,
  }));
} 