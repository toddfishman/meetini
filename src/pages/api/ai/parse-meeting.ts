import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { searchEmailContacts } from '@/lib/google';
import { extractNames } from '@/lib/nlp';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

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
      if (contacts && contacts.length > 0) {
        // Use the most confident match
        const bestMatch = contacts[0];
        resolvedParticipants.push(bestMatch.email);
        continue;
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

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // Get user preferences for context
    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id }
    });

    // Use OpenAI to parse the meeting request
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        role: "system",
        content: `You are a smart meeting assistant. Given a natural language request from a user, your job is to interpret it and return a structured JSON object that captures the user's intent and context.

Return ONLY a JSON object in this exact format:
{
  "title": "Short, human-readable meeting title",
  "preferences": {
    "timePreference": "morning" | "afternoon" | "evening",
    "durationType": "30min" | "1hour" | "2hours",
    "locationType": "coffee" | "restaurant" | "bar" | "office" | "virtual"
  },
  "location": "Optional location name or address if specified",
  "timeConstraints": {
    "startDate": "Earliest possible date (ISO format)",
    "endDate": "Latest acceptable date (ISO format)",
    "specificTime": "Optional 24-hour time (HH:mm) if explicitly mentioned"
  },
  "participants": ["List of emails or names if present in the prompt"]
}

Interpret timing, tone, and meaning like a human would:
- "Next week" means Monday–Friday of the following calendar week
- "Coffee" implies morning; "happy hour" implies late afternoon or early evening
- Avoid suggesting times too soon unless clearly stated (e.g. not 10 minutes from now)
- Always generate a future time window based on the user's intent
- Respect context even if it's subtle

User's working hours: ${userPrefs?.workingHours?.start || '09:00'} - ${userPrefs?.workingHours?.end || '17:00'}
User's preferred meeting duration: ${userPrefs?.defaultDuration || 30} minutes
User's timezone: ${userPrefs?.timezone || 'America/Los_Angeles'}

If time is vague (e.g. "soon" or "sometime this month"), make a reasonable guess and return a time window.

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

    // Extract and resolve participant emails
    const extractedNames = extractNames(prompt);
    const participants = await resolveParticipants(req, [
      ...extractedNames,
      ...(parsed.participants || [])
    ]);

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
