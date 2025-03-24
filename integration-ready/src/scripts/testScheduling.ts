import { config } from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { MeetingPlanner } from '../lib/meetingPlanner';
import { MeetingType, UserPreferences } from '../lib/types/preferences';

config(); // Load environment variables

async function main() {
  // Set up authentication
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN_1
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const planner = new MeetingPlanner(
    process.env.OPENAI_API_KEY || '',
    calendar
  );

  // Test cases
  const testCases = [
    {
      input: "Schedule a coffee with John from marketing and Sarah next Tuesday",
      type: MeetingType.COFFEE
    },
    {
      input: "Set up a lunch meeting with the engineering team - Dave, Mike, and Jennifer",
      type: MeetingType.LUNCH
    },
    {
      input: "Quick sync with Alex about the new project",
      type: MeetingType.SYNC
    }
  ];

  // Sample user preferences
  const preferences: UserPreferences = {
    userId: process.env.EMAIL_1 || '',
    email: process.env.EMAIL_1 || '',
    workingHours: {
      0: { start: "09:00", end: "17:00" }, // Sunday
      1: { start: "09:00", end: "17:00" }, // Monday
      2: { start: "09:00", end: "17:00" }, // Tuesday
      3: { start: "09:00", end: "17:00" }, // Wednesday
      4: { start: "09:00", end: "17:00" }, // Thursday
      5: { start: "09:00", end: "17:00" }, // Friday
      6: { start: "09:00", end: "17:00" }  // Saturday
    },
    preferredDays: [1, 2, 3, 4, 5], // Monday to Friday
    avoidDays: [0, 6], // Avoid weekends
    calendars: [{ id: 'primary', selected: true }],
    defaultCalendarId: 'primary',
    calendarsToCheck: ['primary'],
    meetingPreferences: {
      [MeetingType.COFFEE]: {
        preferredDuration: 30,
        preferredBuffer: 15,
        preferredLocation: 'Coffee Shop',
        preferredTimeRanges: [
          { start: "10:00", end: "11:00" },
          { start: "15:00", end: "16:00" }
        ]
      },
      [MeetingType.LUNCH]: {
        preferredDuration: 60,
        preferredBuffer: 15,
        preferredLocation: 'Restaurant',
        preferredTimeRanges: [
          { start: "12:00", end: "14:00" }
        ]
      },
      [MeetingType.MEETING]: {
        preferredDuration: 45,
        preferredBuffer: 10,
        preferredLocation: 'Office',
        preferredTimeRanges: [
          { start: "09:30", end: "11:30" },
          { start: "14:00", end: "16:00" }
        ]
      },
      [MeetingType.SYNC]: {
        preferredDuration: 15,
        preferredBuffer: 5,
        preferredLocation: 'Virtual',
        preferredTimeRanges: [
          { start: "09:00", end: "17:00" }
        ]
      }
    },
    minTimeBetweenMeetings: 15,
    maxMeetingsPerDay: 8,
    defaultContext: 'work',
    defaultMeetingLength: 'medium',
    defaultBuffer: 10,
    focusTimeEnabled: true,
    focusTimeBlocks: [
      { start: "09:00", end: "10:00" },
      { start: "14:00", end: "15:00" }
    ],
    focusDays: [1, 3, 5], // Monday, Wednesday, Friday
    autoScheduleFocusTime: true,
    defaultToVirtual: true,
    defaultNotificationTiming: 15,
    notificationTypes: ['email', 'calendar'],
    timezone: 'America/Los_Angeles',
    autoUpdateTimezone: true,
    defaultVisibility: 'default',
    shareCalendarWith: [],
    aiSuggestionsEnabled: true,
    suggestAlternativeTimes: true,
    suggestLocationBasedOnTime: true,
    suggestBreakup: true,
    preparationTimeNeeded: 10,
    breakdownTimeNeeded: 5,
    considerCommuteTime: true
  };

  for (const test of testCases) {
    console.log('\n-----------------------------------');
    console.log(`Testing: "${test.input}"`);
    console.log('-----------------------------------');

    try {
      const plan = await planner.planFromText(
        test.input,
        process.env.EMAIL_1 || '',
        test.type,
        { includeSocialNetworks: false }
      );

      console.log('\nOrganizer:');
      console.log(JSON.stringify(plan.organizer, null, 2));

      console.log('\nAttendees:');
      for (const attendee of plan.attendees) {
        console.log('\nName:', attendee.name);
        console.log('Possible contacts:');
        for (const contact of attendee.possibleContacts) {
          console.log(`- ${contact.name} (${contact.email || 'no email'}) [confidence: ${contact.confidence}]`);
        }
        if (attendee.selectedContact) {
          console.log('Selected contact:', attendee.selectedContact.name);
        } else {
          console.log('No contact selected - needs resolution');
        }
      }

      if (plan.needsContactResolution) {
        console.log('\n⚠️ Some contacts need resolution');
      }

      if (plan.ambiguousContacts) {
        console.log('\n⚠️ Some contacts are ambiguous');
      }

      console.log('\nSuggested times:');
      for (const time of plan.suggestedTimes) {
        console.log(`- ${new Date(time.start).toLocaleString()} to ${new Date(time.end).toLocaleString()}`);
        console.log(`  Score: ${time.score}`);
        console.log(`  Reason: ${time.reason}`);
      }

    } catch (error) {
      console.error(`Error processing "${test.input}":`, error);
    }
  }
}

main().catch(console.error);
