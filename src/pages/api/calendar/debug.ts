import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { getAvailability } from '@/lib/calendar/calendarAvailability';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure authenticated
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request
    const { participants, start, end, calendarId = 'primary' } = req.body;
    
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Participants array is required' });
    }
    
    // Run a traditional availability check
    console.log('Running regular availability check...');
    const availability = await getAvailability(
      req, 
      participants, 
      { startDate: start, endDate: end },
      'all-day', 
      30
    );
    
    // Also test direct Google Calendar freebusy query
    console.log('Testing direct Google Calendar freebusy query...');
    const token = await getToken({ req });
    
    // Get the user's calendar account
    const calendarAccount = await prisma.calendarAccount.findFirst({
      where: {
        user: {
          email: session.user.email
        },
        provider: 'google'
      }
    });
    
    if (!calendarAccount) {
      return res.status(404).json({ 
        error: 'Calendar account not found',
        availability
      });
    }
    
    // Initialize the Google Calendar API client
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    auth.setCredentials({
      access_token: calendarAccount.accessToken,
      refresh_token: calendarAccount.refreshToken,
      expiry_date: calendarAccount.expiresAt?.getTime() || undefined
    });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Run a direct freebusy query
    console.log(`Making direct freebusy query for ${session.user.email}`);
    const busy = await calendar.freebusy.query({
      requestBody: {
        timeMin: start || new Date().toISOString(),
        timeMax: end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ id: calendarId }]
      }
    });
    
    // Get actual calendar events as well
    const events = await calendar.events.list({
      calendarId,
      timeMin: start || new Date().toISOString(),
      timeMax: end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    // Get all users preferences for comparison
    const userPreferences = await prisma.userPreferences.findMany({
      where: {
        user: {
          email: {
            in: participants
          }
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });
    
    const calendarPreferences = await prisma.calendarPreferences.findMany({
      where: {
        user: {
          email: {
            in: participants
          }
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });
    
    return res.status(200).json({
      message: 'Calendar availability debug data',
      availability,
      freebusy: busy.data,
      events: events.data.items,
      preferencesInfo: {
        userPreferences: userPreferences.map(pref => ({
          email: pref.user.email,
          workingHours: pref.workingHours,
          workDays: pref.workDays,
          timezone: pref.timezone
        })),
        calendarPreferences: calendarPreferences.map(pref => ({
          email: pref.user.email,
          workingHours: pref.workingHours,
          workDays: pref.workDays,
          timezone: pref.timezone
        }))
      }
    });
  } catch (error) {
    console.error('Calendar debug error:', error);
    return res.status(500).json({
      error: 'Failed to get calendar debug data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 