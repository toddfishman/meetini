import { google } from 'googleapis';
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, Prisma } from '@/lib/prisma';
import { getToken } from 'next-auth/jwt';
import { getSession } from 'next-auth/react';
import { JWT } from 'next-auth/jwt';
import type { Participant } from '@prisma/client';

interface GoogleToken extends JWT {
  accessToken?: string;
}

type InvitationWithParticipants = Prisma.InvitationGetPayload<{
  include: {
    participants: true;
    preferences: true;
  };
}>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const session = await getSession({ req });
    const token = await getToken({ req }) as GoogleToken;

    if (!session || !token || !token.accessToken) {
      return res.status(401).json({ error: 'Not authenticated or missing access token' });
    }

    const { invitationId } = req.body;

    if (!invitationId) {
      return res.status(400).json({ error: 'Invitation ID is required' });
    }

    // Get invitation details with type inference
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        participants: true,
        preferences: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Initialize Google Calendar API
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );
    auth.setCredentials({ access_token: token.accessToken });
    const calendar = google.calendar({ version: 'v3', auth });

    // Create calendar event
    const event = {
      summary: invitation.title,
      location: invitation.location ?? undefined,
      description: `Meetini invitation from ${session.user.email}`,
      start: {
        dateTime: invitation.proposedTimes[0].toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: new Date(invitation.proposedTimes[0].getTime() + getDurationInMinutes(invitation.preferences?.durationType) * 60000).toISOString(),
        timeZone: 'UTC',
      },
      attendees: invitation.participants
        .filter((p) => p.email !== null)
        .map((participant) => ({
          email: participant.email!,
          responseStatus: 'needsAction',
        })),
      reminders: {
        useDefault: true,
      },
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      sendUpdates: 'all',
    };

    const calendarEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    // Update invitation with calendar event ID
    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        calendarEventId: calendarEvent.data.id,
        status: 'scheduled',
      },
    });

    res.status(200).json({ eventId: calendarEvent.data.id });
  } catch (error) {
    console.error('Failed to create calendar invitation:', error);
    res.status(500).json({ error: 'Failed to create calendar invitation' });
  }
}

function getDurationInMinutes(durationType?: string): number {
  switch (durationType) {
    case '30min':
      return 30;
    case '2hours':
      return 120;
    case '1hour':
    default:
      return 60;
  }
} 
