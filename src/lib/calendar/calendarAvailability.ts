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

interface TimeSlot {
  start: Date;
  end: Date;
}

export async function getAvailability(
  req: NextApiRequest,
  participants: string[],
  timeConstraints?: { startDate?: string; endDate?: string },
  timePreference?: 'morning' | 'afternoon' | 'evening' | string,
  duration: number = 30
) {
  console.log('\n==== CALENDAR AVAILABILITY CHECK ====');

  // Get user's timezone from request or browser
  // Default to America/Los_Angeles if not specified to avoid UTC
  const userTimezone = (req.headers['x-timezone'] as string) || 'America/Los_Angeles';
  console.log(`Using timezone: ${userTimezone}`);
  
  // Get current time in user's timezone and log it for debugging
  const now = new Date();
  const userNow = utcToZonedTime(now, userTimezone);
  console.log(`Current time in user timezone: ${format(userNow, 'yyyy-MM-dd HH:mm:ss')}`);
  
  // Round up to the next 30-minute mark
  const minutes = userNow.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 30) * 30;
  const startTime = addMinutes(userNow, roundedMinutes - minutes);
  
  // If timeConstraints are provided, use those dates
  let searchStart = startTime;
  let searchEnd = addDays(startTime, 14); // Extend default to 2 weeks for more options
  
  if (timeConstraints?.startDate) {
    searchStart = parseISO(timeConstraints.startDate);
    // Convert to user timezone to ensure proper local time
    searchStart = utcToZonedTime(searchStart, userTimezone);
  }
  if (timeConstraints?.endDate) {
    searchEnd = parseISO(timeConstraints.endDate);
    // Convert to user timezone to ensure proper local time
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
  
  // Map string-based time preference to hours
  if (typeof timePreference === 'string') {
    if (timePreference === 'morning' || timePreference.includes('breakfast') || timePreference.includes('coffee')) {
      workStart = 8;
      workEnd = 12;
    } else if (timePreference === 'afternoon' || timePreference.includes('lunch')) {
      workStart = 12;
      workEnd = 17;
    } else if (timePreference === 'evening' || timePreference.includes('dinner') || timePreference.includes('happy hour')) {
      workStart = 17;
      workEnd = 20;
    }
  }
  
  console.log(`Working hours: ${workStart}:00 to ${workEnd}:00`);
  
  // Get busy times for all participants
  const busyTimes: CalendarBusySlot[] = [];
  
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

  // Also get organizer's account
  const token = await getToken({ req });
  if (token?.email && !validParticipants.includes(token.email)) {
    const organizerAccount = await prisma.calendarAccount.findFirst({
      where: {
        user: {
          email: token.email
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
    
    if (organizerAccount) {
      participantAccounts.push(organizerAccount);
    }
  }

  // Log which participants we have calendar access for
  const participantsWithAccess = participantAccounts.map(acc => acc.user.email);
  const participantsWithoutAccess = validParticipants.filter(p => !participantsWithAccess.includes(p));
  
  console.log('Calendar access status:', {
    participantsWithAccess,
    participantsWithoutAccess
  });

  // Apply working hours preferences from participants' calendar settings
  const workingHoursConstraints = applyWorkingHoursPreferences(participantAccounts, workStart, workEnd);
  workStart = workingHoursConstraints.workStart;
  workEnd = workingHoursConstraints.workEnd;
  
  console.log(`Adjusted working hours after preferences: ${workStart}:00 to ${workEnd}:00`);

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
      // Convert search window to UTC for the Google Calendar API
      const searchStartUTC = zonedTimeToUtc(searchStart, userTimezone).toISOString();
      const searchEndUTC = zonedTimeToUtc(searchEnd, userTimezone).toISOString();
      
      console.log(`Calendar query window (UTC): ${searchStartUTC} to ${searchEndUTC}`);
      
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: searchStartUTC,
          timeMax: searchEndUTC,
          items: [{ id: 'primary' }],
          timeZone: participantTimezone
        }
      });

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
      } else {
        console.log(`No busy times found for ${account.user.email}`);
      }
    } catch (error) {
      console.error(`Failed to get busy times for ${account.user.email}:`, error);
      // If we can't get calendar access for a participant, we should warn the user
      throw new Error(`Could not access calendar for ${account.user.email}. They may need to re-grant calendar access.`);
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

  // Apply preferred days constraints from user preferences
  const preferredDays = getPreferredDays(userPreferences);
  
  if (preferredDays.length > 0) {
    console.log(`Preferred days: ${preferredDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`);
  } else {
    console.log('No preferred days specified, using all days');
  }

  // Generate available slots in user's timezone
  console.log('Generating available slots...');
  const availableSlots: TimeSlot[] = [];
  let currentTime = new Date(searchStart);
  
  // Ensure we only check hours within work day
  if (currentTime.getHours() < workStart) {
    currentTime.setHours(workStart, 0, 0, 0);
  } else if (currentTime.getHours() >= workEnd) {
    // Move to next day's workStart
    currentTime.setDate(currentTime.getDate() + 1);
    currentTime.setHours(workStart, 0, 0, 0);
  }
  
  // Store a list of all slots we checked for debugging
  const allSlots: {
    start: Date;
    end: Date;
    isAvailable: boolean;
    conflictsWith?: string[];
  }[] = [];
  
  while (isBefore(currentTime, searchEnd)) {
    const currentDay = currentTime.getDay(); // 0-6, where 0 is Sunday
    
    // Skip days that aren't in preferred days, if any preferred days are specified
    if (preferredDays.length > 0 && !preferredDays.includes(currentDay)) {
      currentTime = addDays(currentTime, 1);
      currentTime.setHours(workStart, 0, 0, 0);
      continue;
    }
    
    // Only include times within work hours based on preference
    const hour = currentTime.getHours();
    if (hour >= workStart && hour < workEnd) {
      // Create slot in user's timezone
      const slotStart = new Date(currentTime);
      const slotEnd = addMinutes(slotStart, duration);
      
      // Convert to UTC for comparison with calendar busy times
      const slotStartUTC = zonedTimeToUtc(slotStart, userTimezone);
      const slotEndUTC = zonedTimeToUtc(slotEnd, userTimezone);
      
      // Check if this slot conflicts with any busy times
      const conflicts: string[] = [];
      
      const isConflicting = busyTimes.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        
        const hasConflict = (
          (slotStartUTC >= busyStart && slotStartUTC < busyEnd) || // Slot start during busy time
          (slotEndUTC > busyStart && slotEndUTC <= busyEnd) || // Slot end during busy time
          (slotStartUTC <= busyStart && slotEndUTC >= busyEnd) // Busy time contained within slot
        );
        
        if (hasConflict && 'userEmail' in busy) {
          conflicts.push(busy.userEmail as string);
        }
        
        return hasConflict;
      });

      // Store this slot for debugging
      allSlots.push({
        start: slotStart,
        end: slotEnd,
        isAvailable: !isConflicting,
        conflictsWith: conflicts.length > 0 ? conflicts : undefined
      });
      
      // Only add available slots
      if (!isConflicting) {
        availableSlots.push({
          start: slotStart,
          end: slotEnd
        });
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
  
  // If any participants don't have calendar access, include that in the response
  const response: any = {
    success: true,
    availableTimes: sortedSlots.slice(0, 10).map(slot => slot.start.toISOString()),
    richTimeInfo: richTimeSlots,
    timezone: userTimezone,
    userPreferences: userPreferences
  };

  if (participantsWithoutAccess.length > 0) {
    response.warning = `No calendar access for: ${participantsWithoutAccess.join(', ')}. Suggested times may not work for them.`;
  }
  
  console.log('==== END CALENDAR AVAILABILITY CHECK ====\n');
  return response;
}

// Helper function to get working hours based on user preferences
function applyWorkingHoursPreferences(accounts: any[], defaultStart: number, defaultEnd: number) {
  // Start with defaults
  let workStart = defaultStart;
  let workEnd = defaultEnd;
  
  // Find earliest start and latest end from all participants
  for (const account of accounts) {
    if (account.user.calendarPreferences?.workingHours) {
      const userWorkingHours = account.user.calendarPreferences.workingHours;
      if (typeof userWorkingHours === 'object') {
        // Parse start and end times
        const start = userWorkingHours.start ? parseInt(userWorkingHours.start.split(':')[0]) : null;
        const end = userWorkingHours.end ? parseInt(userWorkingHours.end.split(':')[0]) : null;
        
        if (start !== null && start > workStart) {
          workStart = start; // Use the later start time
        }
        
        if (end !== null && end < workEnd) {
          workEnd = end; // Use the earlier end time
        }
      }
    }
  }
  
  return { workStart, workEnd };
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
    
    const prefersWeekend = preference?.includes('weekend') || preference?.includes('social');
    const prefersBusiness = preference?.includes('business') || preference?.includes('work');
    
    if (prefersWeekend) {
      if (aIsWeekend && !bIsWeekend) return -1;
      if (!aIsWeekend && bIsWeekend) return 1;
    } else if (prefersBusiness) {
      if (!aIsWeekend && bIsWeekend) return -1;
      if (aIsWeekend && !bIsWeekend) return 1;
    }
    
    // Then sort by time of day preference
    const aHour = a.start.getHours();
    const bHour = b.start.getHours();
    
    if (preference?.includes('morning') || preference?.includes('breakfast') || preference?.includes('coffee')) {
      return aHour - bHour; // Earlier is better
    } else if (preference?.includes('lunch')) {
      return Math.abs(aHour - 12) - Math.abs(bHour - 12); // Closer to noon is better
    } else if (preference?.includes('evening') || preference?.includes('dinner') || preference?.includes('happy hour')) {
      return bHour - aHour; // Later is better (but still within constraints)
    }
    
    // Default to chronological order
    return a.start.getTime() - b.start.getTime();
  });
}

// Fetch user preferences for all participants
async function fetchUserPreferences(participants: string[]) {
  const userPreferences = await prisma.calendarPreferences.findMany({
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
  
  return userPreferences.map(pref => ({
    email: pref.user.email,
    workDays: pref.workDays || [1, 2, 3, 4, 5], // Default to weekdays
    workingHours: pref.workingHours || { start: '09:00', end: '17:00' },
    timezone: pref.timezone || 'UTC',
    meetingPreferences: pref.user.meetingPreferences
  }));
}