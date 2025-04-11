import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { openai, ASSISTANT_ID } from '@/lib/openaiClient';
import { createCalendarEvent } from '@/lib/calendar';
import { searchEmailContacts } from '@/lib/google';
import { prisma } from '@/lib/prisma';
import { getAvailability } from '@/lib/calendar/calendarAvailability';
import { getToken } from 'next-auth/jwt';

export const availableFunctions = {
  findParticipants: async (
    args: { names: string[] },
    req: NextApiRequest,
    res: NextApiResponse,
    selectedContactsParam?: any[]
  ) => {
    console.log('\n=== FIND PARTICIPANTS CALLED ===');
    console.log('Names:', JSON.stringify(args.names, null, 2));
    
    // If we have selected contacts passed as a parameter, use those directly
    if (selectedContactsParam && selectedContactsParam.length > 0) {
      console.log('Using pre-selected contacts:', selectedContactsParam);
      const session = await getServerSession(req, res, authOptions);
      return {
        success: true,
        participants: selectedContactsParam.map((c: any) => c.email),
        organizer: session?.user?.email
      };
    }

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
      
      // CRITICAL FIX: Verify that we actually have available times before proceeding
      // This ensures we never return empty slots that would ignore calendar blocks
      if (!result.availableTimes || result.availableTimes.length === 0) {
        console.error('🚨 WARNING: No available times found that respect calendar blocks and working hours!');
        return {
          success: false,
          error: 'No available times found that respect calendar blocks and working hours. Please try a different time window or check calendar settings.',
          warnings: result.warnings,
          participantsWithoutAccess: result.participantsWithoutAccess,
          suggestedAction: 'Try a broader time window or different day'
        };
      }
      
      // Debug log the first few available times to verify they respect preferences
      console.log('Verified available times (respecting blocks and preferences):');
      result.availableTimes.slice(0, 3).forEach((time: any, i: number) => {
        console.log(`  ${i+1}. ${new Date(time.start).toLocaleString()} to ${new Date(time.end).toLocaleString()}`);
      });
      
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
    
    // CRITICAL FIX: Do a triple verification against calendar availability and user preferences
    console.log('Performing comprehensive availability checks before scheduling...');
    
    try {
      // 1. Verify against user's working hours preferences - especially half-hour start times
      const token = await getToken({ req });
      if (token?.email) {
        const userEmail = token.email as string;
        
        // Get the user's specific calendar preferences, checking BOTH tables
        const calendarPrefs = await prisma.calendarPreferences.findFirst({
          where: {
            user: {
              email: userEmail
            }
          }
        });
        
        const userPrefs = await prisma.userPreferences.findFirst({
          where: {
            user: {
              email: userEmail
            }
          }
        });
        
        // Extract working hours, with UserPreferences taking precedence
        let workingHours: { start?: string; end?: string } = {};
        
        if (userPrefs?.workingHours) {
          console.log('Found working hours in UserPreferences:', userPrefs.workingHours);
          workingHours = userPrefs.workingHours as { start?: string; end?: string };
        } else if (calendarPrefs?.workingHours) {
          console.log('Found working hours in CalendarPreferences:', calendarPrefs.workingHours);
          workingHours = calendarPrefs.workingHours as { start?: string; end?: string };
        }
        
        // If working hours start is defined, verify the meeting doesn't start before that
        if (workingHours.start) {
          console.log(`Verifying meeting time against user's preferred start time: ${workingHours.start}`);
          
          // Parse the preferred start time with precision for half-hours
          const [prefHours, prefMinutes] = workingHours.start.split(':').map(Number);
          
          // Create a Date object representing the user's preferred start time on the same day
          const preferredStartTime = new Date(startTime);
          preferredStartTime.setHours(prefHours, prefMinutes, 0, 0);
          
          // Compare with the proposed meeting start time
          if (startTime < preferredStartTime) {
            console.error(`⚠️ SCHEDULING VIOLATION: Meeting time ${startTime.toISOString()} is earlier than user's preferred start time ${preferredStartTime.toISOString()}`);
            throw new Error(`Cannot schedule before your working hours start time (${workingHours.start}). Please choose a later time.`);
          }
        }
      }
      
      // 2. Create a narrow window just around the proposed time for targeted availability check
      const verifyWindow = {
        startDate: new Date(startTime.getTime() - 5 * 60 * 1000).toISOString(), // 5 minutes before
        endDate: new Date(endTime.getTime() + 5 * 60 * 1000).toISOString()      // 5 minutes after
      };
      
      // 3. Do a strict availability check against calendar events
      const availabilityCheck = await getAvailability(
        req,
        args.participants,
        verifyWindow,
        'exact', // Use 'exact' mode to check only this specific time window
        Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000)) // Duration in minutes
      );
      
      // If no available times overlap with our exact proposed time, it must be conflicting
      if (!availabilityCheck.availableTimes || availabilityCheck.availableTimes.length === 0) {
        console.error('🚨 SCHEDULING CONFLICT DETECTED! The proposed time conflicts with calendar blocks or working hours');
        throw new Error('The proposed time conflicts with calendar blocks or working hours. Please choose a different time.');
      }
      
      // Verify the proposed time exactly matches one of the available times
      const exactTimeAvailable = availabilityCheck.availableTimes.some((timeStr: string) => {
        const slot = JSON.parse(timeStr);
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        
        // Allow small 1-minute tolerance for timestamp comparison
        const startDiff = Math.abs(slotStart.getTime() - startTime.getTime()) / (60 * 1000);
        const endDiff = Math.abs(slotEnd.getTime() - endTime.getTime()) / (60 * 1000);
        
        return startDiff <= 1 && endDiff <= 1;
      });
      
      if (!exactTimeAvailable) {
        console.error('🚨 SCHEDULING VALIDATION FAILED! Proposed time doesn\'t match any available slot');
        throw new Error('The proposed time doesn\'t match any available slot in the calendar.');
      }
      
      console.log('✅ Final availability check passed - time is available and within preferences');
    } catch (error) {
      console.error('Failed to verify availability:', error);
      throw new Error(`Cannot schedule meeting: ${error instanceof Error ? error.message : 'Unknown availability error'}`);
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

  try {
    // Extract all needed data from the request
    const { message, threadId, selectedContacts } = req.body;
    
    console.log('\n=== ASSISTANT API REQUEST ===');
    console.log('Message:', message);
    console.log('ThreadId:', threadId);
    console.log('Assistant ID:', ASSISTANT_ID);
    console.log('Selected Contacts:', selectedContacts);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Ensure we have a session with a logged-in user
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Create a thread if we don't have one yet
    const thread = threadId
      ? await openai.beta.threads.retrieve(threadId)
      : await openai.beta.threads.create();

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message
    });

    // Add predefined context about selected contacts, if any
    if (selectedContacts && selectedContacts.length > 0) {
      const contactsContextMessage = `
The user has already selected the following contacts for this meeting:
${selectedContacts.map((c: any) => `- ${c.name} (${c.email})`).join('\n')}

Use ONLY these contacts as the participants for the meeting. Do not try to extract additional participants from the message unless explicitly mentioned by the user.
`;

      // Add the contacts context as a system message to avoid showing it to the user
      await openai.beta.threads.messages.create(thread.id, {
        role: "user", // Changed back to "user" to avoid TypeScript error, we'll filter it out manually
        content: contactsContextMessage
      });
      
      console.log('Added contacts context to thread:', contactsContextMessage);
    }

    // Create a run with the Assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
      instructions: `You are a highly intelligent scheduling assistant with deep contextual understanding and social awareness. Your goal is to make scheduling feel natural and human-like while respecting all technical constraints.

${selectedContacts && selectedContacts.length > 0 ? 
  'IMPORTANT: The user has already selected specific contacts to meet with. Use ONLY these contacts as the participants and do not try to extract additional participants from the message unless explicitly mentioned.' : 
  'Extract participant names from the user message to determine who should be invited to the meeting.'}

Current date and time: ${new Date().toString()}
User's email: ${session.user.email}
User's name: ${session.user.name || 'Unknown'}

- If you cannot determine the meeting participants, ask the user who they want to meet with
- If participants were already selected and provided to you, use those as the invitees
- Always prioritize contacts that the user has explicitly selected
- Don't suggest yourself (Meetini) as a participant

CORE CAPABILITIES:
1. Natural Language Understanding
   - Parse casual requests like "coffee with Bob next week"
   - Understand context and implicit preferences
   - Handle ambiguous references and follow-ups
   - Remember previous interactions and relationships

2. Smart Contact Resolution
   - Recognize and resolve names to contacts intelligently
   - Consider relationship context from previous meetings
   - Handle variations in names/nicknames
   - Understand organizational relationships

3. Intelligent Calendar Management
   - Consider not just raw availability but also:
     * User preferences (morning person vs afternoon person)
     * Meeting type conventions (coffee = morning, lunch = midday)
     * Travel time and location context
     * Past scheduling patterns
     * Relationship dynamics

4. Context-Aware Decision Making
   - Use participant history to inform decisions
   - Consider meeting frequency and patterns
   - Adapt to formal/informal relationship contexts
   - Balance multiple participants' preferences

STRICT RULES:
1. Never schedule outside working hours
2. Always respect timezone constraints
3. Never double-book
4. Always verify availability
5. Maintain professional boundaries`
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
            // If the function is findParticipants and we have selected contacts, use those instead
            if (functionName === 'findParticipants' && selectedContacts && selectedContacts.length > 0) {
              // Override the extracted names with the selected contacts
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  success: true,
                  participants: selectedContacts.map((c: any) => c.email),
                  organizer: session.user.email
                })
              });
              console.log('Using selected contacts for findParticipants function:', selectedContacts);
            } else if (functionName === 'findAvailableTimes') {
              // For findAvailableTimes, ensure we're using the correct participants
              // If we have selected contacts, make sure they're included
              if (selectedContacts && selectedContacts.length > 0) {
                // Replace the participants in the args with our selected contacts
                const emails = selectedContacts.map((c: any) => c.email);
                if (!emails.includes(session.user.email)) {
                  emails.push(session.user.email);
                }
                args.participants = emails;
                console.log('Modified findAvailableTimes to use selected contacts:', emails);
              }
              
              const result = await availableFunctions[functionName as keyof typeof availableFunctions](args, req, res);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(result)
              });
            } else {
              // Call the function normally for other functions
              const result = await availableFunctions[functionName as keyof typeof availableFunctions](args, req, res);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(result)
              });
            }
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

    // Extract the new assistant messages that were generated in this run
    // by comparing with the run's creation timestamp and filtering out system messages
    const runCreationTime = new Date(run.created_at * 1000);
    const filteredMessages = messages.data.filter(msg => 
      // Only include assistant messages or user messages that aren't the internal context message
      (msg.role === 'assistant' || 
       (msg.role === 'user' && !msg.content.some(c => 
         typeof c === 'object' && 
         c.type === 'text' && 
         c.text.value.includes('already selected the following contacts')
       )))
    );

    return res.status(200).json({
      threadId: thread.id,
      messages: filteredMessages,
      debug: {
        runId: run.id,
        status: completedRun.status
      }
    });
  } catch (error) {
    console.error('Error in assistant chat:', error);
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