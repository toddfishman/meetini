import { addDays, addWeeks, addMonths, addYears, setDay, getDay } from 'date-fns';
import { prisma } from './prisma';
import type { Recurrence, Invitation } from '@prisma/client';

interface RecurrencePattern {
  frequency: string;
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  count?: number;
}

export async function createRecurringSeries(
  invitation: Invitation,
  pattern: RecurrencePattern,
  startDate: Date
): Promise<void> {
  try {
    // Create the series
    const series = await prisma.series.create({
      data: {
        title: invitation.title,
        createdBy: invitation.createdBy,
        startDate,
        recurrence: {
          create: {
            frequency: pattern.frequency,
            interval: pattern.interval,
            daysOfWeek: pattern.daysOfWeek || [],
            endDate: pattern.endDate,
            count: pattern.count
          }
        }
      }
    });

    // Update the original invitation with series info
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        seriesId: series.id,
        recurrence: {
          create: {
            frequency: pattern.frequency,
            interval: pattern.interval,
            daysOfWeek: pattern.daysOfWeek || [],
            endDate: pattern.endDate,
            count: pattern.count,
            seriesId: series.id
          }
        }
      }
    });

    // Generate future occurrences
    const occurrences = generateOccurrences(startDate, pattern);
    
    // Create invitations for each occurrence (excluding the first one)
    await Promise.all(
      occurrences.slice(1).map(async (date) => {
        await prisma.invitation.create({
          data: {
            title: invitation.title,
            type: invitation.type,
            createdBy: invitation.createdBy,
            seriesId: series.id,
            proposedTimes: [date],
            location: invitation.location,
            participants: {
              create: invitation.participants.map(p => ({
                email: p.email,
                phoneNumber: p.phoneNumber,
                name: p.name,
                notifyByEmail: p.notifyByEmail,
                notifyBySms: p.notifyBySms
              }))
            },
            preferences: invitation.preferences ? {
              create: {
                timePreference: invitation.preferences.timePreference,
                durationType: invitation.preferences.durationType,
                locationType: invitation.preferences.locationType
              }
            } : undefined
          }
        });
      })
    );
  } catch (error) {
    console.error('Failed to create recurring series:', error);
    throw new Error('Failed to create recurring series');
  }
}

export async function updateRecurringSeries(
  seriesId: string,
  pattern: RecurrencePattern,
  startDate: Date
): Promise<void> {
  try {
    // Update the series and its recurrence pattern
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        recurrence: {
          update: {
            frequency: pattern.frequency,
            interval: pattern.interval,
            daysOfWeek: pattern.daysOfWeek || [],
            endDate: pattern.endDate,
            count: pattern.count
          }
        }
      }
    });

    // Delete future occurrences
    await prisma.invitation.deleteMany({
      where: {
        seriesId,
        proposedTimes: {
          some: {
            gt: new Date()
          }
        }
      }
    });

    // Generate new occurrences
    const occurrences = generateOccurrences(startDate, pattern);
    
    // Get the original invitation for the series
    const originalInvitation = await prisma.invitation.findFirst({
      where: { seriesId },
      include: {
        participants: true,
        preferences: true
      }
    });

    if (!originalInvitation) {
      throw new Error('Original invitation not found');
    }

    // Create new invitations for each occurrence
    await Promise.all(
      occurrences.map(async (date) => {
        await prisma.invitation.create({
          data: {
            title: originalInvitation.title,
            type: originalInvitation.type,
            createdBy: originalInvitation.createdBy,
            seriesId,
            proposedTimes: [date],
            location: originalInvitation.location,
            participants: {
              create: originalInvitation.participants.map(p => ({
                email: p.email,
                phoneNumber: p.phoneNumber,
                name: p.name,
                notifyByEmail: p.notifyByEmail,
                notifyBySms: p.notifyBySms
              }))
            },
            preferences: originalInvitation.preferences ? {
              create: {
                timePreference: originalInvitation.preferences.timePreference,
                durationType: originalInvitation.preferences.durationType,
                locationType: originalInvitation.preferences.locationType
              }
            } : undefined
          }
        });
      })
    );
  } catch (error) {
    console.error('Failed to update recurring series:', error);
    throw new Error('Failed to update recurring series');
  }
}

function generateOccurrences(startDate: Date, pattern: RecurrencePattern): Date[] {
  const occurrences: Date[] = [startDate];
  let currentDate = startDate;
  let count = 1;

  while (
    (!pattern.endDate || currentDate < pattern.endDate) &&
    (!pattern.count || count < pattern.count)
  ) {
    let nextDate: Date;

    switch (pattern.frequency) {
      case 'daily':
        nextDate = addDays(currentDate, pattern.interval);
        break;
      case 'weekly':
        if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
          // For weekly recurrence with specific days
          const currentDay = getDay(currentDate);
          const nextDays = pattern.daysOfWeek.filter(day => day > currentDay);
          if (nextDays.length > 0) {
            // There are remaining days this week
            nextDate = setDay(currentDate, nextDays[0]);
          } else {
            // Move to next week and use the first specified day
            nextDate = setDay(addWeeks(currentDate, pattern.interval), pattern.daysOfWeek[0]);
          }
        } else {
          nextDate = addWeeks(currentDate, pattern.interval);
        }
        break;
      case 'monthly':
        nextDate = addMonths(currentDate, pattern.interval);
        break;
      case 'yearly':
        nextDate = addYears(currentDate, pattern.interval);
        break;
      default:
        throw new Error('Invalid frequency');
    }

    occurrences.push(nextDate);
    currentDate = nextDate;
    count++;
  }

  return occurrences;
} 