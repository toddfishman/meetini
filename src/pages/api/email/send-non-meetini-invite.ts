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

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { inviteId, invite, nonUsers, meetiniUsers, creator } = req.body;

    // Send email to each non-Meetini user
    const emailPromises = nonUsers.map(async (userEmail: string) => {
      const participant = invite.participants.find(p => p.email === userEmail);
      const emailContent = generateNonMeetiniInviteEmail(inviteId, invite, participant?.name || userEmail, creator);

      console.log('Sending non-Meetini invite email to:', userEmail);

      await resend.emails.send({
        from: 'Meetini <onboarding@resend.dev>',
        to: userEmail,
        subject: `${creator.name} invited you to ${invite.title}`,
        html: emailContent
      });

      console.log('Email sent successfully to:', userEmail);
    });

    await Promise.all(emailPromises);

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error sending non-Meetini invite emails:', error);
    return res.status(500).json({ 
      error: 'Failed to send non-Meetini invite emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateNonMeetiniInviteEmail(
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
        <p>
          You've been invited to a meeting via Meetini. To respond to this invitation and make scheduling easier,
          <a href="${process.env.NEXTAUTH_URL}/signup" style="color: #10B981; text-decoration: underline;">
            create a Meetini account
          </a>.
        </p>
        <p>
          Or, you can respond directly to ${creator.name} at <a href="mailto:${creator.email}">${creator.email}</a>.
        </p>
      </div>

      <p style="color: #666; font-size: 14px;">
        This invitation was sent via Meetini - Making meeting scheduling effortless.
      </p>
    </div>
  `;
}
