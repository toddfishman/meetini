import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { emails } = req.body;

    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails must be an array' });
    }

    console.log('Email configuration:', {
      apiKey: process.env.RESEND_API_KEY ? 'Set' : 'Not set',
      emails
    });

    // Send test email to each recipient
    const emailPromises = emails.map(async (email: string) => {
      const emailContent = generateTestEmail(email);

      console.log('Sending test email to:', email);

      await resend.emails.send({
        from: 'Meetini <onboarding@resend.dev>',
        to: email,
        subject: 'Test Meetini Invitation',
        html: emailContent
      });

      console.log('Email sent successfully to:', email);
    });

    await Promise.all(emailPromises);

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error sending test emails:', error);
    return res.status(500).json({ 
      error: 'Failed to send test emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateTestEmail(recipientEmail: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>This is a test Meetini invitation!</h2>

      <p>The Meetini team is testing the email system.</p>

      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Test Meeting</h3>
        <p><strong>Type:</strong> Test</p>
        <p><strong>Location:</strong> Virtual</p>
        <p><strong>Description:</strong> This is a test email to verify that the Meetini email system is working correctly.</p>
      </div>

      <p>This is just a test email. No action is required.</p>

      <div style="margin: 20px 0;">
        <a href="${process.env.NEXTAUTH_URL}" 
           style="background-color: #10B981; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Visit Meetini
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        This test email was sent via Meetini - Making meeting scheduling effortless.
      </p>
    </div>
  `;
}
