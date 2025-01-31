import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Note: No NEXT_PUBLIC_ prefix needed here
});

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps parse meeting requests into structured data. 
          Extract the following information:
          - Meeting title (create one if not explicitly stated)
          - Participants (emails or names)
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
                description: "List of participant emails or names"
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
      throw new Error('Failed to parse meeting request');
    }

    const parsedArgs = JSON.parse(functionCall.arguments);
    return res.status(200).json(parsedArgs);
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return res.status(500).json({ error: 'Failed to parse meeting request' });
  }
} 