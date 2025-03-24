import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testOpenAIScheduling() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Test cases
  const tests = [
    {
      input: "Coffee at 9:45 tomorrow at the Bellevue Club",
      calendars: [
        {
          name: "Todd",
          email: "todd@example.com",
          busyPeriods: [
            {
              start: new Date("2025-03-25T11:00:00-07:00"),
              end: new Date("2025-03-25T12:00:00-07:00")
            }
          ]
        },
        {
          name: "John",
          email: "john@example.com",
          busyPeriods: [
            {
              start: new Date("2025-03-25T10:00:00-07:00"),
              end: new Date("2025-03-25T10:30:00-07:00")
            }
          ]
        }
      ]
    },
    {
      input: "Coffee next Tuesday morning",
      calendars: [
        {
          name: "Todd",
          email: "todd@example.com",
          busyPeriods: [
            {
              start: new Date("2025-04-01T09:00:00-07:00"),
              end: new Date("2025-04-01T10:00:00-07:00")
            }
          ]
        },
        {
          name: "John",
          email: "john@example.com",
          busyPeriods: [
            {
              start: new Date("2025-04-01T11:00:00-07:00"),
              end: new Date("2025-04-01T12:00:00-07:00")
            }
          ]
        }
      ]
    }
  ];

  for (const test of tests) {
    console.log('\n=== Testing:', test.input, '===\n');

    const currentTime = new Date();
    const systemPrompt = `You are an intelligent scheduling assistant that understands human context and calendar availability.

Current time: ${currentTime.toLocaleString()}

IMPORTANT RULES:
1. Parse dates and times EXACTLY as specified in the request
2. For relative dates like "tomorrow", use ${currentTime.toLocaleString()} as reference
3. For "morning" default to 9:30 AM unless specified
4. ALL times must be returned in ISO format with timezone offset
5. Location should be preserved exactly as specified
6. Duration defaults:
   - Coffee: 30 minutes
   - Lunch: 60 minutes
   - Meeting: 45 minutes

Available Calendars:
${test.calendars.map(cal => 
  `\n${cal.name} (${cal.email}):
   - Busy periods:${cal.busyPeriods.map(p => 
     `\n     * ${p.start.toLocaleString()} to ${p.end.toLocaleString()}`
   ).join('')}`
).join('\n')}`;

    const userPrompt = `Parse and analyze this meeting request: "${test.input}"

Required:
1. Extract EXACT date and time if specified
2. Extract EXACT location if specified
3. Determine meeting type and appropriate duration
4. Verify the suggested time doesn't conflict with any attendee's calendar
5. Format all times in ISO format with timezone

Return a JSON object with:
{
  "parsedRequest": {
    "dateTime": "ISO string with timezone",
    "location": "exact location if specified",
    "type": "COFFEE/LUNCH/MEETING",
    "duration": minutes
  },
  "suggestedSlots": [
    {
      "start": "ISO string with timezone",
      "end": "ISO string with timezone",
      "confidence": 0-1 score,
      "reasoning": "Explain how you parsed the date/time and verified calendar availability"
    }
  ]
}`;

    try {
      console.log('System Prompt:', systemPrompt);
      console.log('\nUser Prompt:', userPrompt);

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const response = JSON.parse(completion.choices[0].message.content);
      console.log('\nOpenAI Response:', JSON.stringify(response, null, 2));

      // Validate the response
      const parsedDate = new Date(response.parsedRequest.dateTime);
      console.log('\nValidation:');
      console.log('- Parsed date:', parsedDate.toLocaleString());
      console.log('- Location:', response.parsedRequest.location);
      console.log('- Type:', response.parsedRequest.type);
      console.log('- Duration:', response.parsedRequest.duration, 'minutes');

      // Check for conflicts
      for (const slot of response.suggestedSlots) {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        
        const conflicts = test.calendars.flatMap(cal => 
          cal.busyPeriods.filter(busy => 
            (start >= busy.start && start < busy.end) ||
            (end > busy.start && end <= busy.end)
          )
        );

        console.log('\nSlot:', start.toLocaleString(), 'to', end.toLocaleString());
        console.log('Conflicts:', conflicts.length ? 'YES' : 'NO');
        if (conflicts.length) {
          console.log('Conflicting periods:', conflicts);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

testOpenAIScheduling().catch(console.error);
