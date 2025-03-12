import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';

interface ParsedMeetingRequest {
  title: string;
  participants: string[];
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual';
  };
  location?: string;
  priority?: number;
  notes?: string;
}

interface DirectEventRequest {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  attendees: { email: string }[];
  status?: string;
  transparency?: string;
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
    
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check for access token
    const accessToken = session.accessToken;
    if (!accessToken) {
      console.error('No access token found in session');
      return res.status(401).json({ error: 'No access token found' });
    }

    // Set up Google OAuth2 client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    );

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    // Initialize Google Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Check if this is a direct event request or a parsed meeting request
    const isDirectRequest = 'summary' in req.body && 'start' in req.body;
    
    let eventRequest;
    
    if (isDirectRequest) {
      // Handle direct event creation
      const directEvent = req.body as DirectEventRequest;
      eventRequest = {
        calendarId: 'primary',
        requestBody: {
          ...directEvent,
          guestsCanModify: true,
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: true,
          reminders: {
            useDefault: true
          }
        },
        sendUpdates: 'all'
      };
    } else {
      // Handle parsed meeting request
      const parsedRequest = req.body as ParsedMeetingRequest;
      
      if (!parsedRequest.title || !parsedRequest.participants?.length) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Calculate times based on preferences
      const now = DateTime.now();
      let startTime = now;
      
      switch (parsedRequest.preferences.timePreference) {
        case 'morning':
          startTime = now.set({ hour: 9 });
          break;
        case 'afternoon':
          startTime = now.set({ hour: 13 });
          break;
        case 'evening':
          startTime = now.set({ hour: 17 });
          break;
        default:
          startTime = now.plus({ hours: 1 });
      }

      if (startTime < now) {
        startTime = startTime.plus({ days: 1 });
      }

      let durationMinutes = 60;
      switch (parsedRequest.preferences.durationType) {
        case '30min':
          durationMinutes = 30;
          break;
        case '2hours':
          durationMinutes = 120;
          break;
      }

      const endTime = startTime.plus({ minutes: durationMinutes });

      // Normalize and validate participant emails
      const validatedParticipants = parsedRequest.participants
        .map(email => {
          let norm = email.trim().toLowerCase();
          if (!norm.includes('@')) {
            norm += '@gmail.com';
          }
          return norm;
        })
        .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

      if (validatedParticipants.length === 0) {
        return res.status(400).json({ 
          error: 'No valid email addresses found in participants list',
          originalParticipants: parsedRequest.participants
        });
      }

      eventRequest = {
        calendarId: 'primary',
        requestBody: {
          summary: parsedRequest.title,
          location: parsedRequest.location || (parsedRequest.preferences.locationType === 'virtual' ? 'Google Meet' : undefined),
          description: parsedRequest.notes || 'Meeting scheduled via Meetini',
          start: {
            dateTime: startTime.toISO(),
            timeZone: startTime.zoneName || 'UTC',
          },
          end: {
            dateTime: endTime.toISO(),
            timeZone: endTime.zoneName || 'UTC',
          },
          attendees: validatedParticipants.map(email => ({ 
            email,
            responseStatus: 'needsAction'
          })),
          guestsCanModify: true,
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: true,
          reminders: {
            useDefault: true
          },
          conferenceData: parsedRequest.preferences.locationType === 'virtual' ? {
            createRequest: {
              requestId: `meetini-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          } : undefined
        },
        conferenceDataVersion: parsedRequest.preferences.locationType === 'virtual' ? 1 : 0,
        sendUpdates: 'all'
      };
    }

    try {
      const calendarEvent = await calendar.events.insert(eventRequest);

      if (!calendarEvent?.data?.id) {
        throw new Error('Failed to create calendar event - no event ID returned');
      }

      return res.status(200).json({
        eventId: calendarEvent.data.id,
        htmlLink: calendarEvent.data.htmlLink,
        status: 'success',
        message: 'Calendar event created and invitations sent',
        meetLink: calendarEvent.data.conferenceData?.entryPoints?.[0]?.uri,
        attendees: calendarEvent.data.attendees
      });

    } catch (error) {
      console.error('Calendar API Error:', error);
      return res.status(500).json({ 
        error: 'Failed to create calendar event',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
