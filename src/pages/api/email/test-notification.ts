import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { EmailService } from '@/lib/emailService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getToken({ req });
    if (!token?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Test data
    const testDetails = {
      title: "Coffee Chat with Todd",
      dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      duration: 30,
      description: "Quick catch-up over coffee",
      meetLink: "https://meet.google.com/test-link",
      eventLink: "https://calendar.google.com/test-event",
      organizer: token.email as string,
      originalPrompt: "Schedule a virtual coffee chat with Todd tomorrow"
    };

    const participants = [token.email as string]; // Send to yourself for testing

    await EmailService.sendMeetingConfirmation(
      participants,
      testDetails,
      token.accessToken
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
}
