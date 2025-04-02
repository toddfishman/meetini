import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import OpenAI from 'openai';
import { availableFunctions } from '../assistant/chat';

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OpenAI config');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v2'
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { message, participants } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!participants?.length) return res.status(400).json({ error: 'At least one participant is required' });

    // Check for calendar access token
    const token = await getServerSession(req, res, authOptions);
    if (!token?.user?.email) {
      return res.status(401).json({
        error: 'Calendar access required',
        details: 'Please sign in with Google Calendar permissions to schedule meetings.'
      });
    }

    const thread = await openai.beta.threads.create();

    // First create the message
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });

    // Then create the run
    let run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID!,
      instructions: `You are a scheduling assistant. Parse meeting prompts, extract participants and preferences, check availability, and suggest optimal times.

IMPORTANT: When scheduling meetings:
1. Always use current dates (${new Date().toISOString()})
2. Never schedule in the past
3. For "next week", use the next business week (Mon-Fri)
4. For coffee meetings, prefer morning times
5. For lunch meetings, use 12-2pm
6. For happy hours, use 4-6pm
7. Default duration is 1 hour unless specified

Example: "Coffee with Todd next week" -> findAvailableTimes with:
- timePreference: "morning"
- duration: "1hour"
- timeWindow: next Mon-Fri

The participants are: ${participants.join(', ')}

Please:
1. Call findParticipants to validate the participant emails
2. Call findAvailableTimes to get their availability
3. Call scheduleMeeting to create the calendar event at an optimal time`
    });

    let completedRun = await waitForRunCompletion(thread.id, run.id);
    let suggestedTimes: string[] = [];
    let toolOutputs: Array<{ tool_call_id: string; output: string }> = [];
    let scheduledTime: string | null = null;

    while (completedRun.status === 'requires_action') {
      const toolCalls = completedRun.required_action?.submit_tool_outputs.tool_calls;
      if (!toolCalls?.length) break;

      // Create a map of required tool call IDs
      const requiredToolCallIds = new Set(toolCalls.map(call => call.id));
      toolOutputs = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (err) {
          console.error(`Failed to parse arguments for ${functionName}:`, err);
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({ error: 'Invalid arguments', details: 'Failed to parse function arguments' })
          });
          continue;
        }

        if (functionName in availableFunctions) {
          try {
            const result = await availableFunctions[functionName as keyof typeof availableFunctions](args, req, res);
            console.log(`Function ${functionName} result:`, result);

            // If the function returns success: false, treat it as an error
            if (result.success === false) {
              throw new Error(result.error || 'Function failed');
            }

            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(result)
            });
            
            // Store times from findAvailableTimes
            if (functionName === 'findAvailableTimes' && result.success) {
              suggestedTimes = result.availableTimes || [];
            }
            
            // Store the scheduled time
            if (functionName === 'scheduleMeeting' && result.success) {
              scheduledTime = args.startTime;
            }
          } catch (err) {
            console.error(`Function ${functionName} failed:`, err);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: 'Function failed', details: err instanceof Error ? err.message : 'Unknown error' })
            });
          }
        } else {
          // Handle unknown function
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({ error: 'Unknown function', details: `Function ${functionName} is not available` })
          });
        }
      }

      // Verify we have outputs for all required tool calls
      const missingToolCalls = Array.from(requiredToolCallIds).filter(
        id => !toolOutputs.some(output => output.tool_call_id === id)
      );

      if (missingToolCalls.length > 0) {
        console.error('Missing tool outputs for:', missingToolCalls);
        // Add error outputs for missing tool calls
        for (const id of missingToolCalls) {
          toolOutputs.push({
            tool_call_id: id,
            output: JSON.stringify({ error: 'Function execution failed', details: 'No output generated' })
          });
        }
      }

      // Submit all tool outputs
      completedRun = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
        tool_outputs: toolOutputs
      });

      completedRun = await waitForRunCompletion(thread.id, run.id);
    }

    const messages = await openai.beta.threads.messages.list(thread.id);

    // Find any error from tool outputs
    const errorOutput = toolOutputs.find(output => {
      try {
        const result = JSON.parse(output.output);
        return result.success === false || result.error;
      } catch {
        return false;
      }
    });

    // Parse error details if present
    const errorDetails = errorOutput ? JSON.parse(errorOutput.output).error || JSON.parse(errorOutput.output).details : undefined;

    return res.status(200).json({
      messages: messages.data,
      suggestedTimes,
      error: errorDetails ? { details: errorDetails } : undefined
    });
  } catch (error) {
    console.error(' AI-CREATE ERROR:', error); 
    return res.status(500).json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0;
  while (attempts < 60) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    if (run.status === 'failed') {
      console.error('Run failed:', run.last_error);
      throw new Error(`Assistant run failed: ${run.last_error?.code}: ${run.last_error?.message}`);
    }
    
    if (run.status === 'completed' || run.status === 'requires_action') {
      return run;
    }

    if (run.status === 'expired') {
      throw new Error('Assistant run expired');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  throw new Error('Assistant run timed out after 60 seconds');
}