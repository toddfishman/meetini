import OpenAI from 'openai';
import { searchEmailContacts } from './google';
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from './prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { UserPreferencesData } from '@/types/preferences';

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
  const session = await getServerSession(req, {} as NextApiResponse, authOptions);
  if (!session?.user?.email) {
    throw new Error('Not authenticated');
  }

  // Get user preferences
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