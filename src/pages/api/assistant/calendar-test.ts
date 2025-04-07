import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { getCalendarData } from '@/lib/calendar/getCalendarData';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure authenticated
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request
    const { prompt, calendarId, startDate, endDate } = req.body;
    
    if (!prompt || !startDate || !endDate) {
      return res.status(400).json({ error: 'Prompt, start date, and end date are required' });
    }

    const token = await getToken({ req });
    
    // Get calendar data
    const calendarData = await getCalendarData(
      req,
      token?.email as string,
      calendarId || 'primary',
      startDate,
      endDate
    );

    // Create a thread with OpenAI
    const thread = await openai.beta.threads.create();
    
    // Send a message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `${prompt}\n\nHere is my calendar information:\n${JSON.stringify(calendarData, null, 2)}`
    });
    
    // Create a run with the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID as string,
      instructions: `You are analyzing calendar data and helping the user understand their availability. 
      Look at the busy times in the data and help the user understand when they are free or busy.
      If they ask about a specific time, check if that time falls within any of the busy periods.
      Be honest and accurate about the available times.
      If there are any preferences about working hours or preferred days, take those into account.`
    });
    
    // Wait for the run to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    let runStatus = run.status;
    
    while (runStatus !== 'completed' && runStatus !== 'failed' && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      const runDetails = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      runStatus = runDetails.status;
      
      if (runStatus === 'requires_action') {
        // Handle any function calls if needed
        console.log('Run requires action, but we are not handling functions in this simple example');
        break;
      }
    }
    
    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    
    let latestAssistantMessage = 'No response from assistant';
    
    if (assistantMessages.length > 0) {
      const content = assistantMessages[0].content[0];
      if (content.type === 'text') {
        latestAssistantMessage = content.text.value;
      }
    }
    
    // Return the response
    return res.status(200).json({
      message: 'Calendar AI test successful',
      assistantResponse: latestAssistantMessage,
      calendarData,
      threadId: thread.id,
      runId: run.id,
      runStatus
    });
  } catch (error) {
    console.error('Calendar AI test error:', error);
    return res.status(500).json({
      error: 'Failed to process calendar data with AI',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 