import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { EmailService } from '@/lib/emailService';

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not configured');
}

if (!process.env.RESEND_FROM_EMAIL) {
  console.error('RESEND_FROM_EMAIL is not configured');
}

const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Simulate meeting details that would come from the AI analysis
    const testMeeting = {
      title: 'Coffee Chat with Todd and Bekah',
      type: 'Coffee Chat',
      dateTime: new Date('2025-03-13T14:00:00-07:00'),
      duration: '30 minutes',
      location: 'Virtual',
      description: 'Quick catch-up to discuss project updates',
      meetLink: 'https://meet.google.com/test-link',
      calendarLink: 'https://calendar.google.com/calendar/event/test-id',
      originalPrompt: 'Let\'s catch up over coffee and discuss the project updates',
      creator: {
        name: 'Todd',
        email: 'toddfishman@gmail.com'
      },
      participants: [
        'toddfishman@gmail.com',
        'toddfishman@gmail.com',
        'toddfishman@gmail.com'
      ]
    };

    const emailService = new EmailService();

    // Send both types of emails to toddfishman@gmail.com
    await emailService.sendMeetingCreatedConfirmation(testMeeting);
    await emailService.sendMeetingConfirmation(testMeeting);

    return res.status(200).json({ 
      success: true,
      message: 'Test emails sent successfully',
      details: {
        creator: 'toddfishman@gmail.com',
        participants: ['toddfishman@gmail.com']
      }
    });
  } catch (error) {
    console.error('Failed to send test emails:', error);
    return res.status(500).json({ 
      error: 'Failed to send test emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
