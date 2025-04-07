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

interface UserWorkingHoursPreference {
  start?: string;
  end?: string;
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
    } else if (timePreference === 'extended') {
      // Extended hours for difficult scheduling situations
      workStart = 7;
      workEnd = 21;
    }
  }
  
  console.log(`Working hours: ${workStart}:00 to ${workEnd}:00`);
  
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
  
  // Remove participants with calendar accounts from the "without access" list
  for (const account of participantAccounts) {
    const index = participantsWithoutAccess.indexOf(account.user.email);
    if (index !== -1) {
      participantsWithoutAccess.splice(index, 1);
    }
  }

  // Also get organizer's account
  const token = await getToken({ req });
  let organizerHasAccess = false;
  let organizerEmail = '';
  
  if (token?.email) {
    organizerEmail = token.email as string;
    
    // Remove organizer from the "without access" list if they're the caller
    const organizerIndex = participantsWithoutAccess.indexOf(organizerEmail);
    if (organizerIndex !== -1) {
      organizerHasAccess = true;
      participantsWithoutAccess.splice(organizerIndex, 1);
    }
  }
  
  console.log(`Participants without calendar access: ${participantsWithoutAccess.join(', ')}`);
  
  // IMPORTANT: If we're scheduling with unregistered users, we need to be more
  // conservative with our time proposals 
  const hasUnregisteredParticipants = participantsWithoutAccess.length > 0;
  
  // If we have unregistered participants, adjust time suggestions based on common availability
  if (hasUnregisteredParticipants) {
    console.log(`Adjusting time suggestions for ${participantsWithoutAccess.length} unregistered participants`);
    
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
      // If we can't get calendar access for a participant, add them back to the without-access list
      if (!participantsWithoutAccess.includes(account.user.email)) {
        participantsWithoutAccess.push(account.user.email);
      }
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
  
      // Convert search window to UTC for the Google Calendar API
      const searchStartUTC = zonedTimeToUtc(searchStart, userTimezone).toISOString();
      const searchEndUTC = zonedTimeToUtc(searchEnd, userTimezone).toISOString();
      
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: searchStartUTC,
          timeMax: searchEndUTC,
          items: [{ id: 'primary' }],
          timeZone: userTimezone
        }
      });
  
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

  // Apply preferred days constraints from user preferences
  const preferredDays = getPreferredDays(userPreferences);
  
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
    userPreferences: userPreferences,
    hasUnregisteredParticipants,
    unregisteredParticipants: participantsWithoutAccess
  };

  if (participantsWithoutAccess.length > 0) {
    response.warning = `No calendar access for: ${participantsWithoutAccess.join(', ')}. Suggested times are based on standard working hours and may not reflect their actual availability.`;
  }
  
  console.log('==== END CALENDAR AVAILABILITY CHECK ====\n');
  return response;
}

// Helper function to get working hours based on user preferences
function applyWorkingHoursPreferences(startTime: Date, endTime: Date, workingHours: UserWorkingHoursPreference): { start: Date, end: Date } {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  try {
    if (workingHours.start) {
      // Parse the hours and minutes
      const startParts = workingHours.start.split(':');
      const startHours = parseInt(startParts[0], 10);
      const startMinutes = startParts.length > 1 ? parseInt(startParts[1], 10) : 0;
      
      // If start time is earlier than working hours, adjust to working hours start
      const currentHours = start.getHours();
      const currentMinutes = start.getMinutes();
      
      if (currentHours < startHours || (currentHours === startHours && currentMinutes < startMinutes)) {
        start.setHours(startHours, startMinutes, 0, 0);
      }
    }
    
    if (workingHours.end) {
      // Parse the hours and minutes
      const endParts = workingHours.end.split(':');
      const endHours = parseInt(endParts[0], 10);
      const endMinutes = endParts.length > 1 ? parseInt(endParts[1], 10) : 0;
      
      // If end time is later than working hours, adjust to working hours end
      const currentHours = end.getHours();
      const currentMinutes = end.getMinutes();
      
      if (currentHours > endHours || (currentHours === endHours && currentMinutes > endMinutes)) {
        end.setHours(endHours, endMinutes, 0, 0);
      }
    }
  } catch (error) {
    console.error('Error parsing working hours preferences:', error);
    // If there's an error, just return the original times
  }
  
  return { start, end };
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