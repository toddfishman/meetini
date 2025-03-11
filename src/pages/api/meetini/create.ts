import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not set in environment variables');
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface MeetiniUser {
  isMeetiniUser: boolean;
  preferences?: any;
  name: string | null;
}

interface MeetiniInvite {
  title?: string;
  description?: string;
  location?: string;
  type: string;
  participants: Array<{ email: string; name?: string }>;
  suggestedTimes?: string[];
  createdBy: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { invite, userStatuses } = req.body;
    
    if (!invite || !userStatuses) {
      return res.status(400).json({ error: 'Missing invite or userStatuses data' });
    }

    if (!invite.type || !invite.participants || invite.participants.length === 0) {
      return res.status(400).json({ error: 'Invalid invite data' });
    }

    console.log('Creating invite with data:', { invite, userStatuses });

    // Create the Meetini invite in the database
    const newInvite = await prisma.meetiniInvite.create({
      data: {
        title: invite.title || 'New Meeting',
        type: invite.type,
        status: 'pending',
        createdBy: session.user.email,
        location: invite.location,
        description: invite.description,
        proposedTimes: {
          create: (invite.suggestedTimes || []).map(time => ({
            dateTime: new Date(time),
            status: 'pending'
          }))
        },
        participants: {
          create: invite.participants.map(participant => ({
            email: participant.email.toLowerCase(),
            status: 'pending',
            isMeetiniUser: userStatuses[participant.email.toLowerCase()]?.isMeetiniUser || false
          }))
        }
      },
      include: {
        proposedTimes: true,
        participants: true
      }
    });

    console.log('Created invite:', newInvite);

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set. Skipping email sending.');
      return res.status(200).json({ 
        ...newInvite,
        warning: 'Invite created but emails not sent - missing API key'
      });
    }

    // Send emails directly using Resend
    try {
      const emailPromises = invite.participants.map(async (participant) => {
        try {
          const emailContent = generateInviteEmail(
            newInvite.id,
            invite,
            participant.name || participant.email,
            session.user
          );

          console.log('Sending invite email to:', participant.email);

          const result = await resend.emails.send({
            from: 'Meetini <invites@meetini.ai>',
            to: participant.email,
            subject: `${session.user.name || 'Someone'} invited you to ${invite.title || 'a meeting'}`,
            html: emailContent
          }).catch(error => {
            console.error('Resend API error:', error);
            throw error;
          });

          console.log('Email sent successfully to:', participant.email, result);
          return result;
        } catch (error) {
          console.error('Failed to send email to:', participant.email, error);
          throw error;
        }
      });

      await Promise.all(emailPromises);
      console.log('All emails sent successfully');
    } catch (emailError) {
      console.error('Failed to send invite emails:', emailError);
      // Don't fail the whole request if email sending fails
      return res.status(200).json({ 
        ...newInvite,
        warning: 'Invite created but failed to send emails: ' + (emailError instanceof Error ? emailError.message : 'Unknown error')
      });
    }

    return res.status(200).json(newInvite);
  } catch (error) {
    console.error('Error creating Meetini invite:', error);
    return res.status(500).json({ 
      error: 'Failed to create Meetini invite',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateInviteEmail(
  inviteId: string,
  invite: MeetiniInvite,
  recipientName: string,
  creator: { name?: string; email: string }
): string {
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${creator.name || creator.email} invited you to ${invite.title}</h2>

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

  console.log('Generated email content:', {
    inviteId,
    recipientName,
    creator,
    content: emailContent
  });

  return emailContent;
}
