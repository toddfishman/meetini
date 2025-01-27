import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

interface WorkingHours {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

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

      return res.status(200).json(preferences || {});
    } catch (error) {
      console.error('Failed to fetch calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch calendar preferences' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const { workDays, workingHours, timezone } = req.body;

      // Validate workDays
      if (workDays && (!Array.isArray(workDays) || !workDays.every(day => typeof day === 'number' && day >= 0 && day <= 6))) {
        return res.status(400).json({ error: 'Invalid work days format' });
      }

      // Validate workingHours
      if (workingHours) {
        const hours = workingHours as WorkingHours;
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hours.start || !hours.end || !timeRegex.test(hours.start) || !timeRegex.test(hours.end)) {
          return res.status(400).json({ error: 'Invalid working hours format' });
        }
      }

      const preferences = await prisma.calendarPreferences.upsert({
        where: { userId: user.id },
        update: {
          workDays: workDays || [],
          workingHours: workingHours ? JSON.stringify(workingHours) : null,
          timezone,
        },
        create: {
          userId: user.id,
          workDays: workDays || [],
          workingHours: workingHours ? JSON.stringify(workingHours) : null,
          timezone,
        },
      });

      return res.status(200).json(preferences);
    } catch (error) {
      console.error('Failed to update calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to update calendar preferences' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.calendarPreferences.delete({
        where: { userId: user.id },
      });

      return res.status(200).json({ message: 'Calendar preferences reset' });
    } catch (error) {
      console.error('Failed to reset calendar preferences:', error);
      return res.status(500).json({ error: 'Failed to reset calendar preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 