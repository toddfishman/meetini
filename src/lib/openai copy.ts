import OpenAI from 'openai';
import { extractNames } from './nlp';
import { searchEmailContacts } from './google';
import type { NextApiRequest } from 'next';
import { prisma } from './prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

// Initialize OpenAI client with environment variable validation
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v2'
  }
});

export { openai };

export interface ParsedMeetingRequest {
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

export async function parseMeetingRequest(req: NextApiRequest, prompt: string): Promise<ParsedMeetingRequest> {
  const session = await getServerSession(req, authOptions);
  if (!session?.user?.email) {
    throw new Error('No authenticated user found');
  }

  // Get user preferences for context
  const userPrefs = await prisma.userPreferences.findUnique({
    where: { userId: session.user.id }
  });

  // Use OpenAI to parse the request
  const completion = await openai.createChatCompletion({
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

CRITICAL TIME HANDLING RULES:
1. For "next week":
   - startDate: Next Monday at 9am
   - endDate: Next Friday at 5pm
2. For "this week":
   - startDate: Tomorrow at 9am
   - endDate: This Friday at 5pm
3. For "tomorrow":
   - startDate: Tomorrow at 9am
   - endDate: Tomorrow at 5pm
4. For vague times like "soon":
   - startDate: Tomorrow at 9am
   - endDate: 5 business days from tomorrow at 5pm

MEETING TYPE RULES:
1. Coffee meetings:
   - Default to morning (9am-11am)
   - Duration: 30min
2. Happy hours:
   - Time: 4pm-6pm
   - Duration: 1hour
3. Regular meetings:
   - Duration: 1hour unless specified
   - Respect working hours

NEVER schedule:
- In the past
- Same day unless explicitly requested
- Outside of working hours: ${userPrefs?.workingHours?.start || '09:00'} - ${userPrefs?.workingHours?.end || '17:00'}

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

  return {
    ...parsed,
    participants
  };
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
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
    }
  }
  
  return resolvedParticipants;
}

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    // Create a FormData object
    const formData = new FormData();
    
    // Convert webm to mp3 if needed (browser default is webm)
    const finalBlob = new Blob([audioBlob], { type: 'audio/webm' });
    formData.append('audio', finalBlob, 'recording.webm');

    const response = await fetch('/api/ai/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Transcription error:', error);
      throw new Error(error.error || 'Failed to transcribe audio');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
}