import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface MeetingRequest {
  title: string;
  participants: string[];
  startTime: string;
  endTime: string;
  location?: string;
  description?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    
    if (!session?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { title, participants, startTime, endTime, location, description } = req.body as MeetingRequest;

    // Validate required fields
    if (!title || !participants?.length || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Set up Google OAuth2 client
    const oauth2Client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });

    oauth2Client.setCredentials({
      access_token: session.accessToken,
    });

    // Initialize Google Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Create calendar event
    const event: calendar_v3.Schema$Event = {
      summary: title,
      location,
      description,
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: participants.map(email => ({ email })),
      reminders: {
        useDefault: true,
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Send email notifications to attendees
    });

    return res.status(200).json({
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
    });
  } catch (error) {
    console.error('Calendar event creation error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create calendar event',
    });
  }
} 
