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

export async function findAvailableSlots(
  participants: { userId: string; provider: CalendarProvider }[],
  startDate: string,
  endDate: string,
  duration: number, // in minutes
  preferences?: CalendarPreferences
): Promise<TimeSlot[]> {
  try {
    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        participants,
        startDate,
        endDate,
        duration,
        preferences
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to find available slots');
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to find available slots:', error);
    throw error;
  }
}