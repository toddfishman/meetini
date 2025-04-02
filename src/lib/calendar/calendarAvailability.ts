import { NextApiRequest } from 'next';
import { addMinutes, addDays, addHours, parseISO } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { prisma } from '../prisma';

interface CalendarBusySlot {
  start: string;
  end: string;
}

export async function getAvailability(
  req: NextApiRequest,
  participants: string[],
  timeConstraints?: { startDate?: string; endDate?: string },
  timePreference?: 'morning' | 'afternoon' | 'evening',
  duration: number = 30
) {
  // Get user's timezone from request or default to UTC
  const userTimezone = req.headers['x-timezone'] as string || 'UTC';
  
  // Get current time in user's timezone
  const now = new Date();
  const userNow = utcToZonedTime(now, userTimezone);
  
  // Round up to the next 30-minute mark
  const minutes = userNow.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 30) * 30;
  const startTime = addMinutes(userNow, roundedMinutes - minutes);
  
  // If timeConstraints are provided, use those dates
  let searchStart = startTime;
  let searchEnd = addDays(startTime, 7); // Default to a week from now
  
  if (timeConstraints?.startDate) {
    searchStart = parseISO(timeConstraints.startDate);
  }
  if (timeConstraints?.endDate) {
    searchEnd = parseISO(timeConstraints.endDate);
  }
  
  // Get time ranges based on preference
  let workStart = 9; // Default to 9 AM
  let workEnd = 17;  // Default to 5 PM
  
  if (timePreference === 'morning') {
    workStart = 9;
    workEnd = 12;
  } else if (timePreference === 'afternoon') {
    workStart = 12;
    workEnd = 17;
  } else if (timePreference === 'evening') {
    workStart = 17;
    workEnd = 20;
  }
  
  // Get busy times for all participants
  const busyTimes: CalendarBusySlot[] = [];
  
  // Get all participants' calendar accounts
  const participantAccounts = await prisma.calendarAccount.findMany({
    where: {
      user: {
        email: {
          in: [...participants, (await getToken({ req })).email] // Include organizer
        }
      },
      provider: 'google'
    },
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });

  // Log which participants we have calendar access for
  const participantsWithAccess = participantAccounts.map(acc => acc.user.email);
  const participantsWithoutAccess = participants.filter(p => !participantsWithAccess.includes(p));
  
  console.log('Calendar access status:', {
    participantsWithAccess,
    participantsWithoutAccess
  });

  // Get busy times for each participant with calendar access
  for (const account of participantAccounts) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiresAt.getTime()
    });

    const calendar = google.calendar({ version: 'v3', auth });

    try {
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: searchStart.toISOString(),
          timeMax: searchEnd.toISOString(),
          items: [{ id: 'primary' }]
        }
      });

      if (busy.data.calendars?.primary?.busy) {
        busyTimes.push(...busy.data.calendars.primary.busy);
      }
    } catch (error) {
      console.error(`Failed to get busy times for ${account.user.email}:`, error);
      // If we can't get calendar access for a participant, we should warn the user
      throw new Error(`Could not access calendar for ${account.user.email}. They may need to re-grant calendar access.`);
    }
  }

  // Generate available slots
  const availableSlots = [];
  let currentTime = searchStart;
  
  while (currentTime < searchEnd) {
    // Only include times within work hours based on preference
    const hour = currentTime.getHours();
    if (hour >= workStart && hour < workEnd) {
      const slotStart = zonedTimeToUtc(currentTime, userTimezone);
      const slotEnd = zonedTimeToUtc(addMinutes(currentTime, duration), userTimezone);
      
      // Check if this slot conflicts with any busy times
      const isConflicting = busyTimes.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return (
          (slotStart >= busyStart && slotStart < busyEnd) || // Slot start during busy time
          (slotEnd > busyStart && slotEnd <= busyEnd) || // Slot end during busy time
          (slotStart <= busyStart && slotEnd >= busyEnd) // Busy time contained within slot
        );
      });

      if (!isConflicting) {
        availableSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString()
        });
      }
    }
    currentTime = addMinutes(currentTime, 30);
  }
  
  // If any participants don't have calendar access, include that in the response
  const response: any = {
    success: true,
    availableTimes: availableSlots.map(slot => slot.start).slice(0, 5), // Return first 5 available slots
    timezone: userTimezone
  };

  if (participantsWithoutAccess.length > 0) {
    response.warning = `No calendar access for: ${participantsWithoutAccess.join(', ')}. Suggested times may not work for them.`;
  }

  return response;
}