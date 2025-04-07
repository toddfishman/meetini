import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
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
    const { calendars, start, end } = req.body;
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Default to primary calendar if none specified
    const calendarIds = calendars || ['primary'];
    
    const token = await getToken({ req });
    
    // Get the user's calendar account
    const calendarAccount = await prisma.calendarAccount.findFirst({
      where: {
        user: {
          email: token?.email as string
        },
        provider: 'google'
      }
    });
    
    if (!calendarAccount) {
      return res.status(404).json({ error: 'Calendar account not found' });
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
    console.log(`Making direct freebusy query for: ${calendarIds.join(', ')}`);
    console.log(`Time range: ${start} to ${end}`);
    
    const busy = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        items: calendarIds.map((id: string) => ({ id }))
      }
    });
    
    // Return the raw response
    return res.status(200).json({
      message: 'Free/busy query successful',
      timestamp: new Date().toISOString(),
      requestParams: {
        calendars: calendarIds,
        timeMin: start,
        timeMax: end,
      },
      response: busy.data
    });
  } catch (error) {
    console.error('Free/busy query error:', error);
    return res.status(500).json({
      error: 'Failed to get free/busy data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 