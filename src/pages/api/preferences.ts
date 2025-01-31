import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

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
      const preferences = await prisma.meetingPreferences.findUnique({
        where: { userId: user.id },
      });

      // Return default preferences if none exist
      return res.status(200).json(preferences || {
        locationPreferences: {
          preferredTypes: [],
          customLocations: [],
          maxTravelTime: 30,
        },
        virtualMeetings: {
          preferredPlatforms: [],
          defaultLinks: {},
        },
        schedulingRules: {
          preferredTimes: {},
          bufferTime: 15,
          minMeetingLength: 30,
          maxMeetingLength: 120,
          keywords: {},
        },
      });
    } catch (error) {
      console.error('Failed to fetch meeting preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch meeting preferences' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const {
        locationPreferences,
        virtualMeetings,
        schedulingRules,
      } = req.body;

      // Validate the data
      if (!locationPreferences || !virtualMeetings || !schedulingRules) {
        return res.status(400).json({ error: 'Invalid preferences format' });
      }

      const preferences = await prisma.meetingPreferences.upsert({
        where: { userId: user.id },
        update: {
          locationPreferences: JSON.stringify(locationPreferences),
          virtualMeetings: JSON.stringify(virtualMeetings),
          schedulingRules: JSON.stringify(schedulingRules),
        },
        create: {
          userId: user.id,
          locationPreferences: JSON.stringify(locationPreferences),
          virtualMeetings: JSON.stringify(virtualMeetings),
          schedulingRules: JSON.stringify(schedulingRules),
        },
      });

      return res.status(200).json(preferences);
    } catch (error) {
      console.error('Failed to update meeting preferences:', error);
      return res.status(500).json({ error: 'Failed to update meeting preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 