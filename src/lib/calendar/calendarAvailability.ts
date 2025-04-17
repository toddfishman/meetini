import { NextApiRequest } from 'next';
import { addMinutes, addDays, addHours, parseISO, format, isWithinInterval, isBefore } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc, getTimezoneOffset } from 'date-fns-tz';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { prisma } from '../prisma';

interface CalendarBusySlot {
  start: string;
  end: string;
  userEmail?: string;
}

interface GoogleCalendarBusySlot {
  start?: string | null;
  end?: string | null;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface UserWorkingHoursPreference {
  start?: string;
  end?: string;
}

export interface AvailabilityResponse {
  success: boolean;
  availableTimes: TimeSlot[];
  hasUnregisteredParticipants?: boolean;
  unregisteredParticipants?: string[];
  warnings?: string[];
  timezone?: string;
  userPreferences?: any;
}

export async function getAvailability(
  req: NextApiRequest,
  participants: string[],
  timeConstraints?: { startDate?: string; endDate?: string },
  timePreference?: 'morning' | 'afternoon' | 'evening' | string,
  duration: number = 30
): Promise<AvailabilityResponse> {
  console.log('\n==== CALENDAR AVAILABILITY CHECK ====');

  // Initialize arrays for tracking unregistered participants and warnings
  const warnings: string[] = [];
  const unregisteredParticipants: string[] = [];

  // Get user's timezone from request or browser
  const userTimezone = (req.headers['x-timezone'] as string) || 'America/Los_Angeles';
  
  // Get current time in user's timezone and log it for debugging
  const now = new Date();
  const userNow = utcToZonedTime(now, userTimezone);
  
  // Round up to the next 30-minute mark
  const minutes = userNow.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 30) * 30;
  const startTime = addMinutes(userNow, roundedMinutes - minutes);
  
  // If timeConstraints are provided, use those dates
  let searchStart = startTime;
  let searchEnd = addDays(startTime, 14);
  
  if (timeConstraints?.startDate) {
    searchStart = parseISO(timeConstraints.startDate);
    searchStart = utcToZonedTime(searchStart, userTimezone);
  }
  if (timeConstraints?.endDate) {
    searchEnd = parseISO(timeConstraints.endDate);
    searchEnd = utcToZonedTime(searchEnd, userTimezone);
  }
  
  console.log(`Search window: ${format(searchStart, 'yyyy-MM-dd HH:mm')} to ${format(searchEnd, 'yyyy-MM-dd HH:mm')} (${userTimezone})`);
  
  // Ensure participants is a valid array
  const validParticipants = Array.isArray(participants) ? participants : [];
  if (!Array.isArray(participants)) {
    console.warn('Participants is not an array:', participants);
  }
  
  // Fetch user preferences for all participants
  const userPreferences = await fetchUserPreferences(validParticipants);
  
  // Get participant timezones
  const participantTimezones = userPreferences.map(pref => ({
    email: pref.email,
    timezone: pref.timezone || userTimezone
  }));
  
  console.log('Participant timezones:', participantTimezones);
  
  // Define default time ranges based on preference
  let workStart = 9; // Default to 9 AM
  let workEnd = 17;  // Default to 5 PM
  
  // Get preferred days from user preferences
  let preferredDays = getPreferredDays(userPreferences);
  
  // Map string-based time preference to hours
  if (typeof timePreference === 'string') {
    if (timePreference === 'morning' || timePreference.includes('breakfast') || timePreference.includes('coffee')) {
      workStart = 8;
      workEnd = 12;
    } else if (timePreference === 'afternoon' || timePreference.includes('lunch')) {
      workStart = 11.5;  // 11:30 AM
      workEnd = 13.5;    // 1:30 PM
      console.log('Setting lunch time window to 11:30 AM - 1:30 PM');
    } else if (timePreference.includes('happy hour')) {
      workStart = 16; // 4 PM
      workEnd = 18;   // 6 PM
      // Force weekday preference for happy hours
      if (!preferredDays.length) {
        preferredDays = [1, 2, 3, 4, 5]; // Mon-Fri
      }
    } else if (timePreference === 'evening' || timePreference.includes('dinner')) {
      workStart = 18;
      workEnd = 21;
    } else if (timePreference === 'extended') {
      // Extended hours for difficult scheduling situations
      workStart = 7;
      workEnd = 21;
    }
  }
  
  console.log(`Working hours: ${workStart}:00 to ${workEnd}:00`);
  
  // Also get organizer's account
  const token = await getToken({ req });
  let organizerHasAccess = false;
  let organizerEmail = '';
  
  if (token?.email) {
    organizerEmail = token.email as string;
    
    // Remove organizer from the "without access" list if they're the caller
    const organizerIndex = validParticipants.indexOf(organizerEmail);
    if (organizerIndex !== -1) {
      organizerHasAccess = true;
      validParticipants.splice(organizerIndex, 1);
    }
  }
  
  console.log(`Participants without calendar access: ${validParticipants.join(', ')}`);
  
  // IMPORTANT: If we're scheduling with unregistered users, we need to be more
  // conservative with our time proposals 
  const hasUnregisteredParticipants = validParticipants.length > 0;
  
  // Apply working hours from the user's preferences FIRST
  // This ensures user-specified preferences always override the defaults
  const userWorkingHours = token?.email ? applyWorkingHoursPreferences(userPreferences, token.email as string) : null;
  if (userWorkingHours && userWorkingHours.start && userWorkingHours.end) {
    console.log(`Applying user's specific working hours: ${userWorkingHours.start} to ${userWorkingHours.end}`);
    // Parse hours and minutes with proper precision for half-hour preferences
    const startParts = userWorkingHours.start.split(':').map(Number);
    const endParts = userWorkingHours.end.split(':').map(Number);
    
    // Convert to decimal hours for compatibility with existing code
    workStart = startParts[0] + (startParts[1] || 0) / 60;
    workEnd = endParts[0] + (endParts[1] || 0) / 60;
    
    console.log(`Converted to decimal hours: ${workStart} to ${workEnd}`);
  }
  
  // If we have unregistered participants, adjust time suggestions based on common availability
  if (hasUnregisteredParticipants) {
    console.log(`Adjusting time suggestions for ${validParticipants.length} unregistered participants`);
    
    // Make more reasonable time assumptions for unregistered users:
    // - Prefer mid-day hours (10am-3pm) for unknown availability
    // - Prefer weekdays over weekends
    // - Avoid early morning and late evening 
    if (timePreference !== 'extended') {
      if (workStart < 10) workStart = 10;
      if (workEnd > 16) workEnd = 16;
      console.log(`Adjusted working hours for unregistered participants: ${workStart}:00 to ${workEnd}:00`);
    }
  }
  
  // Get busy times for all participants
  const busyTimes: CalendarBusySlot[] = [];
  
  // Track participants who don't have calendar access
  const participantsWithoutAccess: string[] = [...validParticipants];
  
  // Get all participants' calendar accounts
  const participantAccounts = await prisma.calendarAccount.findMany({
    where: {
      user: {
        email: {
          in: validParticipants
        }
      },
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
  });
  
  console.log('CALENDAR DEBUG INFO:');
  console.log(`Organizer email: ${organizerEmail}`);
  console.log(`Organizer has access: ${organizerHasAccess}`);
  console.log(`Valid participants: ${validParticipants.join(', ')}`);
  console.log(`Initial participant accounts found: ${participantAccounts.length}`);
  
  // REGISTERED USERS SECTION: Log detailed information about calendar access
  console.log(`📊 REGISTERED USER ANALYSIS: Checking calendar accounts for all participants`);
  
  // First identify all registered participants whether they have calendar accounts or not
  const registeredUsers = await prisma.user.findMany({
    where: {
      email: {
        in: validParticipants
      }
    },
    include: {
      calendarAccounts: {
        where: {
          provider: 'google'
        }
      }
    }
  });
  
  // Process registered users to add their calendar accounts to our participant accounts list
  if (registeredUsers.length > 0) {
    console.log(`Found ${registeredUsers.length} registered users among participants`);
    
    for (const user of registeredUsers) {
      if (user.calendarAccounts && user.calendarAccounts.length > 0) {
        console.log(`✅ User ${user.email} has ${user.calendarAccounts.length} calendar accounts`);
        
        // For each calendar account, add it to our participant accounts list if it's not already there
        for (const account of user.calendarAccounts) {
          // Check if this account is already in our participant accounts list
          const existingAccount = participantAccounts.find(a => a.id === account.id);
          if (!existingAccount) {
            // Get full account details including user preferences
            const fullAccount = await prisma.calendarAccount.findUnique({
              where: {
                id: account.id
              },
              include: {
                user: {
                  select: {
                    email: true,
                    calendarPreferences: true
                  }
                }
              }
            });
            
            if (fullAccount) {
              console.log(`Adding calendar account for ${user.email} to participant accounts list`);
              participantAccounts.push(fullAccount);
              
              // Remove this user from the "without access" list
              const index = participantsWithoutAccess.indexOf(user.email);
              if (index !== -1) {
                participantsWithoutAccess.splice(index, 1);
                console.log(`✅ Removed ${user.email} from participantsWithoutAccess - calendar account available`);
              }
            }
          }
        }
      } else {
        console.log(`⚠️ User ${user.email} is registered but has no calendar accounts`);
      }
    }
  } else {
    console.log(`No registered users found among participants`);
  }
  
  // After processing all registered users, log the final state
  console.log(`FINAL CALENDAR ACCESS SUMMARY:`);
  console.log(`Using ${participantAccounts.length} calendar accounts: ${participantAccounts.map(a => a.user.email).join(', ')}`);
  console.log(`${participantsWithoutAccess.length} participants without access: ${participantsWithoutAccess.join(', ')}`);
  
  // CRITICAL FUNCTIONALITY: Check for test emails with arrowfish.com domain
  // These should use the organizer's calendar for availability checking
  const testEmails = validParticipants.filter(email => email.includes('arrowfish.com'));
  
  if (testEmails.length > 0) {
    console.log(`🧪 TEST SCENARIO DETECTED: Found ${testEmails.length} test emails with arrowfish.com domain: ${testEmails.join(', ')}`);
    
    // Special case: If the user requesting availability check is also a test email,
    // we need to handle this differently
    const isOrganizerTestEmail = organizerEmail && organizerEmail.includes('arrowfish.com');
    
    if (organizerHasAccess) {
      console.log(`✅ Using organizer's calendar (${organizerEmail}) for test emails`);
      
      // For each test email, we'll add a "duplicate" calendar account using the organizer's data
      if (token?.access_token) {
        // Find organizer account in participant accounts
        const organizerAccount = participantAccounts.find(acc => acc.user.email === organizerEmail);
        
        if (organizerAccount) {
          console.log(`Using existing organizer account for test emails`);
          
          // For each test email, duplicate the organizer's calendar account data
          for (const testEmail of testEmails) {
            console.log(`Creating duplicate account for test email: ${testEmail}`);
            
            // Create a deep copy of the organizer account to avoid reference issues
            const testAccount = JSON.parse(JSON.stringify(organizerAccount));
            testAccount.user.email = testEmail;
            participantAccounts.push(testAccount);
            
            // Remove the test email from the participantsWithoutAccess array
            const indexToRemove = participantsWithoutAccess.indexOf(testEmail);
            if (indexToRemove !== -1) {
              participantsWithoutAccess.splice(indexToRemove, 1);
              console.log(`✅ Removed ${testEmail} from participantsWithoutAccess list`);
            }
            
            // CRITICAL: Also remove from unregisteredParticipants to ensure they aren't treated as such
            const unregIndex = unregisteredParticipants.indexOf(testEmail);
            if (unregIndex !== -1) {
              unregisteredParticipants.splice(unregIndex, 1);
              console.log(`✅ Removed ${testEmail} from unregisteredParticipants list`);
            } else {
              console.log(`ℹ️ ${testEmail} was not in unregisteredParticipants list`);
            }
          }
          
          console.log(`Updated participants without access: ${participantsWithoutAccess.join(', ')}`);
          console.log(`Updated participant accounts (including test accounts): ${participantAccounts.length}`);
          console.log(`Current unregistered participants: ${unregisteredParticipants.join(', ')}`);
        } else {
          console.log(`⚠️ Could not find organizer account to duplicate for test emails`);
        }
      } else {
        console.log(`⚠️ No access token available for organizer`);
      }
    } else if (participantAccounts.length > 0) {
      // If organizer doesn't have access but we have other participant accounts, 
      // use the first available one
      const firstAccount = participantAccounts[0];
      console.log(`🔄 Organizer doesn't have calendar access, using ${firstAccount.user.email}'s calendar for test emails`);
      
      // For each test email, duplicate the first user's calendar account data
      for (const testEmail of testEmails) {
        console.log(`Creating duplicate account for test email: ${testEmail} based on ${firstAccount.user.email}`);
        
        // Create a deep copy to avoid reference issues
        const testAccount = JSON.parse(JSON.stringify(firstAccount));
        testAccount.user.email = testEmail;
        participantAccounts.push(testAccount);
        
        // Remove from both lists
        const indexToRemove = participantsWithoutAccess.indexOf(testEmail);
        if (indexToRemove !== -1) {
          participantsWithoutAccess.splice(indexToRemove, 1);
        }
        
        const unregIndex = unregisteredParticipants.indexOf(testEmail);
        if (unregIndex !== -1) {
          unregisteredParticipants.splice(unregIndex, 1);
        }
      }
    } else {
      console.log(`⚠️ Cannot handle test emails: No calendar accounts available from any participant`);
    }
  }
  
  // After processing all participants and test emails, log the final state
  console.log(`FINAL PARTICIPANT STATUS:`);
  console.log(`Total valid participants: ${validParticipants.length}`);
  console.log(`Participant accounts with calendar: ${participantAccounts.length}`);
  console.log(`Participants without calendar access: ${participantsWithoutAccess.length}`);
  console.log(`Unregistered participants: ${unregisteredParticipants.length}`);
  
  // Always clearly report the test emails situation
  if (testEmails.length > 0) {
    console.log(`Test emails summary: ${testEmails.length} emails (${testEmails.join(', ')})`);
    console.log(`These are ${participantAccounts.some(acc => testEmails.includes(acc.user.email)) ? 'now using calendar data' : 'NOT using calendar data'}`);
  }
  
  // Get busy times for each participant with calendar access
  for (const account of participantAccounts) {
    // Determine the participant's timezone
    const participantTimezone = account.user.calendarPreferences?.timezone || userTimezone;
    console.log(`Getting busy times for ${account.user.email} (${participantTimezone})`);
    
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiresAt?.getTime() || undefined
    });

    const calendar = google.calendar({ version: 'v3', auth });

    try {
      // CRITICAL DEBUG: First verify we can access the calendar by listing events
      console.log(`🧪 TOKEN DEBUG: Testing calendar access for ${account.user.email} with token: ${account.accessToken.substring(0, 10)}...`);
      
      try {
        // Try to get calendar list as a test
        const calendarList = await calendar.calendarList.list({
          maxResults: 1
        });
        console.log(`✅ CALENDAR ACCESS TEST: Successfully accessed calendar API for ${account.user.email}`);
        console.log(`Calendar list items: ${calendarList.data.items?.length || 0}`);
        if (calendarList.data.items && calendarList.data.items.length > 0) {
          console.log(`First calendar: ${calendarList.data.items[0].summary}`);
        }
      } catch (calendarError) {
        console.error(`❌ CALENDAR ACCESS TEST FAILED for ${account.user.email}:`, calendarError);
      }
      
      // Convert search window to UTC for the Google Calendar API
      const searchStartUTC = zonedTimeToUtc(searchStart, userTimezone).toISOString();
      const searchEndUTC = zonedTimeToUtc(searchEnd, userTimezone).toISOString();
      
      console.log(`Calendar query window (UTC): ${searchStartUTC} to ${searchEndUTC}`);
      console.log(`Making freebusy query for ${account.user.email} with timeZone: ${participantTimezone}`);
      
      // Log request parameters for debugging
      console.log(`Freebusy request params:`, {
        timeMin: searchStartUTC,
        timeMax: searchEndUTC,
        items: [{ id: 'primary' }],
        timeZone: participantTimezone
      });
      
      // Try to query with primary calendar ID first
      console.log(`⚠️ DETAILED DEBUG: Making freebusy API call for ${account.user.email}`);
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: searchStartUTC,
          timeMax: searchEndUTC,
          items: [{ id: 'primary' }],
          timeZone: participantTimezone
        }
      });

      // Log the complete response for debugging
      console.log(`⚠️ DETAILED DEBUG: Received raw freebusy response for ${account.user.email}:`, JSON.stringify(busy, null, 2));
      console.log(`⚠️ DETAILED DEBUG: Freebusy data:`, JSON.stringify(busy.data, null, 2));
      console.log(`⚠️ DETAILED DEBUG: Freebusy calendars:`, JSON.stringify(busy.data.calendars, null, 2));
      console.log(`⚠️ DETAILED DEBUG: Primary calendar busy slots:`, JSON.stringify(busy.data.calendars?.primary?.busy, null, 2));

      if (busy.data.calendars?.primary?.busy) {
        console.log(`Found ${busy.data.calendars.primary.busy.length} busy slots for ${account.user.email}`);
        
        // Add the user email to each busy slot for debugging while handling null values
        const userBusySlots = busy.data.calendars.primary.busy
          .filter(slot => slot.start && slot.end) // Filter out any slots with null values
          .map(slot => ({
            start: slot.start as string, // Type assertion, we know it's not null due to filter
            end: slot.end as string, // Type assertion, we know it's not null due to filter
            userEmail: account.user.email
          }));
        
        busyTimes.push(...userBusySlots);
        
        // Print out the first few busy slots for debugging
        if (userBusySlots.length > 0) {
          console.log(`Sample busy slots for ${account.user.email}:`);
          userBusySlots.slice(0, 3).forEach((slot, i) => {
            console.log(`  Slot ${i+1}: ${slot.start} to ${slot.end}`);
          });
        }
      } else {
        console.log(`No busy slots found for ${account.user.email} - calendar might be completely free or there may be an issue`);
      }
    } catch (error) {
      console.error(`Failed to get busy times for ${account.user.email}:`, error);
    }
  }
  
  // Also get access for the organizer if they're not in participant accounts
  if (token?.access_token && organizerEmail && !participantAccounts.some(a => a.user.email === organizerEmail)) {
    try {
      console.log(`Getting busy times for organizer ${organizerEmail}`);
      
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
  
      auth.setCredentials({
        access_token: token.access_token as string,
        refresh_token: token.refresh_token as string || undefined,
        expiry_date: token.accessTokenExpires as number || undefined
      });
  
      const calendar = google.calendar({ version: 'v3', auth });
  
      // CRITICAL DEBUG: Test direct calendar access first
      console.log(`🧪 TOKEN DEBUG: Testing calendar access for organizer ${organizerEmail} with token: ${(token.access_token as string).substring(0, 10)}...`);
      
      try {
        // Try to get calendar list as a test
        const calendarList = await calendar.calendarList.list({
          maxResults: 1
        });
        console.log(`✅ CALENDAR ACCESS TEST: Successfully accessed organizer's calendar API`);
        console.log(`Organizer calendar list items: ${calendarList.data.items?.length || 0}`);
        if (calendarList.data.items && calendarList.data.items.length > 0) {
          console.log(`First calendar: ${calendarList.data.items[0].summary}`);
        }
      } catch (calendarError) {
        console.error(`❌ ORGANIZER CALENDAR ACCESS TEST FAILED:`, calendarError);
      }
      
      // Convert search window to UTC for the Google Calendar API
      const searchStartUTC = zonedTimeToUtc(searchStart, userTimezone).toISOString();
      const searchEndUTC = zonedTimeToUtc(searchEnd, userTimezone).toISOString();
      
      console.log(`⚠️ DETAILED DEBUG: Making organizer freebusy API call`);
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: searchStartUTC,
          timeMax: searchEndUTC,
          items: [{ id: 'primary' }],
          timeZone: userTimezone
        }
      });
      
      // Log the complete response for debugging
      console.log(`⚠️ DETAILED DEBUG: Organizer freebusy data:`, JSON.stringify(busy.data, null, 2));
      console.log(`⚠️ DETAILED DEBUG: Organizer freebusy busy slots:`, JSON.stringify(busy.data.calendars?.primary?.busy, null, 2));
  
      if (busy.data.calendars?.primary?.busy) {
        console.log(`Found ${busy.data.calendars.primary.busy.length} busy slots for organizer ${organizerEmail}`);
        
        const userBusySlots = busy.data.calendars.primary.busy
          .filter(slot => slot.start && slot.end)
          .map(slot => ({
            start: slot.start as string,
            end: slot.end as string,
            userEmail: organizerEmail
          }));
        
        busyTimes.push(...userBusySlots);
        organizerHasAccess = true;
      }
    } catch (error) {
      console.error(`Failed to get busy times for organizer:`, error);
      organizerHasAccess = false;
    }
  }

  // Also add manual events as busy times
  const manualEvents = await prisma.manualEvent.findMany({
    where: {
      user: {
        email: {
          in: validParticipants
        }
      },
      start: {
        gte: searchStart
      },
      end: {
        lte: searchEnd
      }
    }
  });
  
  if (manualEvents.length > 0) {
    console.log(`Found ${manualEvents.length} manual events to mark as busy`);
    
    const manualBusySlots = manualEvents
      .filter(event => event.start && event.end) // Ensure valid dates
      .map(event => ({
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        userEmail: 'manual-event'
      }));
    
    busyTimes.push(...manualBusySlots);
  }

  // We're already using the preferredDays from earlier in the code, so don't redeclare it
  if (preferredDays.length > 0) {
    console.log(`Preferred days: ${preferredDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`);
  } else {
    console.log('No preferred days specified, using all days');
  }
  
  // If we have unregistered participants and no preferred days, 
  // default to weekdays (1-5) as it's more likely to work for professionals
  const effectivePreferredDays = preferredDays.length > 0 
    ? preferredDays 
    : (hasUnregisteredParticipants ? [1, 2, 3, 4, 5] : []);
    
  if (hasUnregisteredParticipants && effectivePreferredDays.length > 0) {
    console.log(`Using effective preferred days for unregistered participants: ${
      effectivePreferredDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
    }`);
  }

  // Generate available slots in user's timezone
  console.log('Generating available slots...');
  const availableSlots: TimeSlot[] = [];
  let currentTime = new Date(searchStart);
  
  // Adjust for working hours precision
  const parseWorkTime = (timeStr: string): {hours: number, minutes: number} => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  };

  // Use the existing working hours but ensure we parse the minutes correctly
  const { hours: workStartHours, minutes: workStartMinutes } = parseWorkTime(`${Math.floor(workStart)}:${Math.round((workStart % 1) * 60).toString().padStart(2, '0')}`);
  const { hours: workEndHours, minutes: workEndMinutes } = parseWorkTime(`${Math.floor(workEnd)}:${Math.round((workEnd % 1) * 60).toString().padStart(2, '0')}`);

  console.log(`Precise work hours: ${workStartHours}:${workStartMinutes} to ${workEndHours}:${workEndMinutes}`);

  // Ensure we only check hours within work day, respecting minutes for precision
  if (currentTime.getHours() < workStartHours || 
      (currentTime.getHours() === workStartHours && currentTime.getMinutes() < workStartMinutes)) {
    // Set to the exact workStart time, preserving minutes for half-hour preferences
    currentTime.setHours(workStartHours, workStartMinutes, 0, 0);
  } else if (currentTime.getHours() > workEndHours || 
            (currentTime.getHours() === workEndHours && currentTime.getMinutes() >= workEndMinutes)) {
    // Move to next day's workStart
    currentTime.setDate(currentTime.getDate() + 1);
    currentTime.setHours(workStartHours, workStartMinutes, 0, 0);
  }
  
  // Store a list of all slots we checked for debugging
  const allSlots: {
    start: Date;
    end: Date;
    isAvailable: boolean;
    conflictsWith?: string[];
  }[] = [];
  
  // Track why slots are being rejected
  const rejectionReasons = new Set<string>();
  
  // Track if we found any slots that were close but didn't work
  const nearMisses: Array<{
    start: Date;
    end: Date;
    reason: string;
  }> = [];
  
  while (isBefore(currentTime, searchEnd)) {
    const currentDay = currentTime.getDay(); // 0-6, where 0 is Sunday
    
    // Skip days that aren't in preferred days, if any preferred days are specified
    if (effectivePreferredDays.length > 0 && !effectivePreferredDays.includes(currentDay)) {
      currentTime = addDays(currentTime, 1);
      currentTime.setHours(workStartHours, workStartMinutes, 0, 0);
      continue;
    }
    
    // Only include times within work hours with precise minute checks
    const isWithinWorkHours = 
      (currentTime.getHours() > workStartHours || 
       (currentTime.getHours() === workStartHours && currentTime.getMinutes() >= workStartMinutes)) && 
      (currentTime.getHours() < workEndHours || 
       (currentTime.getHours() === workEndHours && currentTime.getMinutes() < workEndMinutes));
    
    if (isWithinWorkHours) {
      // Create slot in user's timezone
      const slotStart = new Date(currentTime);
      const slotEnd = addMinutes(slotStart, duration);
      
      // Also check if slot end is within work hours
      const slotEndHour = slotEnd.getHours();
      const slotEndMinute = slotEnd.getMinutes();
      
      const slotEndIsWithinWorkHours = 
        (slotEndHour < workEndHours || 
         (slotEndHour === workEndHours && slotEndMinute <= workEndMinutes));
      
      if (!slotEndIsWithinWorkHours) {
        // Skip to next day if this slot would end after work hours
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(workStartHours, workStartMinutes, 0, 0);
        continue;
      }
      
      // Convert to UTC for comparison with calendar busy times
      const slotStartUTC = zonedTimeToUtc(slotStart, userTimezone);
      const slotEndUTC = zonedTimeToUtc(slotEnd, userTimezone);
      
      // Check if this slot conflicts with any busy times
      const conflicts: string[] = [];
      let isConflicting = false;
      
      // ENHANCED CONFLICT DETECTION - More conservative approach
      // First, check if this slot overlaps with ANY busy time
      isConflicting = busyTimes.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        
        const hasConflict = (
          (slotStartUTC >= busyStart && slotStartUTC < busyEnd) || // Slot start during busy time
          (slotEndUTC > busyStart && slotEndUTC <= busyEnd) || // Slot end during busy time
          (slotStartUTC <= busyStart && slotEndUTC >= busyEnd) || // Busy time contained within slot
          (slotStartUTC >= busyStart && slotEndUTC <= busyEnd)  // Slot completely contained within busy time
        );
        
        if (hasConflict) {
          console.log(`🚨 Conflict detected:
            Proposed slot: ${slotStartUTC.toISOString()} - ${slotEndUTC.toISOString()}
            Conflicts with: ${busy.userEmail || 'Unknown user'}
            Busy time: ${busyStart.toISOString()} - ${busyEnd.toISOString()}
          `);
          if ('userEmail' in busy) {
            conflicts.push(busy.userEmail as string);
          }
        }
        
        return hasConflict;
      });

      // Double-check with manual events as well
      if (!isConflicting) {
        // Get any manual events from the database that overlap with this time slot
        const manualEventsForSlot = await prisma.manualEvent.findMany({
          where: {
            OR: [
              // Event starts during slot
              { start: { gte: slotStartUTC, lt: slotEndUTC } },
              // Event ends during slot
              { end: { gt: slotStartUTC, lte: slotEndUTC } },
              // Event contains slot
              { 
                AND: [
                  { start: { lte: slotStartUTC } },
                  { end: { gte: slotEndUTC } }
                ]
              },
              // Slot contains event
              { 
                AND: [
                  { start: { gte: slotStartUTC } },
                  { end: { lte: slotEndUTC } }
                ]
              }
            ]
          },
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        });
        
        if (manualEventsForSlot.length > 0) {
          isConflicting = true;
          manualEventsForSlot.forEach(event => {
            if (event.user?.email) {
              conflicts.push(event.user.email);
              console.log(`🚫 MANUAL EVENT CONFLICT: Slot ${slotStart.toISOString()} to ${slotEnd.toISOString()} conflicts with manual event for ${event.user.email}`);
            }
          });
        }
      }
      
      // Store this slot for debugging with more details
      allSlots.push({
        start: slotStart,
        end: slotEnd,
        isAvailable: !isConflicting,
        conflictsWith: conflicts.length > 0 ? conflicts : undefined
      });
      
      // Double-check our conflict logic
      if (!isConflicting && conflicts.length > 0) {
        console.log(`⚠️ CRITICAL: Slot marked available despite ${conflicts.length} conflicts:
          Slot: ${slotStart.toISOString()} - ${slotEnd.toISOString()}
          Conflicts with: ${conflicts.join(', ')}
        `);
      }
      
      // If this slot doesn't conflict with any busy times, add it to available slots
      if (!isConflicting) {
        // Add to available slots with just the required properties
        availableSlots.push({
          start: slotStart,
          end: slotEnd
        });
        
        // Log more details for debugging
        if (conflicts.length > 0) {
          console.log(`⚠️ Anomaly: Slot marked available despite conflicts: ${JSON.stringify(conflicts)}`);
        }
      }
    }
    
    // Move to next 30-minute slot
    currentTime = addMinutes(currentTime, 30);
    
    // If we've moved past work hours, go to next day's start time
    if (currentTime.getHours() >= workEnd) {
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(workStart, 0, 0, 0);
    }
  }
  
  // Debug log some information about all the slots we checked
  console.log(`Generated ${availableSlots.length} available slots out of ${allSlots.length} checked`);
  
  // Log the first few conflicts for debugging
  const conflicts = allSlots.filter(slot => !slot.isAvailable).slice(0, 5);
  if (conflicts.length > 0) {
    console.log('Sample conflicts:');
    conflicts.forEach(conflict => {
      console.log(`- ${format(conflict.start, 'yyyy-MM-dd HH:mm')} conflicts with: ${conflict.conflictsWith?.join(', ')}`);
    });
  }
  
  // Sort slots by best match to time preference
  const sortedSlots = sortSlotsByPreference(availableSlots, timePreference);
  
  // Provide rich information about each slot for better AI decision-making
  const richTimeSlots = sortedSlots.slice(0, 10).map(slot => {
    const day = format(slot.start, 'EEEE');
    const date = format(slot.start, 'MMM d');
    const startTime = format(slot.start, 'h:mm a');
    const endTime = format(slot.end, 'h:mm a');
    
    return {
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      readableTime: `${day}, ${date} from ${startTime} to ${endTime}`,
      timeOfDay: getTimeOfDay(slot.start.getHours()),
      isWeekend: [0, 6].includes(slot.start.getDay()),
      dayOfWeek: day
    };
  });
  
  console.log(`Top slot suggestions in ${userTimezone}:`);
  richTimeSlots.slice(0, 3).forEach((slot, i) => {
    console.log(`${i+1}. ${slot.readableTime} (${slot.timeOfDay})`);
  });
  
  // Before returning available slots, apply strict validation
  const validatedSlots = sortedSlots.filter(slot => 
    isValidTimeSlot(slot, busyTimes, {
      start: `${Math.floor(workStart)}:${(workStart % 1) * 60 || '00'}`,
      end: `${Math.floor(workEnd)}:${(workEnd % 1) * 60 || '00'}`
    }, userTimezone)
  );

  console.log(`Found ${validatedSlots.length} valid slots after strict validation`);
  
  // After checking all slots, if we have no available times, provide detailed feedback
  if (validatedSlots.length === 0) {
    let warningMessage = "No available times found. ";
    
    if (rejectionReasons.size > 0) {
      warningMessage += "Here's what we found:\n";
      rejectionReasons.forEach(reason => {
        warningMessage += `- ${formatRejectionReason(reason)}\n`;
      });
    }
    
    // If we have near misses, suggest alternatives
    if (nearMisses.length > 0) {
      warningMessage += "\nHere are some times that were close but didn't work:\n";
      nearMisses.slice(0, 3).forEach(miss => {
        warningMessage += `- ${format(miss.start, 'MMM d, h:mm a')} (${miss.reason})\n`;
      });
      warningMessage += "\nTry adjusting your time preferences or duration for more options.";
    }
    
    return {
      success: false,
      availableTimes: [],
      warnings: [warningMessage],
      hasUnregisteredParticipants: participantsWithoutAccess.length > 0,
      unregisteredParticipants: participantsWithoutAccess,
      timezone: userTimezone,
      userPreferences: {
        workDays: userPreferences.map(pref => pref.workDays),
        workingHours: userWorkingHours,
        timezone: userTimezone,
        meetingPreferences: timePreference ? { timeOfDay: timePreference } : undefined
      }
    };
  }
  
  // After everything is processed, add a final summary log to verify status
  console.log('======== FINAL AVAILABILITY STATUS =========');
  console.log(`Total Participants: ${validParticipants.length}`);
  console.log(`Participants with Calendar Access: ${participantAccounts.length}`);
  console.log(`Participants without Access: ${participantsWithoutAccess.length}`);
  console.log(`Unregistered Participants: ${validParticipants.length - participantAccounts.length}`);
  if (participantAccounts.length === 0) {
    console.log('⚠️ CRITICAL WARNING: No calendar accounts found for any participants!');
    console.log('Falling back to standard working hours only!');
  }
  console.log('=======================================');
  
  // Return properly formatted response
  return {
    success: true,
    availableTimes: validatedSlots,
    hasUnregisteredParticipants: participantsWithoutAccess.length > 0,
    unregisteredParticipants: participantsWithoutAccess,
    warnings: participantsWithoutAccess.length > 0 ? 
      [`No calendar access for: ${participantsWithoutAccess.join(', ')}. Suggested times are based on standard working hours.`] : 
      undefined,
    timezone: userTimezone,
    userPreferences: userPreferences
  };
}

// Helper function to get working hours based on user preferences
function applyWorkingHoursPreferences(preferences: any[], userEmail: string): UserWorkingHoursPreference | null {
  // Find the current user's preferences
  const userPref = preferences.find(pref => pref.email === userEmail);
  
  if (userPref?.workingHours?.start && userPref?.workingHours?.end) {
    console.log(`Found specific working hours for ${userEmail}: ${userPref.workingHours.start} to ${userPref.workingHours.end}`);
    return {
      start: userPref.workingHours.start,
      end: userPref.workingHours.end
    };
  }
  
  // Check if we have a timezone but no working hours - this indicates a partial preference
  if (userPref?.timezone && (!userPref?.workingHours?.start || !userPref?.workingHours?.end)) {
    console.log(`Found partial preference for ${userEmail}, checking UserPreferences table...`);
    // The fetchUserPreferences function now handles checking both tables
  }
  
  // Some logging to help diagnose why preferences might not be found
  if (userEmail) {
    console.log(`Could not find specific working hours for ${userEmail}`);
    console.log(`Available preferences: ${preferences.map(p => p.email).join(', ')}`);
  }
  
  return null;
}

// Get time of day description
function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Get preferred days from user preferences
function getPreferredDays(preferences: any[]): number[] {
  const preferredDays: number[] = [];
  
  // Collect preferred days from all participants
  preferences.forEach(pref => {
    if (pref.workDays && Array.isArray(pref.workDays) && pref.workDays.length > 0) {
      pref.workDays.forEach((day: number) => {
        if (!preferredDays.includes(day)) {
          preferredDays.push(day);
        }
      });
    }
  });
  
  // If no specific preferred days, return empty array (all days)
  return preferredDays;
}

// Sort slots by best match to time preference
function sortSlotsByPreference(slots: TimeSlot[], preference?: string): TimeSlot[] {
  return [...slots].sort((a, b) => {
    // First prioritize weekday vs weekend based on context
    const aIsWeekend = [0, 6].includes(a.start.getDay());
    const bIsWeekend = [0, 6].includes(b.start.getDay());
    
    const prefersWeekend = preference?.includes('weekend');
    const prefersBusiness = preference?.includes('business') || preference?.includes('work');
    const isHappyHour = preference?.includes('happy hour');
    
    // Happy hours should be on weekdays
    if (isHappyHour) {
      if (!aIsWeekend && bIsWeekend) return -1;
      if (aIsWeekend && !bIsWeekend) return 1;
    } else if (prefersWeekend) {
      if (aIsWeekend && !bIsWeekend) return -1;
      if (!aIsWeekend && bIsWeekend) return 1;
    } else if (prefersBusiness) {
      if (!aIsWeekend && bIsWeekend) return -1;
      if (aIsWeekend && !bIsWeekend) return 1;
    }
    
    // Then sort by time of day preference
    const aHour = a.start.getHours();
    const bHour = b.start.getHours();
    
    if (preference?.includes('happy hour')) {
      // Prefer times closer to 4-6 PM
      const aDistance = Math.min(
        Math.abs(aHour - 16), // Distance from 4 PM
        Math.abs(aHour - 17)  // Distance from 5 PM
      );
      const bDistance = Math.min(
        Math.abs(bHour - 16), // Distance from 4 PM
        Math.abs(bHour - 17)  // Distance from 5 PM
      );
      return aDistance - bDistance;
    } else if (preference?.includes('morning') || preference?.includes('breakfast') || preference?.includes('coffee')) {
      return aHour - bHour; // Earlier is better
    } else if (preference?.includes('lunch')) {
      return Math.abs(aHour - 12) - Math.abs(bHour - 12); // Closer to noon is better
    } else if (preference?.includes('evening') || preference?.includes('dinner')) {
      return bHour - aHour; // Later is better (but still within constraints)
    }
    
    // Default to chronological order
    return a.start.getTime() - b.start.getTime();
  });
}

// Fetch user preferences for all participants
export async function fetchUserPreferences(participants: string[]) {
  // First fetch calendar preferences
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
          email: true,
          meetingPreferences: true
        }
      }
    }
  });

  // Now also fetch the more comprehensive UserPreferences if they exist
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

  // Log what we found to help debug
  console.log(`Found ${calendarPreferences.length} CalendarPreferences and ${userPreferences.length} UserPreferences`);
  
  if (userPreferences.length > 0) {
    console.log('User Preferences working hours examples:');
    userPreferences.slice(0, 2).forEach(pref => {
      console.log(`${pref.user.email}: ${JSON.stringify(pref.workingHours)}`);
    });
  }
  
  if (calendarPreferences.length > 0) {
    console.log('Calendar Preferences working hours examples:');
    calendarPreferences.slice(0, 2).forEach(pref => {
      if (pref.workingHours) {
        console.log(`${pref.user.email}: ${JSON.stringify(pref.workingHours)}`);
      } else {
        console.log(`${pref.user.email}: No working hours defined`);
      }
    });
  }

  // Combine the preferences, with UserPreferences taking precedence when both exist
  return participants.map(email => {
    // Find the specific preferences for this email
    const calPref = calendarPreferences.find(pref => pref.user.email === email);
    const userPref = userPreferences.find(pref => pref.user.email === email);
    
    // Log what was found for debugging
    if (userPref) {
      console.log(`Found UserPreferences for ${email} with working hours:`, userPref.workingHours);
    } else if (calPref?.workingHours) {
      console.log(`Found CalendarPreferences for ${email} with working hours:`, calPref.workingHours);
    } else {
      console.log(`Could not find specific working hours for ${email}`);
    }
    
    // If we have UserPreferences, these take priority
    if (userPref) {
      return {
        email,
        workDays: userPref.workDays || [1, 2, 3, 4, 5], // Default to weekdays
        workingHours: userPref.workingHours, // This should be { start: 'HH:MM', end: 'HH:MM' }
        timezone: userPref.timezone,
        meetingPreferences: calPref?.user.meetingPreferences
      };
    }
    
    // Otherwise, fall back to CalendarPreferences
    return {
      email,
      workDays: calPref?.workDays || [1, 2, 3, 4, 5], // Default to weekdays
      workingHours: calPref?.workingHours || { start: '09:00', end: '17:00' },
      timezone: calPref?.timezone || 'UTC',
      meetingPreferences: calPref?.user.meetingPreferences
    };
  });
}

// This function should check if the hour is after the start working hour,
// considering minutes for half-hour precision
const isWithinWorkingHours = (date: Date, workingHours: UserWorkingHoursPreference) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  
  // Parse working hours start
  let workStartHour = 9; // Default
  let workStartMinutes = 0;
  if (workingHours.start) {
    const startParts = workingHours.start.split(':');
    workStartHour = parseInt(startParts[0], 10);
    workStartMinutes = startParts.length > 1 ? parseInt(startParts[1], 10) : 0;
  }
  
  // Parse working hours end
  let workEndHour = 17; // Default
  let workEndMinutes = 0;
  if (workingHours.end) {
    const endParts = workingHours.end.split(':');
    workEndHour = parseInt(endParts[0], 10);
    workEndMinutes = endParts.length > 1 ? parseInt(endParts[1], 10) : 0;
  }
  
  // Compare with proper precision
  const isAfterOrAtStart = hours > workStartHour || (hours === workStartHour && minutes >= workStartMinutes);
  const isBeforeOrAtEnd = hours < workEndHour || (hours === workEndHour && minutes <= workEndMinutes);
  
  return isAfterOrAtStart && isBeforeOrAtEnd;
};

// Add this new validation function
function isValidTimeSlot(
  slot: TimeSlot,
  busyTimes: CalendarBusySlot[],
  workingHours: UserWorkingHoursPreference,
  userTimezone: string
): boolean {
  // Convert slot times to user timezone for comparison
  const slotStart = utcToZonedTime(slot.start, userTimezone);
  const slotEnd = utcToZonedTime(slot.end, userTimezone);
  
  // 1. Check if slot is within working hours
  if (!isWithinWorkingHours(slotStart, workingHours) || !isWithinWorkingHours(slotEnd, workingHours)) {
    console.log(`Slot rejected: Outside working hours ${workingHours.start}-${workingHours.end}`);
    return false;
  }
  
  // 2. Check for any overlap with busy times
  for (const busy of busyTimes) {
    const busyStart = parseISO(busy.start);
    const busyEnd = parseISO(busy.end);
    
    if (isWithinInterval(slotStart, { start: busyStart, end: busyEnd }) ||
        isWithinInterval(slotEnd, { start: busyStart, end: busyEnd }) ||
        isWithinInterval(busyStart, { start: slotStart, end: slotEnd })) {
      console.log(`Slot rejected: Overlaps with busy time ${busy.start}-${busy.end}`);
      return false;
    }
  }
  
  return true;
}

// Helper function to format rejection reasons
function formatRejectionReason(reason: string): string {
  switch (reason) {
    case 'outside_work_hours':
      return "The time falls outside of working hours";
    case 'busy':
      return "One or more participants have calendar conflicts";
    case 'buffer_needed':
      return "Not enough buffer time around existing meetings";
    case 'too_early':
      return "The time is earlier than the participant's preferred start time";
    case 'too_late':
      return "The time is later than the participant's preferred end time";
    default:
      return reason;
  }
}