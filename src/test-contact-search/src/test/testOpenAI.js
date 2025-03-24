import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const defaultPreferences = {
  coffee: {
    preferredDuration: 30,
    preferredBuffer: 15,
    preferredTimeRanges: [
      { start: "09:00", end: "11:00" },
      { start: "14:00", end: "16:00" }
    ]
  },
  lunch: {
    preferredDuration: 60,
    preferredBuffer: 15,
    preferredTimeRanges: [
      { start: "11:30", end: "13:30" }
    ]
  },
  meeting: {
    preferredDuration: 45,
    preferredBuffer: 15,
    preferredTimeRanges: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "17:00" }
    ]
  }
};

function getPreferences(attendee, meetingType) {
  if (!attendee.preferences) {
    return defaultPreferences[meetingType.toLowerCase()];
  }
  
  const userPrefs = attendee.preferences.meetingPreferences[meetingType.toLowerCase()];
  if (!userPrefs) {
    return defaultPreferences[meetingType.toLowerCase()];
  }

  // Merge with defaults, letting user preferences take precedence
  return {
    ...defaultPreferences[meetingType.toLowerCase()],
    ...userPrefs
  };
}

function isWithinTimeRange(time, ranges) {
  const [hours, minutes] = time.split(':').map(Number);
  const timeMinutes = hours * 60 + minutes;

  return ranges.some(range => {
    const [startHours, startMinutes] = range.start.split(':').map(Number);
    const [endHours, endMinutes] = range.end.split(':').map(Number);
    const startTimeMinutes = startHours * 60 + startMinutes;
    const endTimeMinutes = endHours * 60 + endMinutes;

    return timeMinutes >= startTimeMinutes && timeMinutes <= endTimeMinutes;
  });
}

function formatDateWithTZ(date) {
  const tzOffset = date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(tzOffset) / 60);
  const minutes = Math.abs(tzOffset) % 60;
  const sign = tzOffset > 0 ? '-' : '+';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.toLocaleString()} (UTC${sign}${pad(hours)}:${pad(minutes)})`;
};

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
      input: "Coffee at 10:15 tomorrow at the Bellevue Club",
      calendars: [
        {
          name: "Todd",
          email: "todd@example.com",
          preferences: {
            userId: "todd123",
            email: "todd@example.com",
            meetingPreferences: {
              coffee: {
                preferredDuration: 45, // Custom duration
                preferredBuffer: 10,
                preferredTimeRanges: [
                  { start: "08:00", end: "10:00" } // Custom time range
                ]
              }
            }
          },
          busyPeriods: [
            {
              start: new Date("2025-03-25T11:00:00.000-07:00"),
              end: new Date("2025-03-25T12:00:00.000-07:00")
            }
          ]
        },
        {
          name: "John",
          email: "john@example.com",
          preferences: null, // Will use default preferences
          busyPeriods: [
            {
              start: new Date("2025-03-25T10:00:00.000-07:00"),
              end: new Date("2025-03-25T10:30:00.000-07:00")
            }
          ]
        }
      ]
    },
    {
      input: "Coffee at 9:15 tomorrow at the Bellevue Club",
      calendars: [
        {
          name: "Todd",
          email: "todd@example.com",
          preferences: {
            userId: "todd123",
            email: "todd@example.com",
            meetingPreferences: {
              coffee: {
                preferredDuration: 45,
                preferredBuffer: 10,
                preferredTimeRanges: [
                  { start: "08:00", end: "10:00" }
                ]
              }
            }
          },
          busyPeriods: [
            {
              start: new Date("2025-03-25T11:00:00.000-07:00"),
              end: new Date("2025-03-25T12:00:00.000-07:00")
            }
          ]
        },
        {
          name: "John",
          email: "john@example.com",
          preferences: null,
          busyPeriods: [
            {
              start: new Date("2025-03-25T10:00:00.000-07:00"),
              end: new Date("2025-03-25T10:30:00.000-07:00")
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

Current time: ${formatDateWithTZ(currentTime)}

IMPORTANT RULES:
1. Parse dates and times EXACTLY as specified in the request
2. For relative dates like "tomorrow", use ${formatDateWithTZ(currentTime)} as reference
3. For "morning" default to 9:30 AM unless specified
4. ALL times must be returned in ISO format with timezone offset
5. Location should be preserved exactly as specified
6. Duration and Buffer Rules:
   - CRITICAL: Each attendee may have different duration preferences
   - For each meeting type, you MUST use the LONGEST duration from all attendees
   - Example: If Todd wants 45 min coffee and John wants 30 min coffee, use 45 min
   - If no preferences found, use these defaults:
     * Coffee: 30 minutes, 15 min buffer
     * Lunch: 60 minutes, 15 min buffer
     * Meeting: 45 minutes, 15 min buffer
7. CRITICAL: Calendar and Preference Rules
   - Each attendee may have different preferred time ranges
   - A slot is only valid if it's within the INTERSECTION of ALL attendees' ranges
   - Example: If Todd prefers 8-10 AM and John prefers 9-11 AM, only 9-10 AM is valid
   - A time slot CONFLICTS if ANY PART of it overlaps with ANY attendee's busy period
   - Example: A slot from 10:15-10:45 CONFLICTS with a busy period from 10:00-10:30
     because 10:15-10:30 overlaps with the busy period
   - Example: A slot from 9:45-10:15 CONFLICTS with a busy period from 10:00-10:30
     because 10:00-10:15 overlaps with the busy period
   - If there are ANY overlaps, you MUST suggest a DIFFERENT time that has NO overlaps
   - A time slot is ONLY valid if:
     1. The ENTIRE slot is within ALL attendees' preferred time ranges
     2. The ENTIRE slot is before ALL busy periods, OR
     3. The ENTIRE slot is after ALL busy periods
   - Never suggest a time that partially overlaps with a busy period, even if the
     overlap is just a few minutes
   - When the requested time has conflicts:
     1. DO NOT suggest the conflicting time
     2. Instead, find the closest available time that has NO conflicts
     3. If before noon, prefer earlier times (e.g., 9:15 AM)
     4. If after noon, prefer later times (e.g., 2:00 PM)

Available Calendars:
${test.calendars.map(cal => 
  `\n${cal.name} (${cal.email}):
   - Preferences:
     * ${cal.preferences ? 
         `Custom preferences found:
           - Duration: ${getPreferences(cal, 'COFFEE').preferredDuration} minutes
           - Buffer: ${getPreferences(cal, 'COFFEE').preferredBuffer} minutes
           - Time ranges: ${getPreferences(cal, 'COFFEE').preferredTimeRanges.map(r => 
             `${r.start}-${r.end}`).join(', ')}` 
         : 'Using default preferences'}
   - Busy periods:${cal.busyPeriods.map(p => 
     `\n     * ${formatDateWithTZ(p.start)} to ${formatDateWithTZ(p.end)}`
   ).join('')}`
).join('\n')}`;

    const userPrompt = `Parse and analyze this meeting request: "${test.input}"

Required:
1. Extract EXACT date and time if specified
2. Extract EXACT location if specified
3. Determine meeting type and appropriate duration
4. Verify the suggested time doesn't conflict with any attendee's calendar
5. Format all times in ISO format with timezone

IMPORTANT: Return ONLY a JSON object with NO additional text or markdown formatting:
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
        ]
      });

      console.log('\nRaw OpenAI Response:', completion.choices[0].message.content);
      const response = JSON.parse(completion.choices[0].message.content);
      console.log('\nOpenAI Response:', JSON.stringify(response, null, 2));

      // Validate the response
      const parsedDate = new Date(response.parsedRequest.dateTime);
      console.log('\nValidation:');
      console.log('- Parsed date:', parsedDate.toLocaleString());
      console.log('- Location:', response.parsedRequest.location);
      console.log('- Type:', response.parsedRequest.type);
      console.log('- Duration:', response.parsedRequest.duration, 'minutes');

      // Validate each suggested slot
      for (const slot of response.suggestedSlots) {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        
        console.log('\nChecking slot:', formatDateWithTZ(start), 'to', formatDateWithTZ(end));
        
        // Check preferences
        for (const cal of test.calendars) {
          const prefs = getPreferences(cal, response.parsedRequest.type);
          const startTime = start.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Los_Angeles'
          });
          
          if (!isWithinTimeRange(startTime, prefs.preferredTimeRanges)) {
            console.log(`Warning: Slot is outside ${cal.name}'s preferred time ranges`);
            console.log('Preferred ranges:', prefs.preferredTimeRanges);
          }

          const duration = (end.getTime() - start.getTime()) / 60000;
          if (duration !== prefs.preferredDuration) {
            console.log(`Warning: Duration (${duration} min) doesn't match ${cal.name}'s preference (${prefs.preferredDuration} min)`);
          }
        }

        // Check conflicts
        const conflicts = test.calendars.flatMap(cal => {
          const calendarConflicts = cal.busyPeriods.filter(busy => {
            const conflict = (
              (start >= busy.start && start < busy.end) || // Start during busy period
              (end > busy.start && end <= busy.end) || // End during busy period
              (start <= busy.start && end >= busy.end) || // Busy period contained within slot
              (start <= busy.start && end > busy.start) || // Start before busy period but end during it
              (start < busy.end && end >= busy.end) // Start during busy period but end after it
            );
            if (conflict) {
              console.log(`Conflict with ${cal.name}'s calendar:`, 
                formatDateWithTZ(busy.start), 'to', formatDateWithTZ(busy.end));
            }
            return conflict;
          });
          return calendarConflicts;
        });

        console.log('\nSlot:', formatDateWithTZ(start), 'to', formatDateWithTZ(end));
        console.log('Conflicts:', conflicts.length ? 'YES' : 'NO');
        if (conflicts.length) {
          console.log('Conflicting periods:', conflicts.map(p => ({
            start: formatDateWithTZ(p.start),
            end: formatDateWithTZ(p.end)
          })));
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

testOpenAIScheduling().catch(console.error);
