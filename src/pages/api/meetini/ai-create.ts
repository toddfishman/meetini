import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { createCalendarEvent } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { getToken } from 'next-auth/jwt';
import OpenAI from 'openai';

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface MeetingRequest {
  prompt: string;
  participants: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, participants } = req.body as MeetingRequest;

    if (!prompt || !participants?.length) {
      return res.status(400).json({ error: 'Prompt and participants are required' });
    }

    // Step 1: Create a new thread for this scheduling request
    const thread = await openai.beta.threads.create();

    // Step 2: Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt
    });

    // Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: 'asst_ioilMZKZUADaasBkG02ucC8D',
    });

    // Step 4: Poll for completion and handle function calls
    let completedRun = await waitForRunCompletion(thread.id, run.id);

    // Step 5: Handle any function calls
    while (completedRun.status === 'requires_action') {
      const toolCalls = completedRun.required_action?.submit_tool_outputs.tool_calls;
      const toolOutputs = [];

      for (const toolCall of toolCalls || []) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        try {
          let result;
          if (functionName === 'findAvailableTimes') {
            // Add current user to participants if not included
            if (!args.participants.includes(session.user.email)) {
              args.participants.unshift(session.user.email);
            }
            result = await findAvailableTimes(req, args.participants, args);
          } else if (functionName === 'createMeeting') {
            // Add current user to participants if not included
            if (!args.participants.includes(session.user.email)) {
              args.participants.unshift(session.user.email);
            }
            const calendarLink = await createCalendarEvent(req, {
              summary: args.title,
              description: args.description,
              location: args.location,
              start: new Date(args.startTime),
              end: new Date(args.endTime),
              attendees: args.participants.map((email: string) => ({ email })),
              virtual: args.isVirtual
            });
            result = { success: true, calendarLink, participants: args.participants };
          }

          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify(result)
          });
        } catch (error) {
          console.error(`Error executing function ${functionName}:`, error);
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({ error: 'Failed to execute function' })
          });
        }
      }

      // Submit outputs back to OpenAI
      completedRun = await openai.beta.threads.runs.submitToolOutputs(
        thread.id,
        run.id,
        { tool_outputs: toolOutputs }
      );

      // Wait for the run to complete again
      completedRun = await waitForRunCompletion(thread.id, run.id);
    }

    if (completedRun.status === 'failed') {
      throw new Error('Assistant run failed: ' + completedRun.last_error?.message);
    }

    // Get the latest messages
    const messages = await openai.beta.threads.messages.list(thread.id);
    
    // Return the assistant's response and thread ID
    return res.status(200).json({
      threadId: thread.id,
      messages: messages.data
    });

  } catch (error) {
    console.error('Failed to schedule meeting:', error);
    return res.status(500).json({ 
      error: 'Failed to schedule meeting',
      details: error instanceof Error ? error.message : undefined
    });
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let run;
  let attempts = 0;
  const maxAttempts = 60; // 1 minute timeout
  
  while (attempts < maxAttempts) {
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    if (run.status === 'completed' || 
        run.status === 'requires_action' ||
        run.status === 'failed') {
      break;
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!run || attempts >= maxAttempts) {
    throw new Error('Assistant run timed out');
  }

  return run;
}