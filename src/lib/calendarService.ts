import { Session } from 'next-auth';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    try {
      console.log(`\n======= CHECKING TIME SLOT AVAILABILITY =======`);
      console.log(`Checking availability for ${attendees.length} attendees from ${startTime.toISOString()} to ${endTime.toISOString()}`);
      console.log(`Using timezone: ${timezone}`);
      
      // Get all attendee emails
      const attendeeEmails = attendees.map(a => a.email);
      console.log(`📋 ALL ATTENDEES: ${attendeeEmails.join(', ')}`);
      
      // CRITICAL: First, look up all registered users from database
      // This ensures we check calendar availability for all registered users
      console.log(`\n🔍 STEP 1: FINDING ALL REGISTERED USERS`);
      
      const registeredUsers = await prisma.user.findMany({
        where: {
          email: {
            in: attendeeEmails
          }
        },
        include: {
          calendarAccounts: {
            where: {
              provider: 'google'
            },
            include: {
              user: {
                select: {
                  email: true,
                  calendarPreferences: true
                }
              }
            }
          }
        }
      });
      
      // Log all registered users and their calendar account status
      if (registeredUsers.length > 0) {
        console.log(`✅ Found ${registeredUsers.length} registered users among ${attendeeEmails.length} participants:`);
        registeredUsers.forEach(user => {
          console.log(`- ${user.email}: ${user.calendarAccounts.length} calendar accounts`);
        });
      } else {
        console.log(`⚠️ NO REGISTERED USERS FOUND among participants. Calendar availability will be less accurate.`);
      }
      
      // Create a map of emails to calendar accounts for efficient lookups
      console.log(`\n🔍 STEP 2: IDENTIFYING USERS WITH CALENDAR ACCESS`);
      const emailToAccount = new Map();
      let totalCalendarAccounts = 0;
      
      // First populate with all registered users who have calendar accounts
      registeredUsers.forEach(user => {
        if (user.calendarAccounts && user.calendarAccounts.length > 0) {
          emailToAccount.set(user.email, user.calendarAccounts[0]);
          totalCalendarAccounts++;
          console.log(`✅ Found calendar account for ${user.email}`);
        } else {
          console.log(`⚠️ User ${user.email} is registered but has no calendar accounts`);
        }
      });
      
      console.log(`📊 CALENDAR ACCESS SUMMARY: Found ${totalCalendarAccounts} calendar accounts for ${attendeeEmails.length} attendees`);
      
      // SECONDARY: Check for test emails (arrowfish.com domain)
      const testEmails = attendeeEmails.filter(email => email.includes('arrowfish.com'));
      if (testEmails.length > 0) {
        console.log(`\n🧪 STEP 3: HANDLING TEST EMAILS: ${testEmails.join(', ')}`);
        
        // Get the current user's email from the session
        let organizerEmail: string | null = null;
        try {
          organizerEmail = this.getOrganizerEmailFromCalendar();
          if (organizerEmail) {
            console.log(`Organizer email: ${organizerEmail}`);
            
            // Check if organizer has a calendar account
            const organizerUser = registeredUsers.find(u => u.email === organizerEmail);
            if (organizerUser && organizerUser.calendarAccounts.length > 0) {
              console.log(`✅ Organizer has calendar access, will use for test emails if needed`);
              
              // Special handling for test emails without calendar access
              for (const testEmail of testEmails) {
                if (!emailToAccount.has(testEmail)) {
                  console.log(`🧪 Setting up test email ${testEmail} to use organizer's calendar account`);
                  emailToAccount.set(testEmail, organizerUser.calendarAccounts[0]);
                  totalCalendarAccounts++;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error getting organizer email:`, error);
        }
      }
      
      // Identify which attendees we don't have calendar access for
      const attendeesWithoutAccess = attendeeEmails.filter(email => !emailToAccount.has(email));
      if (attendeesWithoutAccess.length > 0) {
        console.log(`\n⚠️ No calendar access for: ${attendeesWithoutAccess.join(', ')}`);
      }
      
      // Track unique emails to avoid duplicate checks
      const checkedEmails = new Set();
      
      // Check availability for each attendee with a calendar account
      console.log(`\n🔍 STEP 4: CHECKING CALENDAR AVAILABILITY FOR EACH USER WITH ACCESS`);
      for (const attendee of attendees) {
        const email = attendee.email;
        
        // Skip if already checked
        if (checkedEmails.has(email)) {
          console.log(`Already checked availability for ${email}, skipping`);
          continue;
        }
        
        // Check if this attendee has a calendar account
        if (!emailToAccount.has(email)) {
          console.log(`⚠️ No calendar account for ${email}, cannot check availability`);
          continue;
        }
        
        checkedEmails.add(email);
        const account = emailToAccount.get(email);
        console.log(`Checking calendar availability for ${email}`);
        
        try {
          // Setup auth with this user's credentials
          const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          
          auth.setCredentials({
            access_token: account.accessToken,
            refresh_token: account.refreshToken,
            expiry_date: account.expiresAt?.getTime() || undefined
          });
          
          const userCalendar = google.calendar({ version: 'v3', auth });
          
          // Get all calendars for this user first
          const calendarItems = [];
          
          try {
            // Attempt to get all calendars the user has access to
            const calendarList = await userCalendar.calendarList.list();
            
            if (calendarList.data.items && calendarList.data.items.length > 0) {
              console.log(`Found ${calendarList.data.items.length} calendars for ${email}`);
              
              // Add all calendars to items
              calendarList.data.items.forEach(cal => {
                // Only include calendars the user has not hidden
                if (cal.selected !== false) {
                  calendarItems.push({ id: cal.id });
                  console.log(`Including calendar: ${cal.summary} (${cal.id})`);
                }
              });
            } else {
              // Fallback to primary calendar
              calendarItems.push({ id: 'primary' });
              console.log(`No calendars found for ${email}, falling back to primary`);
            }
          } catch (calError) {
            console.error(`Error getting calendars for ${email}:`, calError);
            // Fallback to primary calendar
            calendarItems.push({ id: 'primary' });
            console.log(`Error getting calendars, falling back to primary`);
          }
          
          // Make the freebusy query with all calendars
          console.log(`Making freebusy API call for ${email} with ${calendarItems.length} calendars`);
          
          const busy = await userCalendar.freebusy.query({
            requestBody: {
              timeMin: startTime.toISOString(),
              timeMax: endTime.toISOString(),
              timeZone: timezone,
              items: calendarItems
            }
          });
          
          // Log summary of response
          console.log(`Received freebusy response for ${email}`);
          
          // Check if there are any busy slots in ANY calendar that conflict with our proposed time
          let isBusy = false;
          
          if (busy.data.calendars) {
            for (const [calId, calData] of Object.entries(busy.data.calendars)) {
              if (calData.busy && calData.busy.length > 0) {
                console.log(`User ${email} is busy on calendar ${calId}`);
                isBusy = true;
                break;
              }
            }
          }
          
          if (isBusy) {
            console.log(`🚫 ${email} is BUSY at this time`);
            return false;
          }
          
          console.log(`✅ ${email} is AVAILABLE at this time across all calendars`);
        } catch (error) {
          console.error(`Error checking availability for ${email}:`, error);
          // If we can't access a user's calendar, assume they're busy
          console.log(`Assuming ${email} is busy due to calendar access error`);
          return false;
        }
      }
      
      // Also check the organizer's calendar (current user) if it's not already checked
      const organizerEmail = this.getOrganizerEmailFromCalendar();
      if (organizerEmail && !checkedEmails.has(organizerEmail)) {
        console.log(`\n🔍 STEP 5: CHECKING ORGANIZER CALENDAR`);
        console.log(`Checking availability for organizer ${organizerEmail}`);
        
        // First get all of the organizer's calendars
        const calendarItems = [];
        
        try {
          // Get all calendars the organizer has access to
          const calendarList = await this.calendar.calendarList.list();
          
          if (calendarList.data.items && calendarList.data.items.length > 0) {
            console.log(`Found ${calendarList.data.items.length} calendars for organizer ${organizerEmail}`);
            
            // Only include calendars that are not hidden
            calendarList.data.items.forEach(cal => {
              if (cal.selected !== false) {
                calendarItems.push({ id: cal.id });
                console.log(`Including organizer calendar: ${cal.summary} (${cal.id})`);
              }
            });
          } else {
            calendarItems.push({ id: 'primary' });
            console.log('No calendars found for organizer, using primary');
          }
        } catch (calError) {
          console.error('Error getting organizer calendars:', calError);
          calendarItems.push({ id: 'primary' });
          console.log('Error getting organizer calendars, falling back to primary');
        }
        
        const busy = await this.calendar.freebusy.query({
          requestBody: {
            timeMin: startTime.toISOString(),
            timeMax: endTime.toISOString(),
            timeZone: timezone,
            items: calendarItems
          }
        });
        
        // Check if organizer is busy on ANY of their calendars
        let organizerIsBusy = false;
        
        if (busy.data.calendars) {
          for (const [calId, calData] of Object.entries(busy.data.calendars)) {
            if (calData.busy && calData.busy.length > 0) {
              console.log(`Organizer ${organizerEmail} is busy on calendar ${calId}`);
              organizerIsBusy = true;
              break;
            }
          }
        }
        
        if (organizerIsBusy) {
          console.log(`🚫 Organizer ${organizerEmail} is BUSY at this time`);
          return false;
        }
        
        console.log(`✅ Organizer ${organizerEmail} is AVAILABLE at this time across all calendars`);
      }
      
      // If we've checked all available calendars and none are busy, consider the time available
      console.log(`\n✅ AVAILABILITY SUMMARY: All users with calendar access are available at this time`);
      console.log(`Attendees checked: ${[...checkedEmails].join(', ')}`);
      console.log(`Attendees without access: ${attendeesWithoutAccess.join(', ')}`);
      console.log(`======= END AVAILABILITY CHECK =======\n`);
      return true;
    } catch (error) {
      console.error('Error checking availability:', error);
      return false;
    }
  }
  
  private getOrganizerEmailFromCalendar(): string | null {
    try {
      const calendar = this.calendar as any;
      if (calendar && calendar._options && calendar._options.auth && calendar._options.auth.credentials) {
        // Try to extract email from tokeninfo
        return calendar._options.auth.credentials.email || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting organizer email:', error);
      return null;
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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const event = {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: timezone
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: timezone
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

  /**
   * Get raw freebusy data from Google Calendar for a specific time range
   * This method is useful for debugging calendar availability issues
   */
  async getFreeBusyData(startTime: Date, endTime: Date) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log(`Getting freebusy data from ${startTime.toISOString()} to ${endTime.toISOString()}`);
    
    try {
      // First get all calendars for the current user
      const calendarItems = [];
      
      try {
        // Get all calendars the user has access to
        const calendarList = await this.calendar.calendarList.list();
        
        if (calendarList.data.items && calendarList.data.items.length > 0) {
          console.log(`Found ${calendarList.data.items.length} calendars for user`);
          
          // Only include calendars that are not hidden
          calendarList.data.items.forEach(cal => {
            if (cal.selected !== false) {
              calendarItems.push({ id: cal.id });
              console.log(`Including calendar: ${cal.summary} (${cal.id})`);
            }
          });
        } else {
          calendarItems.push({ id: 'primary' });
          console.log('No calendars found, using primary');
        }
      } catch (calError) {
        console.error('Error getting calendars:', calError);
        calendarItems.push({ id: 'primary' });
        console.log('Error getting calendars, falling back to primary');
      }
      
      // Make the freebusy query with all calendars
      console.log(`Making freebusy API call with ${calendarItems.length} calendars`);
      
      const busy = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          timeZone: timezone,
          items: calendarItems
        }
      });
      
      return {
        calendars: busy.data.calendars || {},
        timeZone: timezone,
        calendarCount: calendarItems.length,
        calendarIds: calendarItems.map(item => item.id),
        rawResponse: busy.data
      };
    } catch (error) {
      console.error('Error getting freebusy data:', error);
      throw error;
    }
  }
}
