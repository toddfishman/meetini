import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
}

export async function parseMeetingRequest(prompt: string): Promise<ParsedMeetingRequest> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "system",
          content: `You are a meeting scheduler assistant. Parse the user's meeting request and extract the following information:
          - Meeting title
          - Participants (email addresses)
          - Time preference (morning, afternoon, or evening)
          - Duration (30min, 1hour, or 2hours)
          - Location type (coffee, restaurant, office, or virtual)
          - Specific location (if mentioned)
          
          Return the information in a strict JSON format with these fields:
          {
            "title": string,
            "participants": string[],
            "preferences": {
              "timePreference": string | null,
              "durationType": string | null,
              "locationType": string | null
            },
            "location": string | null
          }`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      title: result.title,
      participants: result.participants,
      preferences: {
        timePreference: result.preferences.timePreference || undefined,
        durationType: result.preferences.durationType || undefined,
        locationType: result.preferences.locationType || undefined,
      },
      location: result.location || undefined,
    };
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw new Error('Failed to parse meeting request');
  }
} 