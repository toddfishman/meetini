import { Request, Response } from 'express';
import { SmartScheduler } from '../../../lib/smartScheduling/smartScheduler';
import { ContactExtractor } from '../../../lib/smartScheduling/contactExtractor';
import { calendar_v3, people_v1, google } from 'googleapis';
import { getSession } from 'next-auth/react';
import { MeetingType } from '../../../lib/types/preferences';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Initialize Google clients
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: session.accessToken,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/contacts.readonly'
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const people = google.people({ version: 'v1', auth });

    // Initialize services
    const contactExtractor = new ContactExtractor(process.env.OPENAI_API_KEY!, people);
    const scheduler = new SmartScheduler(process.env.OPENAI_API_KEY!, calendar);

    // Extract meeting type and natural language input from request
    const { input = '' } = req.body;

    console.log('Processing request with input:', input);

    // First, extract contacts from the input
    const { contacts, remainingText } = await contactExtractor.extractContacts(input);
    
    console.log('Extracted contacts:', contacts);
    console.log('Remaining text:', remainingText);

    // Add the current user to attendees if not already included
    const attendees = contacts.map(contact => ({
      email: contact.email || '',
      name: contact.name
    }));

    if (!attendees.some(a => a.email === session.user?.email)) {
      attendees.unshift({
        email: session.user?.email || '',
        name: session.user?.name || ''
      });
    }

    console.log('Final attendees:', attendees);

    // Create scheduling request
    const request = {
      userId: session.user?.email || 'primary',
      userPrefs: {
        userId: session.user?.email || 'primary',
        workingHours: {
          1: { start: '09:00', end: '17:00' }, // Monday
          2: { start: '09:00', end: '17:00' }, // Tuesday
          3: { start: '09:00', end: '17:00' }, // Wednesday
          4: { start: '09:00', end: '17:00' }, // Thursday
          5: { start: '09:00', end: '17:00' }, // Friday
        },
        defaultContext: 'both',
        meetingPreferences: {},
        minTimeBetweenMeetings: 15,
        maxMeetingsPerDay: 8,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      meetingType: MeetingType.MEETING, // This will be overridden by OpenAI analysis
      earliestTime: new Date().toISOString(),
      latestTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      naturalLanguageInput: remainingText, // Use the text without names for time analysis
      attendees
    };

    console.log('Scheduling request:', request);

    // Process the scheduling request
    const result = await scheduler.findAvailableSlots(request);

    console.log('Scheduling result:', result);

    // Add contact information to the response
    res.status(200).json({
      ...result,
      contacts: contacts.map(c => ({
        name: c.name,
        email: c.email,
        confidence: c.confidence
      }))
    });
  } catch (error) {
    console.error('Error in test-scheduling:', error);
    res.status(500).json({ error: 'Failed to test scheduling', details: error.message });
  }
}
