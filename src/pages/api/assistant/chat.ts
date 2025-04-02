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
      timePreference?: 'morning' | 'afternoon' | 'evening';
      duration?: string;
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

      // Validate dates are in the future
      const now = new Date();
      const startDate = new Date(args.timeWindow.startDate);
      const endDate = new Date(args.timeWindow.endDate);

      if (startDate < now) {
        throw new Error('Start date must be in the future');
      }
      if (endDate < startDate) {
        throw new Error('End date must be after start date');
      }

      const result = await getAvailability(
        req,
        args.participants,
        args.timeWindow,
        args.timePreference,
        durationMinutes
      );

      console.log('Available times:', result);
      return {
        success: true,
        ...result
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
    },
    req: NextApiRequest,
    res: NextApiResponse
  ) => {
    console.log('\n=== SCHEDULE MEETING CALLED ===');
    console.log('Args:', JSON.stringify(args, null, 2));

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) throw new Error('Not authenticated');

    const calendarEvent = await createCalendarEvent(req, {
      summary: args.title,
      description: args.description,
      location: args.location,
      start: new Date(args.startTime),
      end: new Date(args.endTime),
      attendees: args.participants.map(email => ({ email })),
      virtual: args.isVirtual
    });

    const invitation = await prisma.invitation.create({
      data: {
        title: args.title,
        status: 'pending',
        type: 'sent',
        createdBy: session.user.email,
        location: args.location,
        calendarEventId: (calendarEvent as any).id,
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
      participants: args.participants
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