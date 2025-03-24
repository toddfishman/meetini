import { config } from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { MeetingPlanner } from '../lib/meetingPlanner';

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
      type: "coffee"
    },
    {
      input: "Set up a lunch meeting with the engineering team - Dave, Mike, and Jennifer",
      type: "lunch"
    },
    {
      input: "Quick sync with Alex about the new project",
      type: "meeting"
    }
  ];

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
