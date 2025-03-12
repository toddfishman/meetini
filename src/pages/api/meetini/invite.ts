import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from '@/lib/prisma';

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
  participants: string[];
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
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { invite, userStatuses } = req.body;

    // Separate users into Meetini users and non-users
    const meetiniUsers = Object.entries(userStatuses)
      .filter(([_, status]: [string, MeetiniUser]) => status.isMeetiniUser)
      .map(([email]) => email);

    const nonMeetiniUsers = Object.entries(userStatuses)
      .filter(([_, status]: [string, MeetiniUser]) => !status.isMeetiniUser)
      .map(([email]) => email);

    // Create the Meetini invite in the database
    const newInvite = await prisma.meetiniInvite.create({
      data: {
        title: invite.title || 'New Meeting',
        type: invite.type,
        status: 'pending',
        participants: invite.participants,
        proposedTimes: invite.suggestedTimes || [],
        location: invite.location,
        createdBy: session.user.email,
        meetiniUsers,
        nonMeetiniUsers
      }
    });

    // If we have any Meetini users, create calendar events
    if (meetiniUsers.length > 0 && invite.suggestedTimes?.length) {
      await createCalendarEvents(
        invite,
        meetiniUsers,
        session,
        newInvite.id
      );
    }

    // Send appropriate emails
    await sendInviteEmails(
      newInvite.id,
      invite,
      userStatuses,
      session.user
    );

    return res.status(200).json(newInvite);
  } catch (error) {
    console.error('Error creating Meetini invite:', error);
    return res.status(500).json({ 
      error: 'Failed to create Meetini invite',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function createCalendarEvents(
  invite: MeetiniInvite,
  meetiniUsers: string[],
  session: any,
  inviteId: string
) {
  const events = await Promise.all(
    (invite.suggestedTimes || []).map(async (timeSlot) => {
      const [startTime, endTime] = parseTimeSlot(timeSlot);
      
      const event = {
        summary: invite.title || 'New Meeting',
        description: generateEventDescription(invite, inviteId),
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        attendees: meetiniUsers.map(email => ({ email })),
        location: invite.location,
        status: 'tentative',
        transparency: 'tentative'
      };

      try {
        const response = await fetch(`${process.env.NEXTAUTH_URL}/api/calendar/create-event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: session.user.accessToken ? `next-auth.session-token=${session.user.accessToken}` : '',
          },
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          throw new Error('Failed to create calendar event');
        }

        return await response.json();
      } catch (error) {
        console.error('Error creating calendar event:', error);
        return null;
      }
    })
  );

  return events.filter(Boolean);
}

function generateEventDescription(invite: MeetiniInvite, inviteId: string) {
  return `
Meeting organized via Meetini
Type: ${invite.type}
${invite.description ? `\nDescription: ${invite.description}` : ''}
${invite.location ? `\nLocation: ${invite.location}` : ''}

View and respond to this Meetini: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteId}
  `.trim();
}

function parseTimeSlot(timeSlot: string): [string, string] {
  const startDate = new Date(timeSlot);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour meeting
  return [startDate.toISOString(), endDate.toISOString()];
}

async function sendInviteEmails(
  inviteId: string,
  invite: MeetiniInvite,
  userStatuses: Record<string, MeetiniUser>,
  creator: any
) {
  const meetiniUsers = Object.entries(userStatuses)
    .filter(([_, status]) => status.isMeetiniUser);
  const nonMeetiniUsers = Object.entries(userStatuses)
    .filter(([_, status]) => !status.isMeetiniUser);

  // Send emails to Meetini users
  if (meetiniUsers.length > 0) {
    await sendMeetiniUserEmails(
      inviteId,
      invite,
      meetiniUsers.map(([email]) => email),
      creator
    );
  }

  // Send emails to non-Meetini users
  if (nonMeetiniUsers.length > 0) {
    await sendNonMeetiniUserEmails(
      inviteId,
      invite,
      nonMeetiniUsers.map(([email]) => email),
      meetiniUsers.map(([email]) => email),
      creator
    );
  }
}

async function sendMeetiniUserEmails(
  inviteId: string,
  invite: MeetiniInvite,
  users: string[],
  creator: any
) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/email/send-meetini-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteId,
        invite,
        users,
        creator
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send Meetini user emails');
    }
  } catch (error) {
    console.error('Error sending Meetini user emails:', error);
    throw error;
  }
}

async function sendNonMeetiniUserEmails(
  inviteId: string,
  invite: MeetiniInvite,
  nonUsers: string[],
  meetiniUsers: string[],
  creator: any
) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/email/send-non-meetini-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteId,
        invite,
        nonUsers,
        meetiniUsers,
        creator
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send non-Meetini user emails');
    }
  } catch (error) {
    console.error('Error sending non-Meetini user emails:', error);
    throw error;
  }
}
