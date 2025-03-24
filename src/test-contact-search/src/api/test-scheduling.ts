import { Request, Response } from 'express';
import { SmartScheduler } from '../../../lib/smartScheduling/smartScheduler';
import { calendar_v3, google } from 'googleapis';
import { getSession } from 'next-auth/react';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Initialize Google Calendar client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: session.accessToken,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Initialize SmartScheduler
    const scheduler = new SmartScheduler(process.env.OPENAI_API_KEY!, calendar);

    // Process the scheduling request
    const result = await scheduler.findAvailableSlots(req.body);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in test-scheduling:', error);
    res.status(500).json({ error: 'Failed to test scheduling' });
  }
}
