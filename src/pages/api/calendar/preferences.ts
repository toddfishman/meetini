import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      // First check for UserPreferences as it takes precedence
      const userPreferences = await prisma.userPreferences.findUnique({
        where: { userId: user.id },
      });

      if (userPreferences) {
        return res.status(200).json({
          workDays: userPreferences.workDays || defaultPreferences.workDays,
          workingHours: userPreferences.workingHours || defaultPreferences.workingHours,
          timezone: userPreferences.timezone || defaultPreferences.timezone
        });
      }

      // Fall back to CalendarPreferences if UserPreferences doesn't exist
      const calendarPreferences = await prisma.calendarPreferences.findUnique({
        where: { userId: user.id },
      });

      if (!calendarPreferences) {
        return res.status(200).json(defaultPreferences);
      }

      // Return preferences with defaults for any missing values
      return res.status(200).json({
        workDays: calendarPreferences.workDays || defaultPreferences.workDays,
        workingHours: calendarPreferences.workingHours || defaultPreferences.workingHours,
        timezone: calendarPreferences.timezone || defaultPreferences.timezone
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

      // Check if UserPreferences exists
      const userPreferences = await prisma.userPreferences.findUnique({
        where: { userId: user.id },
      });

      let updatedPreferences;
      
      if (userPreferences) {
        // Update UserPreferences if it exists
        console.log('Updating UserPreferences with calendar settings');
        updatedPreferences = await prisma.userPreferences.update({
          where: { userId: user.id },
          data: {
            workDays,
            workingHours: workingHours as any, // Type assertion for Prisma JSON handling
            timezone: timezone || defaultPreferences.timezone,
          },
        });
      } else {
        // Create UserPreferences if it doesn't exist
        console.log('Creating new UserPreferences with calendar settings');
        // Include some reasonable defaults for required fields
        updatedPreferences = await prisma.userPreferences.create({
          data: {
            userId: user.id,
            workDays,
            workingHours: workingHours as any, // Type assertion for Prisma JSON handling
            timezone: timezone || defaultPreferences.timezone,
            bufferTime: 15,
            maxMeetingsPerDay: 8,
            calendarVisibility: { work: true, personal: true },
            focusTimeBlocks: [],
            noGoZones: [],
            preferredPlatforms: ['Google Meet'],
            personalEvents: [],
            mealTimes: [{ type: 'lunch', start: '12:00', end: '13:00' }],
          },
        });
      }

      // For backward compatibility, also update CalendarPreferences
      await prisma.calendarPreferences.upsert({
        where: { userId: user.id },
        update: {
          workDays,
          workingHours: workingHours as any, // Type assertion for Prisma JSON handling
          timezone: timezone || defaultPreferences.timezone,
        },
        create: {
          userId: user.id,
          workDays,
          workingHours: workingHours as any, // Type assertion for Prisma JSON handling
          timezone: timezone || defaultPreferences.timezone,
        },
      });

      // Return the preferences
      return res.status(200).json({
        workDays: updatedPreferences.workDays,
        workingHours: updatedPreferences.workingHours,
        timezone: updatedPreferences.timezone
      });
    } catch (error) {
      console.error('Failed to update calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to update calendar preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 