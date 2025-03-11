import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { emails } = req.body;
    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails must be an array' });
    }

    console.log('Checking user statuses for:', emails);

    // Find all users with the given emails
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: emails.map(email => email.toLowerCase())
        }
      },
      select: {
        email: true,
        name: true,
        calendarPreferences: true
      }
    });

    console.log('Found users:', users);

    // Create a map of email to user status and preferences
    const userStatuses = Object.fromEntries(
      emails.map(email => [
        email.toLowerCase(),
        {
          isMeetiniUser: false,
          preferences: null,
          name: null
        }
      ])
    );

    // Update the map with found users
    users.forEach(user => {
      userStatuses[user.email.toLowerCase()] = {
        isMeetiniUser: true,
        preferences: user.calendarPreferences,
        name: user.name
      };
    });

    console.log('Final user statuses:', userStatuses);

    return res.status(200).json({ users: userStatuses });
  } catch (error) {
    console.error('Error checking user status:', error);
    return res.status(500).json({ 
      error: 'Failed to check user status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
