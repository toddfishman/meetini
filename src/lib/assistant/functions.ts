import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { searchEmailContacts } from '@/lib/google';
import { getAvailability, AvailabilityResponse as CalendarAvailabilityResponse, TimeSlot } from '@/lib/calendar/calendarAvailability';
import { prisma } from '@/lib/prisma';
import { getToken } from 'next-auth/jwt';
import { z } from 'zod';

/**
 * Extended response interface for availability checks that includes additional assistant-specific fields
 * @extends CalendarAvailabilityResponse
 */
interface AssistantAvailabilityResponse extends CalendarAvailabilityResponse {
  /** List of participant email addresses */
  participants?: string[];
  /** Email of the meeting organizer */
  organizer?: string;
  /** List of participant names that couldn't be resolved to email addresses */
  unresolved?: string[];
  /** Type of meeting (e.g., 'coffee', 'lunch', 'business') */
  meetingType?: string;
  /** Additional context or description about the meeting */
  context?: string;
  /** Error message if the availability check failed */
  error?: string;
  /** Suggested action for the user if no times are available */
  suggestedAction?: string;
  /** Time constraints for the meeting */
  timeConstraints?: {
    startDate: string;
    endDate: string;
  };
  /** Duration of the meeting in minutes */
  duration?: number;
  /** Additional context about each participant */
  participantContext?: Record<string, any>;
}

// Validation schemas
const ParticipantsSchema = z.object({
  names: z.array(z.string()).min(1, 'At least one participant is required')
});

const TimeWindowSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

const AvailableTimesSchema = z.object({
  participants: z.array(z.string()).min(1),
  timeWindow: TimeWindowSchema.optional(),
  timePreference: z.string().optional(),
  duration: z.string().optional(),
  meetingType: z.string().optional(),
  context: z.string().optional()
});

const MeetingSchema = z.object({
  title: z.string().min(1),
  participants: z.array(z.string()).min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  description: z.string().optional(),
  location: z.string().optional(),
  isVirtual: z.boolean(),
  meetingType: z.string().optional()
});

// Helper functions
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function parseDuration(duration: string | undefined): number {
  if (!duration) return 30; // default duration

  const match = duration.match(/(\d+)(hour|min)/);
  if (!match) return 30;

  const [_, num, unit] = match;
  return unit === 'hour' ? parseInt(num) * 60 : parseInt(num);
}

function getMeetingDuration(meetingType: string | undefined, specifiedDuration: string | undefined): number {
  if (specifiedDuration) {
    return parseDuration(specifiedDuration);
  }

  if (!meetingType) return 30;

  const type = meetingType.toLowerCase();
  if (type.includes('coffee') || type.includes('quick')) return 30;
  if (type.includes('lunch') || type.includes('dinner')) return 90;
  if (type.includes('interview') || type.includes('in-depth')) return 60;
  if (type.includes('workshop') || type.includes('team') || type.includes('planning')) return 120;
  
  return 30;
}

// Enhanced assistant functions
export const assistantFunctions = {
  findParticipants: async (
    args: z.infer<typeof ParticipantsSchema>,
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    try {
      console.log('\n=== FIND PARTICIPANTS CALLED ===');
      ParticipantsSchema.parse(args);

      const session = await getServerSession(req, res, authOptions);
      if (!session?.user?.email) throw new Error('Not authenticated');

      const participants: string[] = [];
      const unresolved: string[] = [];
      const participantContext: Record<string, any> = {};

      for (const name of args.names) {
        if (validateEmail(name)) {
          participants.push(name);
          // Get user preferences if they exist
          const userPrefs = await prisma.userPreferences.findFirst({
            where: { user: { email: name } }
          });
          if (userPrefs) {
            participantContext[name] = {
              preferences: userPrefs,
              isRegisteredUser: true
            };
          }
        } else {
          const contactMap = await searchEmailContacts(req, [name]);
          const matchedList = contactMap?.[name];
          if (matchedList?.length > 0 && matchedList[0].email) {
            const email = matchedList[0].email;
            participants.push(email);
            // Get any previous meeting history
            const previousMeetings = await prisma.invitation.findMany({
              where: {
                participants: {
                  some: {
                    email: email
                  }
                }
              },
              take: 5,
              orderBy: { createdAt: 'desc' }
            });
            participantContext[email] = {
              matchedFrom: name,
              previousMeetings,
              isRegisteredUser: false
            };
          } else {
            unresolved.push(name);
          }
        }
      }

      // Always include the organizer
      if (!participants.includes(session.user.email)) {
        participants.unshift(session.user.email);
        // Get organizer's preferences
        const organizerPrefs = await prisma.userPreferences.findFirst({
          where: { user: { email: session.user.email } }
        });
        if (organizerPrefs) {
          participantContext[session.user.email] = {
            preferences: organizerPrefs,
            isOrganizer: true
          };
        }
      }

      return {
        success: true,
        participants,
        organizer: session.user.email,
        unresolved: unresolved.length > 0 ? unresolved : undefined,
        participantContext // This provides rich context about each participant
      };
    } catch (error) {
      console.error('Error in findParticipants:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find participants'
      };
    }
  },

  findAvailableTimes: async (
    args: z.infer<typeof AvailableTimesSchema>,
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    try {
      console.log('\n=== FIND AVAILABLE TIMES CALLED ===');
      AvailableTimesSchema.parse(args);

      const session = await getServerSession(req, res, authOptions);
      if (!session?.user?.email) throw new Error('Not authenticated');

      // Get user preferences and meeting history
      const userPrefs = await prisma.userPreferences.findFirst({
        where: { user: { email: session.user.email } }
      });

      // Get recent meetings for context
      const recentMeetings = await prisma.invitation.findMany({
        where: {
          participants: {
            some: {
              email: {
                in: args.participants
              }
            }
          }
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });

      // Calculate duration with context
      const durationMinutes = getMeetingDuration(args.meetingType, args.duration);

      // Determine time window with smart defaults
      let timeWindow = args.timeWindow;
      if (!timeWindow) {
        const now = new Date();
        const nextWeekStart = new Date(now);
        nextWeekStart.setDate(now.getDate() + (7 - now.getDay() + 1));
        nextWeekStart.setHours(0, 0, 0, 0);

        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 4);
        nextWeekEnd.setHours(23, 59, 59, 999);

        timeWindow = {
          startDate: nextWeekStart.toISOString(),
          endDate: nextWeekEnd.toISOString()
        };
      }

      // Validate and adjust dates
      const now = new Date();
      const startDate = new Date(timeWindow.startDate);
      const endDate = new Date(timeWindow.endDate);

      if (startDate < now) {
        timeWindow.startDate = now.toISOString();
      }
      if (endDate < startDate) {
        throw new Error('End date must be after start date');
      }

      // Get availability with enhanced context
      const result = await getAvailability(
        req,
        args.participants,
        timeWindow,
        args.timePreference || args.meetingType,
        durationMinutes
      );

      // Enhance the response with rich context
      const enhancedResponse = {
        success: result.availableTimes?.length > 0,
        availableTimes: result.availableTimes || [],
        unregisteredParticipants: result.unregisteredParticipants,
        hasUnregisteredParticipants: result.hasUnregisteredParticipants,
        timezone: result.timezone,
        userPreferences: result.userPreferences,
        meetingType: args.meetingType || 'general',
        context: args.context,
        duration: durationMinutes,
        timeConstraints: timeWindow,
        additionalContext: {
          recentMeetings,
          participantPreferences: userPrefs,
          suggestedTimeOfDay: getSuggestedTimeOfDay(args.meetingType),
          historicalPatterns: analyzeHistoricalPatterns(recentMeetings)
        }
      } as AssistantAvailabilityResponse;

      return enhancedResponse;
    } catch (error) {
      console.error('Error in findAvailableTimes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find available times'
      };
    }
  }
};

// Helper function to suggest optimal time of day based on meeting type
function getSuggestedTimeOfDay(meetingType?: string): string {
  if (!meetingType) return 'business-hours';
  
  const type = meetingType.toLowerCase();
  if (type.includes('coffee') || type.includes('breakfast')) return 'morning';
  if (type.includes('lunch')) return 'midday';
  if (type.includes('dinner') || type.includes('happy hour')) return 'evening';
  if (type.includes('team') || type.includes('standup')) return 'morning';
  return 'business-hours';
}

// Helper function to analyze historical meeting patterns
function analyzeHistoricalPatterns(meetings: any[]): any {
  const patterns = {
    commonTimes: new Map<string, number>(),
    commonDays: new Map<number, number>(),
    averageDuration: 0,
    totalMeetings: meetings.length
  };

  meetings.forEach(meeting => {
    const startTime = new Date(meeting.createdAt);
    const hour = startTime.getHours().toString();
    const day = startTime.getDay();
    
    patterns.commonTimes.set(hour, (patterns.commonTimes.get(hour) || 0) + 1);
    patterns.commonDays.set(day, (patterns.commonDays.get(day) || 0) + 1);
  });

  return patterns;
}

// Export function definitions for OpenAI
export const functionDefinitions = [
  {
    name: 'findParticipants',
    description: 'Find and validate participant email addresses from names or partial information',
    parameters: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of names or email addresses to resolve'
        }
      },
      required: ['names']
    }
  },
  {
    name: 'findAvailableTimes',
    description: 'Find available time slots that work for all participants',
    parameters: {
      type: 'object',
      properties: {
        participants: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of participant email addresses'
        },
        timeWindow: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' }
          },
          description: 'Optional time window for the meeting'
        },
        timePreference: {
          type: 'string',
          description: 'Preferred time of day (morning, afternoon, evening)'
        },
        duration: {
          type: 'string',
          description: 'Duration in format like "30min" or "1hour"'
        },
        meetingType: {
          type: 'string',
          description: 'Type of meeting (e.g., coffee, lunch, business)'
        },
        context: {
          type: 'string',
          description: 'Additional context about the meeting'
        }
      },
      required: ['participants']
    }
  }
]; 