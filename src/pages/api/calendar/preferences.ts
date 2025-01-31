import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

interface WorkingHours {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

interface CalendarPreferences {
  workDays: number[];
  workingHours: WorkingHours;
  timezone: string;
}

const defaultPreferences: CalendarPreferences = {
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  workingHours: {
    start: '09:00',
    end: '17:00'
  },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.method === 'GET') {
    try {
      const preferences = await prisma.calendarPreferences.findUnique({
        where: { userId: user.id },
      });

      if (!preferences) {
        return res.status(200).json(defaultPreferences);
      }

      // Return preferences with defaults for any missing values
      return res.status(200).json({
        workDays: preferences.workDays || defaultPreferences.workDays,
        workingHours: preferences.workingHours || defaultPreferences.workingHours,
        timezone: preferences.timezone || defaultPreferences.timezone
      });
    } catch (error) {
      console.error('Failed to fetch calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch calendar preferences' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const { workDays, workingHours, timezone } = req.body as CalendarPreferences;

      // Validate workDays
      if (!Array.isArray(workDays) || !workDays.every(day => typeof day === 'number' && day >= 0 && day <= 6)) {
        return res.status(400).json({ error: 'Invalid work days format' });
      }

      // Validate workingHours
      if (!workingHours || typeof workingHours !== 'object') {
        return res.status(400).json({ error: 'Invalid working hours format' });
      }

      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(workingHours.start) || !timeRegex.test(workingHours.end)) {
        return res.status(400).json({ error: 'Invalid time format' });
      }

      const preferences = await prisma.calendarPreferences.upsert({
        where: { userId: user.id },
        update: {
          workDays,
          workingHours, // Prisma will handle the JSON serialization
          timezone: timezone || defaultPreferences.timezone,
        },
        create: {
          userId: user.id,
          workDays,
          workingHours, // Prisma will handle the JSON serialization
          timezone: timezone || defaultPreferences.timezone,
        },
      });

      // Return the preferences
      return res.status(200).json({
        workDays: preferences.workDays,
        workingHours: preferences.workingHours,
        timezone: preferences.timezone
      });
    } catch (error) {
      console.error('Failed to update calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to update calendar preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 