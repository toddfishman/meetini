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

  async findAvailableSlot({
    timeConstraints,
    duration = 30,
    attendees
  }: {
    timeConstraints: {
      startDate: string;
      endDate: string;
      specificTime?: string;
    };
    duration?: number;
    attendees: { email: string }[];
  }) {
    const startDate = new Date(timeConstraints.startDate);
    const endDate = new Date(timeConstraints.endDate);

    // If a specific time is requested, try that first
    if (timeConstraints.specificTime) {
      const [hours, minutes] = timeConstraints.specificTime.split(':').map(Number);
      const specificDate = new Date(startDate);
      specificDate.setHours(hours, minutes, 0, 0);
      
      if (specificDate >= startDate && specificDate <= endDate) {
        const isAvailable = await this.checkTimeSlotAvailability(
          specificDate,
          duration,
          attendees
        );
        
        if (isAvailable) {
          return specificDate;
        }
      }
    }

    // Otherwise, search for available slots in the time window
    const slotDuration = duration * 60 * 1000; // Convert to milliseconds
    let currentSlot = new Date(startDate);

    while (currentSlot <= endDate) {
      const isAvailable = await this.checkTimeSlotAvailability(
        currentSlot,
        duration,
        attendees
      );

      if (isAvailable) {
        return currentSlot;
      }

      // Move to next slot (try every 30 minutes)
      currentSlot = new Date(currentSlot.getTime() + 30 * 60 * 1000);
    }

    throw new Error('No available time slots found in the specified time window');
  }

  private async checkTimeSlotAvailability(
    startTime: Date,
    duration: number,
    attendees: { email: string }[]
  ): Promise<boolean> {
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    try {
      const responses = await Promise.all(
        attendees.map(({ email }) =>
          this.calendar.freebusy.query({
            requestBody: {
              timeMin: startTime.toISOString(),
              timeMax: endTime.toISOString(),
              items: [{ id: email }]
            }
          })
        )
      );

      // Check if any attendee is busy during this slot
      return !responses.some(response => {
        const calendar = Object.values(response.data.calendars || {})[0];
        return calendar && calendar.busy && calendar.busy.length > 0;
      });
    } catch (error) {
      console.error('Error checking availability:', error);
      return false;
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
      status: 'confirmed',
      transparency: 'opaque',
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
