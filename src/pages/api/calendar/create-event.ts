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

    const parsedRequest = req.body as ParsedMeetingRequest;
    console.log('Parsed request:', parsedRequest); // Debug log

    // Validate required fields
    if (!parsedRequest.title || !parsedRequest.participants?.length) {
      console.error('Missing required fields:', parsedRequest);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate start and end times based on preferences
    const now = DateTime.now();
    let startTime = now;
    
    // Set time based on preference
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
        startTime = now.plus({ hours: 1 }); // Default to 1 hour from now
    }

    // If the time has already passed today, schedule for tomorrow
    if (startTime < now) {
      startTime = startTime.plus({ days: 1 });
    }

    // Calculate duration in minutes
    let durationMinutes = 60; // default 1 hour
    switch (parsedRequest.preferences.durationType) {
      case '30min':
        durationMinutes = 30;
        break;
      case '2hours':
        durationMinutes = 120;
        break;
    }

    const endTime = startTime.plus({ minutes: durationMinutes });

    // Set up Google OAuth2 client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    );

    console.log('Setting up OAuth client with token');
    oauth2Client.setCredentials({
      access_token: accessToken
    });

    // Initialize Google Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Normalize participant emails: trim, lowercase, and append '@gmail.com' if missing '@'
    const normalizedParticipants = parsedRequest.participants.map(email => {
      let norm = email.trim().toLowerCase();
      if (!norm.includes('@')) {
        norm += '@gmail.com';
      }
      return norm;
    });

    // Validate normalized emails
    const validatedParticipants = normalizedParticipants.filter(email => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    });

    if (validatedParticipants.length === 0) {
      return res.status(400).json({ 
        error: 'No valid email addresses found in participants list',
        originalParticipants: parsedRequest.participants
      });
    }

    try {
      // Create a simpler event object
      const eventRequest = {
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

      console.log('Creating calendar event with request:', {
        ...eventRequest,
        auth: 'present',
        accessToken: accessToken ? 'present' : 'missing'
      });

      try {
        const calendarEvent = await calendar.events.insert(eventRequest);
        console.log('Raw calendar API response:', calendarEvent);

        if (!calendarEvent?.data?.id) {
          throw new Error('Failed to create calendar event - no event ID returned');
        }

        console.log('Calendar event created successfully:', {
          id: calendarEvent.data.id,
          link: calendarEvent.data.htmlLink,
          attendees: calendarEvent.data.attendees?.length || 0,
          creator: calendarEvent.data.creator,
          organizer: calendarEvent.data.organizer,
          status: calendarEvent.data.status
        });

        return res.status(200).json({
          eventId: calendarEvent.data.id,
          htmlLink: calendarEvent.data.htmlLink,
          status: 'success',
          message: 'Calendar event created and invitations sent',
          meetLink: calendarEvent.data.conferenceData?.entryPoints?.[0]?.uri,
          attendees: calendarEvent.data.attendees
        });

      } catch (error) {
        console.error('Calendar API Error:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          requestData: {
            title: parsedRequest.title,
            participantCount: validatedParticipants.length,
            startTime: startTime.toISO(),
            endTime: endTime.toISO(),
            participants: validatedParticipants,
            accessToken: accessToken ? 'present' : 'missing',
            scopes: oauth2Client.credentials.scope
          }
        });

        // Check if it's an authorization error
        if (error instanceof Error && error.message.includes('auth')) {
          return res.status(401).json({
            error: 'Authorization failed',
            details: 'Please try signing in again'
          });
        }

        return res.status(500).json({
          error: 'Failed to create calendar event',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Calendar API Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        requestData: {
          title: parsedRequest.title,
          participantCount: validatedParticipants.length,
          startTime: startTime.toISO(),
          endTime: endTime.toISO()
        }
      });

      return res.status(500).json({
        error: 'Failed to create calendar event',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Calendar API Error:', error);
    return res.status(500).json({
      error: 'Failed to create calendar event',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 
