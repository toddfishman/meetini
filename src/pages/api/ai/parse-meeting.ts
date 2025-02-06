import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Note: No NEXT_PUBLIC_ prefix needed here
});

interface ParsedMeetingRequest {
  title: string;
  participants: string[];
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual';
  };
  location?: string;
  priority?: number;
  notes?: string;
}

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function processParticipants(participants: string[]): string[] {
  return participants.map(participant => {
    // If it's already an email, return it
    if (validateEmail(participant)) return participant;
    
    // If it ends with @gmail.com, return it
    if (participant.endsWith('@gmail.com')) return participant;
    
    // If it contains @ but is malformed, try to fix it
    if (participant.includes('@')) {
      const parts = participant.split('@');
      if (parts.length === 2) {
        return `${parts[0].trim()}@${parts[1].trim()}`;
      }
    }
    
    // If it looks like a name or partial email, append @gmail.com
    if (!participant.includes('@')) {
      return `${participant.trim().toLowerCase().replace(/\s+/g, '')}@gmail.com`;
    }
    
    return participant;
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('Processing prompt:', prompt);

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps parse meeting requests into structured data. 
          Pay special attention to email addresses and names that should be converted to email addresses.
          If a name is mentioned without an email, assume it's a Gmail address.
          Extract the following information:
          - Meeting title (create one if not explicitly stated)
          - Participants (emails or names - if no domain is specified, assume @gmail.com)
          - Time preferences (morning/afternoon/evening)
          - Duration (30min/1hour/2hours)
          - Location type (coffee/restaurant/office/virtual)
          - Specific location (if mentioned)
          - Priority (1-10)
          - Additional notes/context`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      functions: [
        {
          name: "create_meeting_request",
          description: "Parse the meeting request into structured data",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "A clear title for the meeting"
              },
              participants: {
                type: "array",
                items: { type: "string" },
                description: "List of participant emails (convert names to email addresses if needed)"
              },
              preferences: {
                type: "object",
                properties: {
                  timePreference: {
                    type: "string",
                    enum: ["morning", "afternoon", "evening"]
                  },
                  durationType: {
                    type: "string",
                    enum: ["30min", "1hour", "2hours"]
                  },
                  locationType: {
                    type: "string",
                    enum: ["coffee", "restaurant", "office", "virtual"]
                  }
                }
              },
              location: {
                type: "string",
                description: "Specific location if mentioned"
              },
              priority: {
                type: "number",
                minimum: 1,
                maximum: 10,
                description: "Meeting priority (1-10)"
              },
              notes: {
                type: "string",
                description: "Additional context or notes about the meeting"
              }
            },
            required: ["title", "participants", "preferences"]
          }
        }
      ],
      function_call: { name: "create_meeting_request" }
    });

    const functionCall = completion.choices[0].message.function_call;
    if (!functionCall || !functionCall.arguments) {
      throw new Error('Failed to parse meeting request - no function call response');
    }

    console.log('OpenAI response:', functionCall.arguments);

    const parsedArgs = JSON.parse(functionCall.arguments) as ParsedMeetingRequest;
    
    // Process and validate participants
    parsedArgs.participants = processParticipants(parsedArgs.participants);

    // Ensure we have required fields
    if (!parsedArgs.title || !parsedArgs.participants || !parsedArgs.preferences) {
      console.error('Missing required fields:', parsedArgs);
      throw new Error('Missing required fields in parsed request');
    }

    // Set default values if needed
    if (!parsedArgs.preferences.timePreference) parsedArgs.preferences.timePreference = 'morning';
    if (!parsedArgs.preferences.durationType) parsedArgs.preferences.durationType = '1hour';
    if (!parsedArgs.preferences.locationType) parsedArgs.preferences.locationType = 'virtual';

    console.log('Final parsed request:', parsedArgs);
    return res.status(200).json(parsedArgs);
  } catch (error) {
    console.error('Parsing Error:', error);
    return res.status(500).json({ 
      error: 'Failed to parse meeting request',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 
