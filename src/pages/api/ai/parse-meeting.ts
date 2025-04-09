import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { searchEmailContacts } from '@/lib/google';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { UserPreferencesData } from '@/types/preferences';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ParsedMeetingRequest {
  title: string;
  preferences: {
    timePreference: 'morning' | 'afternoon' | 'evening';
    durationType: '30min' | '1hour' | '2hours';
    locationType: 'coffee' | 'restaurant' | 'bar' | 'office' | 'virtual';
  };
  location?: string;
  timeConstraints: {
    startDate: string;  // ISO format
    endDate: string;    // ISO format
    specificTime?: string;  // HH:mm format
  };
  participants: string[];
}

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

async function resolveParticipants(req: NextApiRequest, participants: string[]): Promise<string[]> {
  const resolvedParticipants: string[] = [];
  
  for (const participant of participants) {
    // If it's already a valid email, use it
    if (validateEmail(participant)) {
      resolvedParticipants.push(participant);
      continue;
    }
    
    // Search Gmail history for this name
    try {
      const contacts = await searchEmailContacts(req, [participant]);
      const matchedList = contacts[participant];
      if (matchedList && matchedList.length > 0) {
        resolvedParticipants.push(matchedList[0].email);
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
    }
  }
  
  return resolvedParticipants;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Get user preferences for context
    const userPrefs = await prisma.userPreferences.findFirst({
      where: { user: { email: session.user.email } }
    }) as UserPreferencesData | null;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: "system",
        content: `You are a meeting scheduling assistant. Extract meeting details from the user's message.
Parse the following information into a JSON object:
1. Meeting title
2. Meeting preferences (time of day, duration, location type)
3. Time constraints (start/end dates, specific time if mentioned)
4. Participant names or emails (extract these directly from the message)

Consider the user's preferences:
Working hours: ${userPrefs?.workingHours?.start || '09:00'} - ${userPrefs?.workingHours?.end || '17:00'}
User's timezone: ${userPrefs?.timezone || 'America/Los_Angeles'}

DO NOT include explanations or extra text — only return the final JSON result.`
      }, {
        role: "user",
        content: prompt
      }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(aiResponse);
    
    // Validate the response has all required fields
    if (!parsed.title || !parsed.preferences || !parsed.timeConstraints) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Resolve participant emails directly from OpenAI's extracted participants
    const participants = await resolveParticipants(req, parsed.participants || []);

    // Add the current user as a participant if not already included
    if (!participants.includes(session.user.email)) {
      participants.unshift(session.user.email);
    }

    const response: ParsedMeetingRequest = {
      ...parsed,
      participants
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in parse-meeting:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to parse meeting request' 
    });
  }
}
