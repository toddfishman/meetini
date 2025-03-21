import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import authOptions from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { Session } from 'next-auth';

interface CustomSession extends Omit<Session, 'user'> {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

const defaultPreferences = {
  workingHours: { start: '09:00', end: '17:00' },
  workDays: [1, 2, 3, 4, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bufferTime: 15,
  maxMeetingsPerDay: 8,
  focusTimeBlocks: [],
  
  // Location Settings
  homeLocation: '',
  officeLocation: '',
  maxTravelTime: 30,
  maxTravelDistance: 5,
  preferredTransport: 'driving',
  gpsEnabled: false,
  noGoZones: [],
  
  // Meeting Preferences
  defaultDuration: 30,
  preferredTimes: [],
  virtualMeetingUrl: '',
  defaultMeetingType: 'virtual',
  preferredPlatforms: ['Google Meet'],
  
  // Personal Time
  personalEvents: [],
  mealTimes: [
    { type: 'lunch', start: '12:00', end: '13:00' }
  ],
  
  // Notification Preferences
  emailNotifications: true,
  smsNotifications: false,
  travelAlerts: true,
  weatherAlerts: true,
  
  // Calendar Settings
  defaultCalendarId: '',
  calendarVisibility: { work: true, personal: true },
  
  // Legacy fields for backward compatibility
  meetingTypes: ['Virtual', 'In Person'],
  virtualPlatforms: ['Zoom', 'Google Meet', 'Microsoft Teams']
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions)) as CustomSession | null;

  console.log('Session object:', JSON.stringify(session, null, 2));

  if (!session?.user?.email) {
    console.log('No authenticated user found in session');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  console.log('Authenticated user:', session.user.email);

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { preferences: true }
  });

  // If user doesn't exist in the database, create it
  if (!user) {
    console.log('User not found in database, creating user:', session.user.email);
    try {
      // Create the user
      const newUser = await prisma.user.create({
        data: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
        }
      });
      
      console.log('User created successfully:', newUser.email);
      
      // Return default preferences
      return res.status(200).json(defaultPreferences);
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  if (req.method === 'GET') {
    try {
      console.log('GET /api/preferences - User:', user.email);
      console.log('User preferences:', user.preferences);
      
      if (!user.preferences) {
        console.log('No preferences found, returning default preferences');
        return res.status(200).json(defaultPreferences);
      }
      
      return res.status(200).json(user.preferences);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const updatedPreferences = await prisma.userPreferences.upsert({
        where: {
          userId: user.id
        },
        create: {
          userId: user.id,
          ...defaultPreferences,
          ...req.body
        },
        update: req.body
      });

      return res.status(200).json(updatedPreferences);
    } catch (error) {
      console.error('Error updating preferences:', error);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}