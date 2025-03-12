import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface MeetiniInvite {
  title?: string;
  description?: string;
  location?: string;
  type: string;
  participants: Array<{ email: string; name?: string }>;
  suggestedTimes?: string[];
  createdBy: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping email send');
    return res.status(200).json({ status: 'success', warning: 'Email sending skipped - RESEND_API_KEY not configured' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { inviteId, invite, users, creator } = req.body;

    if (!inviteId || !invite || !users || !creator) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Sending Meetini invite emails:', { inviteId, invite, users, creator });

    // Send email to each Meetini user
    const emailPromises = users.map(async (userEmail: string) => {
      try {
        const participant = invite.participants.find(p => p.email === userEmail);
        const emailContent = generateMeetiniInviteEmail(inviteId, invite, participant?.name || userEmail, creator);

        console.log('Sending Meetini invite email to:', userEmail);

        const result = await resend.emails.send({
          from: 'Meetini <onboarding@resend.dev>',
          to: userEmail,
          subject: `${creator.name || 'Someone'} invited you to ${invite.title || 'a meeting'}`,
          html: emailContent
        });

        console.log('Email sent successfully to:', userEmail, result);
        return result;
      } catch (error) {
        console.error('Failed to send email to:', userEmail, error);
        throw error;
      }
    });

    const results = await Promise.all(emailPromises);
    console.log('All emails sent successfully:', results);

    return res.status(200).json({ status: 'success', results });
  } catch (error) {
    console.error('Error sending Meetini invite emails:', error);
    return res.status(500).json({ 
      error: 'Failed to send Meetini invite emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateMeetiniInviteEmail(
  inviteId: string,
  invite: MeetiniInvite,
  recipientName: string,
  creator: { name: string; email: string }
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${creator.name} invited you to ${invite.title}</h2>

      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">${invite.title}</h3>
        <p><strong>Type:</strong> ${invite.type}</p>
        ${invite.location ? `<p><strong>Location:</strong> ${invite.location}</p>` : ''}
        ${invite.description ? `<p><strong>Description:</strong> ${invite.description}</p>` : ''}
        <p><strong>Participants:</strong></p>
        <ul>
          ${invite.participants.map(p => `<li>${p.name || p.email}</li>`).join('')}
        </ul>
        ${invite.suggestedTimes?.length ? `
          <p><strong>Suggested Times:</strong></p>
          <ul>
            ${invite.suggestedTimes.map(time => `
              <li>${new Date(time).toLocaleString()}</li>
            `).join('')}
          </ul>
        ` : ''}
      </div>

      <div style="margin: 20px 0;">
        <a href="${process.env.NEXTAUTH_URL}/invite/${inviteId}" 
           style="background-color: #10B981; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          View and Respond
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        This invitation was sent via Meetini - Making meeting scheduling effortless.
      </p>
    </div>
  `;
}
