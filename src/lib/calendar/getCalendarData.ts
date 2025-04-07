import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { NextApiRequest } from 'next';
import { getToken } from 'next-auth/jwt';
import { fetchUserPreferences } from './calendarAvailability';

/**
 * Gets calendar data for a specific time range and user
 * This function is used to get calendar data to feed to the OpenAI assistant
 */
export async function getCalendarData(req: NextApiRequest, email: string, calendarId: string, startDate: string, endDate: string) {
  try {
    // Get the user's calendar account
    const calendarAccount = await prisma.calendarAccount.findFirst({
      where: {
        user: {
          email
        },
        provider: 'google'
      }
    });
    
    if (!calendarAccount) {
      throw new Error('No calendar account found');
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
    console.log(`Getting calendar data for: ${calendarId}`);
    console.log(`Time range: ${startDate} to ${endDate}`);
    
    // Get freebusy information
    const busyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate,
        timeMax: endDate,
        items: [{ id: calendarId }]
      }
    });
    
    // Get calendar events
    const eventsResponse = await calendar.events.list({
      calendarId,
      timeMin: startDate,
      timeMax: endDate,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    // Get user preferences
    const token = await getToken({ req });
    const userPreferences = await fetchUserPreferences(
      [token?.email as string]
    );

    return {
      busyTimes: busyResponse.data.calendars?.[calendarId]?.busy || [],
      events: eventsResponse.data.items || [],
      userPreferences,
      timeRange: {
        start: startDate,
        end: endDate
      }
    };
  } catch (error) {
    console.error('Error getting calendar data:', error);
    throw error;
  }
} 