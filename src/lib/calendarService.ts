import { Session } from 'next-auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';

interface CalendarEventOptions {
  summary: string;
  description?: string;
  attendees: { email: string }[];
  startTime?: string;  // ISO string
  duration?: number;   // minutes
  virtual?: boolean;   // if true, adds Google Meet
}

export class CalendarService {
  private calendar;
  private oauth2Client: OAuth2Client;

  constructor(session: Session) {
    if (!session?.accessToken) {
      throw new Error('No access token found in session');
    }

    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    );

    this.oauth2Client.setCredentials({
      access_token: session.accessToken
    });

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  async createEvent(options: CalendarEventOptions) {
    const startTime = options.startTime 
      ? DateTime.fromISO(options.startTime)
      : DateTime.now().plus({ minutes: 30 }); // Default to 30 mins from now
    
    const endTime = startTime.plus({ minutes: options.duration || 30 });

    const eventRequest = {
      calendarId: 'primary',
      requestBody: {
        summary: options.summary,
        description: options.description,
        start: {
          dateTime: startTime.toISO(),
          timeZone: startTime.zoneName || 'UTC',
        },
        end: {
          dateTime: endTime.toISO(),
          timeZone: endTime.zoneName || 'UTC',
        },
        attendees: options.attendees,
        guestsCanModify: true,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: true,
        reminders: {
          useDefault: true
        },
        conferenceData: options.virtual ? {
          createRequest: {
            requestId: `meetini-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        } : undefined
      },
      conferenceDataVersion: options.virtual ? 1 : 0,
      sendUpdates: 'all'
    };

    try {
      const response = await this.calendar.events.insert(eventRequest);
      return response.data;
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw error;
    }
  }
}
