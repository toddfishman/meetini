import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { openai, ASSISTANT_ID } from '@/lib/openaiClient';
import { createCalendarEvent } from '@/lib/calendar';
import { searchEmailContacts } from '@/lib/google';
import { prisma } from '@/lib/prisma';
import { getAvailability } from '@/lib/calendar/calendarAvailability';

export const availableFunctions = {
  findParticipants: async (
    args: { names: string[] },
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    console.log('\n=== FIND PARTICIPANTS CALLED ===');
    console.log('Names:', JSON.stringify(args.names, null, 2));

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) throw new Error('Not authenticated');

    const participants: string[] = [];

    for (const name of args.names) {
      if (validateEmail(name)) {
        participants.push(name);
      } else {
        const contactMap = await searchEmailContacts(req, [name]);
        const matchedList = contactMap?.[name];
        if (matchedList && matchedList.length > 0 && matchedList[0].email) {
          participants.push(matchedList[0].email);
        }
      }
    }

    if (!participants.includes(session.user.email)) {
      participants.unshift(session.user.email);
    }

    return {
      success: true,
      participants,
      organizer: session.user.email
    };
  },

  findAvailableTimes: async (
    args: {
      participants: string[];
      timeWindow?: { startDate: string; endDate: string };
      timePreference?: string;
      duration?: string;
      meetingType?: string;
      context?: string;
    },
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    try {
      console.log('\n=== FIND AVAILABLE TIMES CALLED ===');
      console.log('Args:', JSON.stringify(args, null, 2));

      const session = await getServerSession(req, res, authOptions);
      if (!session?.user?.email) throw new Error('Not authenticated');

      // Parse duration string to minutes
      let durationMinutes = 30; // default
      if (args.duration) {
        const match = args.duration.match(/(\d+)(hour|min)/);
        if (match) {
          const [_, num, unit] = match;
          durationMinutes = unit === 'hour' ? parseInt(num) * 60 : parseInt(num);
        }
      }

      // Adjust duration based on meeting type if not explicitly specified
      if (!args.duration && args.meetingType) {
        if (args.meetingType.toLowerCase().includes('coffee') || 
            args.meetingType.toLowerCase().includes('quick')) {
          durationMinutes = 30;
        } else if (args.meetingType.toLowerCase().includes('lunch') || 
                  args.meetingType.toLowerCase().includes('dinner')) {
          durationMinutes = 90;
        } else if (args.meetingType.toLowerCase().includes('interview') || 
                  args.meetingType.toLowerCase().includes('in-depth')) {
          durationMinutes = 60;
        } else if (args.meetingType.toLowerCase().includes('workshop') || 
                  args.meetingType.toLowerCase().includes('team') || 
                  args.meetingType.toLowerCase().includes('planning')) {
          durationMinutes = 120;
        }
      }

      // If no timeWindow provided, default to next week
      if (!args.timeWindow) {
        const now = new Date();
        const nextWeekStart = new Date(now);
        nextWeekStart.setDate(now.getDate() + (7 - now.getDay() + 1)); // Next Monday
        nextWeekStart.setHours(0, 0, 0, 0);

        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 4); // Friday
        nextWeekEnd.setHours(23, 59, 59, 999);

        args.timeWindow = {
          startDate: nextWeekStart.toISOString(),
          endDate: nextWeekEnd.toISOString()
        };
      }

      // For special time-sensitive contexts, adjust the time window
      if (args.context) {
        const context = args.context.toLowerCase();
        
        // Fantasy football draft before NFL season
        if (context.includes('fantasy') && context.includes('football') && context.includes('draft')) {
          const currentYear = new Date().getFullYear();
          const nflSeasonStart = new Date(currentYear, 8, 1); // September 1st
          
          // If less than 2 weeks until season start, prioritize scheduling ASAP
          const now = new Date();
          const daysUntilSeason = Math.floor((nflSeasonStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilSeason < 14) {
            // Schedule within the next week
            const weekFromNow = new Date(now);
            weekFromNow.setDate(now.getDate() + 7);
            
            args.timeWindow = {
              startDate: now.toISOString(),
              endDate: weekFromNow.toISOString()
            };
          } else {
            // Schedule 1-2 weeks before season starts
            const twoWeeksBefore = new Date(nflSeasonStart);
            twoWeeksBefore.setDate(nflSeasonStart.getDate() - 14);
            
            const oneWeekBefore = new Date(nflSeasonStart);
            oneWeekBefore.setDate(nflSeasonStart.getDate() - 7);
            
            args.timeWindow = {
              startDate: twoWeeksBefore.toISOString(),
              endDate: oneWeekBefore.toISOString()
            };
          }
          
          // Set time preference to evening or weekend for social events
          if (!args.timePreference) {
            args.timePreference = 'evening or weekend';
          }
          
          // Set longer duration for draft events
          durationMinutes = 180; // 3 hours for fantasy draft
        }
        
        // Holiday planning should be before the holiday
        if (context.includes('holiday') && context.includes('plan')) {
          // Set time preference to evening or weekend for social events
          if (!args.timePreference) {
            args.timePreference = 'evening or weekend';
          }
        }
      }

      // Validate dates are in the future
      const now = new Date();
      const startDate = new Date(args.timeWindow.startDate);
      const endDate = new Date(args.timeWindow.endDate);

      if (startDate < now) {
        startDate.setTime(now.getTime());
        args.timeWindow.startDate = startDate.toISOString();
      }
      if (endDate < startDate) {
        throw new Error('End date must be after start date');
      }

      const result = await getAvailability(
        req,
        args.participants,
        args.timeWindow,
        args.timePreference || (args.meetingType ? args.meetingType : undefined),
        durationMinutes
      );

      console.log('Available times:', result);
      
      // Enrich the response with additional context
      return {
        success: true,
        ...result,
        meetingType: args.meetingType || 'general',
        explicitContext: args.context || '',
        suggestedDuration: durationMinutes,
        timeConstraints: args.timeWindow
      };
    } catch (error) {
      console.error('🔥 FIND AVAILABLE TIMES ERROR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },

  scheduleMeeting: async (
    args: {
      title: string;
      participants: string[];
      startTime: string;
      endTime: string;
      description?: string;
      location?: string;
      isVirtual: boolean;
      meetingType?: string;
    },
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    console.log('\n=== SCHEDULE MEETING CALLED ===');
    console.log('Args:', JSON.stringify(args, null, 2));

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) throw new Error('Not authenticated');

    // Additional validation of start and end times
    const startTime = new Date(args.startTime);
    const endTime = new Date(args.endTime);
    const now = new Date();
    
    // Validate time is in the future
    if (startTime <= now) {
      throw new Error('Meeting time must be in the future');
    }
    
    // Validate that meeting is not too late or too early (between 7am and 10pm)
    const hour = startTime.getHours();
    if (hour < 7 || hour >= 22) {
      throw new Error('Meeting time must be between 7:00 AM and 10:00 PM');
    }
    
    // Validate meeting type compatibility with time
    if (args.meetingType) {
      const meetingType = args.meetingType.toLowerCase();
      const isWeekend = [0, 6].includes(startTime.getDay()); // 0 = Sunday, 6 = Saturday
      
      // Business meetings should be on weekdays during business hours
      if ((meetingType.includes('business') || meetingType.includes('work')) && 
          (isWeekend || hour < 9 || hour > 17)) {
        throw new Error('Business meetings should be scheduled on weekdays between 9:00 AM and 5:00 PM');
      }
      
      // Coffee meetings should be in the morning
      if (meetingType.includes('coffee') && hour >= 12) {
        throw new Error('Coffee meetings are typically held before noon');
      }
      
      // Lunch meetings should be around noon
      if (meetingType.includes('lunch') && (hour < 11 || hour > 14)) {
        throw new Error('Lunch meetings should be scheduled between 11:00 AM and 2:00 PM');
      }
      
      // Happy hour meetings should be in late afternoon
      if (meetingType.includes('happy hour') && (hour < 16 || hour > 19)) {
        throw new Error('Happy hour meetings should be scheduled between 4:00 PM and 7:00 PM');
      }
      
      // Dinner meetings should be in the evening
      if (meetingType.includes('dinner') && (hour < 18 || hour > 21)) {
        throw new Error('Dinner meetings should be scheduled between 6:00 PM and 9:00 PM');
      }
    }
    
    // Check duration is appropriate (not too short or long based on type)
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    
    if (durationMinutes < 15) {
      throw new Error('Meeting must be at least 15 minutes long');
    }
    
    // *** NEW CODE: Check for recent invitations that might not yet be reflected in Google Calendar ***
    // Look for invitations in the database created in the last hour for any of the participants
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const recentInvitations = await prisma.invitation.findMany({
      where: {
        OR: [
          {
            createdBy: {
              in: args.participants
            }
          },
          {
            participants: {
              some: {
                email: {
                  in: args.participants
                }
              }
            }
          }
        ],
        createdAt: {
          gte: oneHourAgo
        }
      },
      include: {
        participants: true
      }
    });

    console.log(`Found ${recentInvitations.length} recent invitations for participants`);
    
    // Check for conflicts with these recent invitations
    for (const invitation of recentInvitations) {
      console.log(`Checking conflicts with invitation: ${invitation.id}, status: ${invitation.status}, has proposedTimes: ${invitation.proposedTimes?.length || 0}`);
      
      // If the invitation has proposed times, check each time
      if (invitation.proposedTimes && invitation.proposedTimes.length > 0) {
        for (const proposedTime of invitation.proposedTimes) {
          // Calculate the end time of the proposed meeting (assume 1 hour if not specified)
          const proposedEndTime = new Date(proposedTime);
          proposedEndTime.setMinutes(proposedEndTime.getMinutes() + 60);
          
          console.log(`Comparing time slot: ${startTime.toISOString()} - ${endTime.toISOString()} with proposed: ${proposedTime.toISOString()} - ${proposedEndTime.toISOString()}`);
          
          // Check for overlap
          if (
            (startTime >= proposedTime && startTime < proposedEndTime) ||
            (endTime > proposedTime && endTime <= proposedEndTime) ||
            (startTime <= proposedTime && endTime >= proposedEndTime)
          ) {
            const conflictParticipants = invitation.participants.map(p => p.email).join(', ');
            console.log(`Conflict detected with invitation ${invitation.id} at time ${proposedTime.toISOString()}`);
            throw new Error(`Scheduling conflict with a recent meeting with ${conflictParticipants}. Please choose a different time.`);
          }
        }
      }
      
      // If the invitation has a calendar event ID, that means it's confirmed
      // We should double-check for conflicts even if no proposed times
      if (invitation.calendarEventId) {
        console.log(`Invitation ${invitation.id} has a confirmed calendar event: ${invitation.calendarEventId}`);
        
        // For confirmed events without proposedTimes, create a default time slot (creation time + 1 hour duration)
        if (!invitation.proposedTimes || invitation.proposedTimes.length === 0) {
          const createdAtTime = invitation.createdAt;
          if (createdAtTime) {
            const eventEndTime = new Date(createdAtTime);
            eventEndTime.setMinutes(eventEndTime.getMinutes() + 60); // Assume 1 hour
            
            console.log(`Created fallback time slot for calendar event: ${createdAtTime.toISOString()} - ${eventEndTime.toISOString()}`);
            
            // Check for overlap with this fallback slot
            if (
              (startTime >= createdAtTime && startTime < eventEndTime) ||
              (endTime > createdAtTime && endTime <= eventEndTime) ||
              (startTime <= createdAtTime && endTime >= eventEndTime)
            ) {
              const conflictParticipants = invitation.participants.map(p => p.email).join(', ');
              console.log(`Conflict detected with confirmed invitation ${invitation.id}`);
              throw new Error(`Scheduling conflict with a recent meeting with ${conflictParticipants}. Please choose a different time.`);
            }
          }
        }
      }
    }
    
    // If no conflicts, create the calendar event
    const calendarEvent = await createCalendarEvent(req, {
      summary: args.title,
      description: args.description,
      location: args.location,
      start: startTime,
      end: endTime,
      attendees: args.participants.map(email => ({ email })),
      virtual: args.isVirtual
    });

    // Create the invitation record
    const invitation = await prisma.invitation.create({
      data: {
        title: args.title,
        status: 'pending',
        type: 'sent',
        createdBy: session.user.email,
        location: args.location,
        calendarEventId: (calendarEvent as any).id,
        // Store the proposed time explicitly to help with conflict detection
        proposedTimes: [startTime],
        participants: {
          create: args.participants.map(email => ({
            email,
            status: 'pending',
            notifyByEmail: true
          }))
        }
      },
      include: {
        participants: true
      }
    });

    return {
      success: true,
      calendarLink: (calendarEvent as any)?.htmlLink,
      eventId: (calendarEvent as any).id,
      invitationId: invitation.id,
      participants: args.participants,
      scheduledTime: args.startTime
    };
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Temporarily disable auth for testing
  // const session = await getServerSession(req, res, authOptions);
  // if (!session?.user?.email) {
  //   return res.status(401).json({ error: 'Not authenticated' });
  // }

  try {
    const { message, threadId } = req.body;
    console.log('\n=== ASSISTANT API REQUEST ===');
    console.log('Message:', message);
    console.log('ThreadId:', threadId);
    console.log('Assistant ID:', ASSISTANT_ID);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const thread = threadId
      ? await openai.beta.threads.retrieve(threadId)
      : await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
      instructions: `You are a smart scheduling assistant. Interpret human meeting requests and apply social context when determining availability and preferences.`
    });

    let completedRun = await waitForRunCompletion(thread.id, run.id);

    while (completedRun.status === 'requires_action') {
      const toolCalls = completedRun.required_action?.submit_tool_outputs.tool_calls;
      const toolOutputs = [];

      for (const toolCall of toolCalls || []) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (functionName in availableFunctions) {
          try {
            const result = await availableFunctions[functionName as keyof typeof availableFunctions](args, req, res);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(result)
            });
          } catch (error) {
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: 'Function failed', details: error instanceof Error ? error.message : 'Unknown' })
            });
          }
        }
      }

      completedRun = await openai.beta.threads.runs.submitToolOutputs(
        thread.id,
        run.id,
        { tool_outputs: toolOutputs }
      );

      completedRun = await waitForRunCompletion(thread.id, run.id);
    }

    if (completedRun.status === 'failed') {
      throw new Error('Assistant run failed: ' + completedRun.last_error?.message);
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    return res.status(200).json({
      threadId: thread.id,
      messages: messages.data,
      debug: {
        runId: run.id,
        status: completedRun.status
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process chat',
      details: error instanceof Error ? error.message : undefined
    });
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let run;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
    if (
      run.status === 'completed' ||
      run.status === 'requires_action' ||
      run.status === 'failed'
    ) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!run || attempts >= maxAttempts) {
    throw new Error('Assistant run timed out');
  }

  return run;
}

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}