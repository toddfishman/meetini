import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import OpenAI from 'openai';
import { availableFunctions } from '../assistant/chat';
import { getAvailability } from '../../../lib/calendar/calendarAvailability';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OpenAI config');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v2'
  }
});

interface TimeContext {
  type: string; // 'specific', 'relative', 'default'
  startDate?: string;
  endDate?: string;
  specificDays?: number[]; // 0-6, where 0 is Sunday
  timeOfDay?: string; // 'morning', 'afternoon', 'evening', 'all-day'
  description?: string; // Human readable description of the time context
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { message, participants } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!participants?.length) return res.status(400).json({ error: 'At least one participant is required' });

    // First, let's extract the time context from the user's message
    const timeContext = await extractTimeContext(message);
    console.log('Extracted time context:', timeContext);

    const thread = await openai.beta.threads.create();

    // Create an initial message from the user
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });

    // Create a run with the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID!,
      instructions: `You are a professional and intelligent scheduling assistant with deep contextual understanding. You analyze meeting requests, extract participants, preferences, and determine optimal meeting times based on real-world logic and availability.

TIMEZONE AND SCHEDULING CRITICAL RULES:
1. ALWAYS respect the user's local timezone
2. NEVER schedule meetings between 10:00 PM and 7:00 AM in the participant's local timezone
3. ALWAYS display times in the user's local timezone
4. NEVER schedule meetings that overlap with existing busy times in calendars
5. DOUBLE CHECK the proposed time isn't at an inappropriate hour (e.g., 2 AM)
6. When converting timezones, always verify times are reasonable in the participant's timezone

STRICT SCHEDULING RULES - FOLLOW THESE WITHOUT EXCEPTION:
1. Use the current date (${new Date().toISOString()}) as reference point
2. NEVER schedule meetings in the past
3. NEVER double-book over existing calendar events
4. Consider meeting types when determining time slots
5. ALWAYS check availability before scheduling any meeting

TIME PHRASE INTERPRETATION RULES:
1. "next week" = Monday-Friday of the following calendar week
2. "early next week" = Monday-Tuesday of the following calendar week
3. "late next week" = Thursday-Friday of the following calendar week
4. "this week" = remaining days of the current week
5. "early this week" = earlier days of current week still remaining
6. "late this week" = Thursday-Friday of current week if still remaining 
7. "tomorrow" = the next calendar day
8. "weekend" = Saturday and Sunday

UNDERSTANDING CONTEXT & MEANING:
1. EXPLICIT TIME DIRECTIVES: When users specify exact dates/times ("coffee next Thursday"), honor those specific requests while still ensuring availability
2. IMPLICIT CONTEXT: Understand the contextual timing requirements of different events:
   - Fantasy football drafts: Schedule before NFL season starts (early September)
   - Holiday planning: Schedule sufficiently before the holiday
   - Conference prep: Schedule before the conference date
   - Quarterly reviews: Schedule near end of quarter
3. CULTURAL CONTEXT: For common activities, apply appropriate cultural norms:
   - Happy hours: Typically after work hours on weekdays
   - Brunch: Typically weekend late mornings
   - Business meetings: Typically during work hours

MEETING TYPE TIME PREFERENCES:
1. Coffee meetings: 8:00 AM - 11:00 AM
2. Breakfast meetings: 7:30 AM - 9:30 AM
3. Lunch meetings: 11:30 AM - 1:30 PM
4. Happy hours: 4:00 PM - 6:30 PM
5. Dinner: 6:00 PM - 8:30 PM
6. Business/work meetings: 9:00 AM - 5:00 PM
7. Weekend social events: 10:00 AM - 8:00 PM
8. Team standup meetings: 9:00 AM - 10:30 AM
9. One-on-one meetings: 9:00 AM - 4:00 PM

USER PREFERENCES:
1. ALWAYS check and prioritize user preferences when scheduling
2. Working hours preferences should supersede default meeting times
3. Honor day preferences (like "prefers Tuesdays") when possible
4. Consider duration preferences for specific meeting types

Default meeting duration is 1 hour unless specified otherwise, with coffee chats typically 30 minutes.

When suggesting times, ALWAYS PRIORITIZE:
1. Avoiding busy times in calendars
2. Respecting user preferences
3. Daylight hours appropriate for the meeting type
4. Context-appropriate scheduling (season, holiday, event timing)
5. Weekdays for business meetings, unless weekend is explicitly requested

LAST VERIFICATION BEFORE SCHEDULING:
1. Double-check the time you've selected is during appropriate hours
2. Ensure it doesn't conflict with busy calendar times
3. Verify it respects the contextual needs of the meeting type
4. Make sure the time is converted correctly to the local timezone
5. Never schedule at odd hours like 2 AM or midnight

Example: For "Coffee with Todd next week", you should:
- Recognize this as a coffee meeting (morning preference)
- Check participant availability AND preferences
- Suggest only available morning slots between 8-11am during business days
- Consider Todd's personal preferences if known

Example: For "Fantasy football draft with friends", you should:
- Recognize this needs to happen before NFL season starts
- Choose evening or weekend times suitable for social gatherings
- Ensure enough time for the activity (2+ hours)

The participants in this meeting are: ${participants.join(', ')}

REQUIRED STEPS:
1. Call findParticipants to validate the participant emails
2. Call findAvailableTimes to get their specific calendar availability
3. Analyze the suggested times, meeting context, AND user preferences
4. ONLY select times that match the meeting type and context (no 2am meetings!)
5. Double-check the time is reasonable in all participants' timezones
6. Call scheduleMeeting with the most appropriate time slot based on ALL factors`
    });

    let completedRun = await waitForRunCompletion(thread.id, run.id);
    let suggestedTimes: string[] = [];
    let toolOutputs: Array<{ tool_call_id: string; output: string }> = [];
    let scheduledTime: string | null = null;

    // Track the extracted time window from OpenAI's responses
    let extractedTimeWindow: { startDate?: string; endDate?: string } | null = null;

    while (completedRun.status === 'requires_action') {
      const toolCalls = completedRun.required_action?.submit_tool_outputs.tool_calls;
      if (!toolCalls?.length) break;

      // Clear tool outputs for each batch
      toolOutputs = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        // If a findAvailableTimes call is being made and we have time context,
        // apply our extracted time context to the arguments
        if (functionName === 'findAvailableTimes' && timeContext.type !== 'default') {
          console.log('Original timeWindow:', args.timeWindow);
          
          // Apply the time context we extracted
          if (timeContext.startDate && timeContext.endDate) {
            args.timeWindow = {
              startDate: timeContext.startDate,
              endDate: timeContext.endDate
            };
            
            // Also include our time-of-day understanding in the preference
            if (timeContext.timeOfDay && (!args.timePreference || args.timePreference === 'any')) {
              args.timePreference = timeContext.timeOfDay;
            }
            
            console.log('Modified timeWindow based on extracted context:', args.timeWindow);
          }
        }

        if (functionName in availableFunctions) {
          try {
            const result = await availableFunctions[functionName as keyof typeof availableFunctions](args, req, res);
            console.log(`Function ${functionName} result:`, result);

            // If the function returns success: false, treat it as an error
            if (result.success === false) {
              throw new Error(result.error || 'Function failed');
            }

            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(result)
            });
            
            // Store times from findAvailableTimes
            if (functionName === 'findAvailableTimes' && result.success) {
              suggestedTimes = result.availableTimes || [];

              // Save the time window that was used
              if (args.timeWindow) {
                extractedTimeWindow = args.timeWindow;
              }
            }
            
            // Store the scheduled time
            if (functionName === 'scheduleMeeting' && result.success) {
              scheduledTime = args.startTime;
            }
          } catch (err) {
            console.error(`Function ${functionName} failed:`, err);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: 'Function failed', details: err instanceof Error ? err.message : 'Unknown error' })
            });
          }
        }
      }

      completedRun = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
        tool_outputs: toolOutputs
      });

      completedRun = await waitForRunCompletion(thread.id, run.id);
    }

    const messages = await openai.beta.threads.messages.list(thread.id);

    // Find any error from tool outputs
    const errorOutput = toolOutputs.find(output => {
      try {
        const result = JSON.parse(output.output);
        return result.success === false || result.error;
      } catch {
        return false;
      }
    });

    // Parse error details if present
    const errorDetails = errorOutput ? JSON.parse(errorOutput.output).error || JSON.parse(errorOutput.output).details : undefined;

    // Get suggested times by combining existing times with those from our helper function
    const enhancedTimes = await getSuggestedTimes(req, message, participants);
    
    // Update suggestedTimes with enhanced results (keeping existing ones if any)
    if (enhancedTimes && enhancedTimes.length > 0) {
      // Add new times that aren't already in the list
      for (const time of enhancedTimes) {
        if (!suggestedTimes.includes(time)) {
          suggestedTimes.push(time);
        }
      }
    }
    
    // Check if we got any suggested times
    if (!suggestedTimes || suggestedTimes.length === 0) {
      return res.status(400).json({
        error: "No available times found",
        message: "We couldn't find any available time slots that work for all participants.",
        suggestion: "Try selecting a different time range, fewer participants, or check calendar permissions."
      });
    }
    
    // Log available times for debugging
    console.log(`Found ${suggestedTimes.length} available time slots`);
    
    // Return the suggested times and any other relevant data
    return res.status(200).json({
      messages: messages.data,
      suggestedTimes,
      timeContext: timeContext ? timeContext.description : 'Default scheduling window',
      extractedTimeWindow,
      error: errorDetails ? { details: errorDetails } : undefined,
      message: "Successfully found available time slots for all participants."
    });
  } catch (error) {
    console.error('AI-CREATE ERROR:', error);
    
    // Provide more specific error messages based on the error type
    if (error instanceof Error) {
      if (error.message.includes('calendar')) {
        return res.status(500).json({
          error: "Calendar access issue",
          details: error.message,
          suggestion: "There was a problem accessing your calendar. Please check your permissions and try again."
        });
      } else if (error.message.includes('busy') || error.message.includes('availability')) {
        return res.status(400).json({
          error: "Calendar availability issue",
          details: error.message,
          suggestion: "All participants seem to be busy during the requested time. Try a different time range or fewer participants."
        });
      }
    }
    
    return res.status(500).json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : String(error),
      suggestion: "Please try again or contact support if the issue persists."
    });
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0;
  while (attempts < 60) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    if (['completed', 'requires_action', 'failed'].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  throw new Error('Run timed out');
}

/**
 * Extracts time context from a message using OpenAI to understand natural language
 */
async function extractTimeContext(message: string): Promise<TimeContext> {
  try {
    // Get current date to provide as context
    const now = new Date();
    const currentDateISO = now.toISOString();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();
    
    // Format a human-readable date for the system prompt
    const formattedDate = now.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Use OpenAI to extract the time context
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a specialized scheduling assistant. Your only job is to extract the time context from the user's meeting request.

CRITICAL INFORMATION:
- Today's date is ${formattedDate} (${currentDateISO})
- You MUST use this exact current date as your reference point
- All dates you generate MUST be in the future relative to today
- NEVER return dates from the past

Return a JSON object with this exact structure:
{
  "type": "specific" | "relative" | "default",
  "startDate": "ISO date string for the earliest date to consider",
  "endDate": "ISO date string for the latest date to consider",
  "specificDays": [Array of day numbers, 0-6 where 0 is Sunday],
  "timeOfDay": "morning" | "afternoon" | "evening" | "all-day",
  "description": "Human-readable description of the time context"
}

Examples of specific time phrases and how to handle them (ADJUST ALL DATES RELATIVE TO TODAY, ${formattedDate}):
1. "late next week" -> 
  - type: "relative"
  - startDate: Next Thursday at 9am
  - endDate: Next Friday at 5pm
  - timeOfDay: depends on meeting type
  - description: "Late next week (Thursday-Friday)"

2. "early next week" -> 
  - type: "relative" 
  - startDate: Next Monday at 9am
  - endDate: Next Tuesday at 5pm
  - timeOfDay: depends on meeting type
  - description: "Early next week (Monday-Tuesday)"

3. "next month" ->
  - type: "relative"
  - startDate: First day of next month at 9am
  - endDate: Last day of next month at 5pm
  - timeOfDay: depends on meeting type
  - description: "Sometime next month"

4. "tomorrow afternoon" ->
  - type: "specific"
  - startDate: Tomorrow at 12pm
  - endDate: Tomorrow at 5pm
  - timeOfDay: "afternoon"
  - description: "Tomorrow afternoon"

5. No time specified -> 
  - type: "default"
  - startDate: Tomorrow at 9am
  - endDate: 10 business days from now at 5pm
  - timeOfDay: depends on meeting type
  - description: "Default scheduling window (next two weeks)"

DO NOT include explanations or extra text — only return the final JSON result.`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      console.warn('No time context extracted, using defaults');
      return getDefaultTimeContext();
    }

    try {
      const parsed = JSON.parse(aiResponse);
      console.log('Extracted time context:', parsed);
      
      // Validate that the dates are in the future
      const startDate = new Date(parsed.startDate);
      const endDate = new Date(parsed.endDate);
      
      if (startDate < now) {
        console.warn('Extracted startDate is in the past, adjusting to tomorrow');
        // Fix to tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        parsed.startDate = tomorrow.toISOString();
      }
      
      if (endDate < now || endDate < startDate) {
        console.warn('Extracted endDate is invalid, adjusting to startDate + 2 days');
        // Fix to startDate + 2 days
        const fixedEnd = new Date(parsed.startDate);
        fixedEnd.setDate(fixedEnd.getDate() + 2);
        fixedEnd.setHours(17, 0, 0, 0);
        parsed.endDate = fixedEnd.toISOString();
      }
      
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse time context:', parseError);
      return getDefaultTimeContext();
    }
  } catch (error) {
    console.error('Error extracting time context:', error);
    return getDefaultTimeContext();
  }
}

/**
 * Returns a default time context when none could be extracted
 */
function getDefaultTimeContext(): TimeContext {
  const now = new Date();
  
  // Default to the next two weeks
  const startDate = new Date(now);
  startDate.setDate(now.getDate() + 1);
  startDate.setHours(9, 0, 0, 0);
  
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + 14);
  endDate.setHours(17, 0, 0, 0);
  
  return {
    type: "default",
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timeOfDay: "all-day",
    description: "Default scheduling window (next two weeks)"
  };
}

// Helper function to get suggested times considering calendar availability
async function getSuggestedTimes(req: NextApiRequest, message: string, participants: string[]) {
  try {
    // Extract time context from the message
    const timeContext = await extractTimeContext(message);
    
    // Get user's timezone
    const userTimezone = (req.headers['x-timezone'] as string) || 'America/Los_Angeles';
    
    // Extract specific meeting type clues from the message
    const meetingTypeClues = {
      happyHour: /happy\s*hour|drinks/i.test(message),
      coffee: /coffee|tea/i.test(message),
      lunch: /lunch|eat/i.test(message),
      breakfast: /breakfast/i.test(message),
      dinner: /dinner/i.test(message),
      business: /meeting|discuss|sync|call|conference|presentation/i.test(message),
      social: /hangout|party|celebrate|gathering/i.test(message)
    };
    
    // Set time preferences based on meeting type
    let timePreference;
    let suggestedDuration = 30; // Default 30 minutes
    
    if (meetingTypeClues.happyHour) {
      timePreference = 'happy hour'; // 4:00 PM - 6:30 PM
      suggestedDuration = 60; // Happy hours are typically 1 hour
    } else if (meetingTypeClues.coffee) {
      timePreference = 'coffee'; // 8:00 AM - 11:00 AM
      suggestedDuration = 30; // Coffee chats are typically 30 minutes
    } else if (meetingTypeClues.lunch) {
      timePreference = 'lunch'; // 11:30 AM - 1:30 PM
      suggestedDuration = 60; // Lunch is typically 1 hour
    } else if (meetingTypeClues.breakfast) {
      timePreference = 'breakfast'; // 7:30 AM - 9:30 AM
      suggestedDuration = 60; // Breakfast is typically 1 hour
    } else if (meetingTypeClues.dinner) {
      timePreference = 'dinner'; // 6:00 PM - 8:30 PM
      suggestedDuration = 90; // Dinners are typically 1.5 hours
    } else if (meetingTypeClues.business) {
      timePreference = 'business'; // 9:00 AM - 5:00 PM
      suggestedDuration = 30; // Business meetings are often 30 minutes
    } else if (meetingTypeClues.social) {
      timePreference = 'social'; // More flexible, but usually evenings or weekends
      suggestedDuration = 120; // Social events are often 2 hours
    } else if (timeContext.timeOfDay) {
      timePreference = timeContext.timeOfDay;
    }
    
    console.log(`Meeting type inferred from message: ${timePreference || 'none'}`);
    console.log(`Time context from message: ${timeContext.timeOfDay || 'none'}`);
    console.log(`Suggested duration: ${suggestedDuration} minutes`);
    
    // Check for registered users
    const registeredUsers = await prisma.user.findMany({
      where: {
        email: {
          in: participants
        }
      },
      select: {
        email: true
      }
    });
    
    const registeredEmails = registeredUsers.map(u => u.email);
    const unregisteredEmails = participants.filter(p => !registeredEmails.includes(p));
    
    console.log(`Registered participants: ${registeredEmails.length}, Unregistered: ${unregisteredEmails.length}`);
    
    // First attempt: Try to get availability for the requested time window with specific time preference
    let availability = await getAvailability(req, participants, {
      startDate: timeContext?.startDate || new Date().toISOString(),
      endDate: timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, timePreference, suggestedDuration);
    
    // Check if the specific meeting type didn't work, but we have times with generic timeOfDay preference
    if ((!availability.availableTimes || availability.availableTimes.length === 0) && timePreference && timeContext.timeOfDay) {
      console.log(`No times available with ${timePreference} preference, trying with ${timeContext.timeOfDay}...`);
      
      availability = await getAvailability(req, participants, {
        startDate: timeContext?.startDate || new Date().toISOString(),
        endDate: timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }, timeContext.timeOfDay, suggestedDuration);
    }
    
    // If still no times available with preferences, try with any time in the window
    if (!availability.availableTimes || availability.availableTimes.length === 0) {
      console.log("No times available with preferences, trying any time in window...");
      
      availability = await getAvailability(req, participants, {
        startDate: timeContext?.startDate || new Date().toISOString(),
        endDate: timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }, "all-day", suggestedDuration);
    }
    
    // If still no times available, try extending the window by a week
    if (!availability.availableTimes || availability.availableTimes.length === 0) {
      console.log("No times available in requested window, extending search by a week...");
      
      // Create an extended window
      const extendedEndDate = new Date(timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      extendedEndDate.setDate(extendedEndDate.getDate() + 7);
      
      availability = await getAvailability(req, participants, {
        startDate: timeContext?.startDate || new Date().toISOString(),
        endDate: extendedEndDate.toISOString()
      }, timePreference || timeContext.timeOfDay || "all-day", suggestedDuration);
    }
    
    // If still no times available with normal hours, try with extended hours
    if (!availability.availableTimes || availability.availableTimes.length === 0) {
      console.log("No times available with normal working hours, trying extended hours...");
      
      // Try with extended hours (e.g., including early morning and evening)
      availability = await getAvailability(req, participants, {
        startDate: timeContext?.startDate || new Date().toISOString(),
        endDate: timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }, "extended", suggestedDuration);
    }
    
    // Final check with both extended time range and extended hours
    if (!availability.availableTimes || availability.availableTimes.length === 0) {
      console.log("Still no times available, trying extended window with extended hours...");
      
      const extendedEndDate = new Date(timeContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      extendedEndDate.setDate(extendedEndDate.getDate() + 14); // Two more weeks
      
      availability = await getAvailability(req, participants, {
        startDate: timeContext?.startDate || new Date().toISOString(),
        endDate: extendedEndDate.toISOString()
      }, "extended", suggestedDuration);
    }
    
    // Log the final result
    if (availability.availableTimes && availability.availableTimes.length > 0) {
      console.log(`Found ${availability.availableTimes.length} suitable time slots after optimization`);
      
      // If we have unregistered participants, add a clear warning message
      if (availability.hasUnregisteredParticipants) {
        console.warn(`NOTE: ${availability.unregisteredParticipants.length} participants don't have calendar access.`);
        console.warn(`Unregistered participants: ${availability.unregisteredParticipants.join(', ')}`);
        console.warn('Suggested times are based on standard availability patterns and may not reflect their actual schedules.');
      }
    } else {
      console.log("No suitable time slots found even after trying all fallback strategies");
    }
    
    // Return available times, or empty array if none found
    return availability.availableTimes || [];
  } catch (error) {
    console.error("Error getting suggested times:", error);
    throw error;
  }
}