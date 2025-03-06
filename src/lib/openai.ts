import { Configuration, OpenAIApi } from 'openai';
import { extractNames } from './nlp';
import { searchEmailContacts } from './google';
import type { NextApiRequest } from 'next';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

interface ParsedMeetingRequest {
  title: string;
  participants: string[];
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual';
  };
  location?: string;
}

export async function parseMeetingRequest(req: NextApiRequest, prompt: string): Promise<ParsedMeetingRequest> {
  // First, extract names from the prompt
  const names = extractNames(prompt);
  console.log('Extracted names from prompt:', names);

  // Search for these names in email history
  const contacts = await searchEmailContacts(req, names);
  console.log('Found contacts:', contacts);

  // Use OpenAI to parse the rest of the request
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{
      role: "system",
      content: `You are a meeting scheduler assistant. Parse the meeting request and return ONLY a JSON object with this exact structure:
      {
        "title": "A descriptive title for the meeting",
        "preferences": {
          "timePreference": "morning" | "afternoon" | "evening",
          "durationType": "30min" | "1hour" | "2hours",
          "locationType": "coffee" | "restaurant" | "office" | "virtual"
        }
      }

      Rules:
      1. ONLY return the JSON object, no other text
      2. The JSON must match the exact structure above
      3. For timePreference, use:
         - "morning" for times before noon
         - "afternoon" for 12pm-5pm
         - "evening" for after 5pm
      4. For durationType, default to "1hour" unless specified
      5. For locationType, infer from context:
         - "coffee" for casual meetings
         - "restaurant" for meals
         - "office" for work meetings
         - "virtual" for online/remote meetings

      Examples:
      For "meet with Brad for coffee tomorrow morning", return:
      {
        "title": "Coffee with Brad",
        "preferences": {
          "timePreference": "morning",
          "durationType": "1hour",
          "locationType": "coffee"
        }
      }

      For "quick 30 min zoom sync with the team", return:
      {
        "title": "Team Sync Meeting",
        "preferences": {
          "timePreference": "morning",
          "durationType": "30min",
          "locationType": "virtual"
        }
      }

      For "dinner with Sarah at 7pm", return:
      {
        "title": "Dinner with Sarah",
        "preferences": {
          "timePreference": "evening",
          "durationType": "2hours",
          "locationType": "restaurant"
        }
      }`
    }, {
      role: "user",
      content: prompt
    }],
    temperature: 0.3, // Lower temperature for more consistent output
  });

  const aiResponse = completion.data.choices[0]?.message?.content;
  if (!aiResponse) {
    throw new Error('No response from OpenAI');
  }

  try {
    const parsed = JSON.parse(aiResponse);
    console.log('OpenAI parsed response:', parsed);
    
    return {
      ...parsed,
      participants: contacts.map(c => c.email), // Use the emails from our contact search
      preferences: {
        timePreference: parsed.preferences?.timePreference || 'morning',
        durationType: parsed.preferences?.durationType || '1hour',
        locationType: parsed.preferences?.locationType || 'coffee',
      }
    };
  } catch (error) {
    console.error('Failed to parse OpenAI response:', error);
    console.error('Raw response:', aiResponse);
    throw new Error(`Could not understand the meeting request. Please try rephrasing it. For example:
- "Coffee with John tomorrow morning"
- "30 min zoom call with Sarah at 2pm"
- "Team lunch next Tuesday afternoon"`);
  }
}

interface MeetingRequest {
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