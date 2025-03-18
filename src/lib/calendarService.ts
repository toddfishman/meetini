import { Session } from 'next-auth';
import { google } from 'googleapis';

export class CalendarService {
  private calendar;

  constructor(session: Session) {
    if (!session?.accessToken) {
      console.error('Calendar Service: No access token available in session');
      throw new Error('No access token available');
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        expiry_date: session.accessTokenExpires
      });

      console.log('Calendar Service: Initialized with credentials', {
        hasAccessToken: !!session.accessToken,
        hasRefreshToken: !!session.refreshToken,
        hasExpiryDate: !!session.accessTokenExpires,
        clientId: !!process.env.GOOGLE_CLIENT_ID,
        clientSecret: !!process.env.GOOGLE_CLIENT_SECRET
      });

      this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
      console.error('Calendar Service: Failed to initialize', error);
      throw error;
    }
  }

  async createEvent({ 
    summary, 
    description, 
    attendees, 
    startTime, 
    duration = 30,
    virtual = true 
  }: {
    summary: string;
    description?: string;
    attendees: { email: string }[];
    startTime: string;
    duration?: number;
    virtual?: boolean;
  }) {
    const start = new Date(startTime);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + duration);

    const event = {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      attendees,
      reminders: {
        useDefault: true
      },
      guestsCanModify: true,
      guestsCanInviteOthers: true,
      guestsCanSeeOtherGuests: true
    };

    if (virtual) {
      Object.assign(event, {
        conferenceData: {
          createRequest: {
            requestId: Date.now().toString(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      });
    }

    try {
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: virtual ? 1 : 0,
        sendNotifications: true,
        requestBody: event
      });

      if (!response.data) {
        throw new Error('No response data from calendar API');
      }

      return response.data;
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw error;
    }
  }
}
