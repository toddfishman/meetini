import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { parseMeetingRequest } from '@/lib/openai';
import { findOptimalTimes } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface ParsedMeetingRequest {
  title: string;
  participants: string[];
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual';
  };
  location?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Log the incoming prompt
    console.log('Received prompt:', prompt);

    // Step 1: Parse the natural language request using AI and find contacts
    try {
      const parsedRequest = await parseMeetingRequest(req, prompt);
      console.log('Parsed request:', parsedRequest);

      if (!parsedRequest.participants || parsedRequest.participants.length === 0) {
        return res.status(400).json({ 
          error: 'No participants found in the request. Please mention who you want to meet with.' 
        });
      }

      // Step 2: Find optimal meeting times using calendar availability
      const proposedTimes = await findOptimalTimes(
        req,
        parsedRequest.participants,
        parsedRequest.preferences
      );

      if (!proposedTimes || proposedTimes.length === 0) {
        return res.status(400).json({ 
          error: 'Could not find any suitable meeting times. Please try different preferences or participants.' 
        });
      }

      // Step 3: Create the invitation in the database
      const newInvite = await prisma.meetiniInvite.create({
        data: {
          title: parsedRequest.title,
          type: 'meetini',
          status: 'pending',
          createdBy: session.user.email,
          location: parsedRequest.location,
          proposedTimes: {
            create: proposedTimes.map(slot => ({
              dateTime: new Date(slot.start),
              status: 'pending'
            }))
          },
          participants: {
            create: parsedRequest.participants.map(email => ({
              email: email.toLowerCase(),
              status: 'pending',
              isMeetiniUser: false // We'll update this later
            }))
          }
        },
        include: {
          proposedTimes: true,
          participants: true
        }
      });

      // Step 4: Send emails
      try {
        const emailPromises = parsedRequest.participants.map(async (email) => {
          try {
            const emailContent = generateInviteEmail(
              newInvite.id,
              {
                title: parsedRequest.title,
                type: 'meetini',
                location: parsedRequest.location,
                participants: parsedRequest.participants.map(p => ({ email: p })),
                suggestedTimes: proposedTimes.map(t => t.start),
                createdBy: session.user.email
              },
              email,
              session.user
            );

            console.log('Sending invite email to:', email);

            const result = await resend.emails.send({
              from: 'Meetini <invites@meetini.ai>',
              to: email,
              subject: `${session.user.name || 'Someone'} invited you to ${parsedRequest.title || 'a meeting'}`,
              html: emailContent
            });

            console.log('Email sent successfully to:', email, result);
            return result;
          } catch (error) {
            console.error('Failed to send email to:', email, error);
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
          warning: 'Invite created but failed to send emails'
        });
      }

      return res.status(200).json(newInvite);
    } catch (parseError) {
      console.error('Error parsing meeting request:', parseError);
      return res.status(400).json({ 
        error: 'Could not understand the meeting request. Please try rephrasing it.',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Failed to process AI request:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateInviteEmail(
  inviteId: string,
  invite: {
    title: string;
    type: string;
    location?: string;
    participants: Array<{ email: string }>;
    suggestedTimes: string[];
    createdBy: string;
  },
  recipientName: string,
  creator: { name?: string; email: string }
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${creator.name || creator.email} invited you to ${invite.title}</h2>

      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">${invite.title}</h3>
        <p><strong>Type:</strong> ${invite.type}</p>
        ${invite.location ? `<p><strong>Location:</strong> ${invite.location}</p>` : ''}
        <p><strong>Participants:</strong></p>
        <ul>
          ${invite.participants.map(p => `<li>${p.email}</li>`).join('')}
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