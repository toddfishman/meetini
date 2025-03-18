import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession, Session } from 'next-auth';
import authOptions from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '../../../lib/calendarService';
import { detectMeetingPurpose } from '@/lib/nlp';
import { EmailService } from '@/lib/emailService';
import { Resend } from 'resend';

interface MeetiniParticipant {
  email: string;
  name?: string;
  phoneNumber?: string;
  notifyByEmail?: boolean;
  notifyBySms?: boolean;
}

interface MeetiniInvite {
  title?: string;
  description?: string;
  location?: string;
  type: string;
  participants: MeetiniParticipant[];
  suggestedTimes?: string[];
  createdBy: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions) as Session;
    console.log('Create Meetini Session:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.accessToken,
      user: session?.user,
      token: session?.accessToken?.slice(0, 10) + '...',
    });

    // Check for authorization header as backup
    const authHeader = req.headers.authorization;
    if (!session?.accessToken && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('Using token from Authorization header');
      session.accessToken = token;
    }

    if (!session?.accessToken) {
      console.error('No access token available in session or header');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!session?.user) {
      console.error('No user found in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('Session found:', {
      user: session.user,
      hasAccessToken: !!session.accessToken,
      hasRefreshToken: !!session.refreshToken
    });

    const { invite } = req.body as { invite: MeetiniInvite };
    
    if (!invite?.type || !invite.participants || invite.participants.length === 0) {
      console.error('Invalid invite data:', invite);
      return res.status(400).json({ error: 'Invalid invite data' });
    }

    console.log('Creating invite with data:', invite);

    // Create calendar event
    const calendarService = new CalendarService(session);

    // Format title based on meeting type and participants
    const meetingPurpose = detectMeetingPurpose(invite.type);
    const meetingType = meetingPurpose?.type || 'Meeting';
    const participantNames = invite.participants
      .map((p: MeetiniParticipant) => p.name || p.email.split('@')[0])
      .join(' / ');
    
    const eventTitle = `${meetingType} with ${participantNames}`;
    
    // Default to 30 minutes from now if no time specified
    const defaultStartTime = new Date();
    defaultStartTime.setMinutes(defaultStartTime.getMinutes() + 30);
    const startTime = invite.suggestedTimes?.[0] || defaultStartTime.toISOString();
    
    // Create calendar event with Meet link for virtual meetings
    let event;
    try {
      event = await calendarService.createEvent({
        summary: eventTitle,
        description: invite.description || `Scheduled via Meetini\n\nOriginal prompt: ${invite.type}`,
        attendees: invite.participants.map((p: MeetiniParticipant) => ({ email: p.email })),
        startTime,
        duration: 30,
        virtual: true
      });

      if (!event.id || !event.start?.dateTime) {
        throw new Error('Failed to create calendar event with valid start time');
      }
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw error;
    }

    if (!event.id || !event.start?.dateTime) {
      throw new Error('Failed to create calendar event with valid start time');
    }

    // Save invite to database
    const dbInvite = await prisma.invitation.create({
      data: {
        title: eventTitle,
        type: invite.type,
        status: 'pending',
        createdBy: session.user.email,
        calendarEventId: event.id,
        proposedTimes: invite.suggestedTimes ? invite.suggestedTimes.map(time => new Date(time)) : [],
        participants: {
          create: invite.participants.map((p: MeetiniParticipant) => ({
            email: p.email,
            name: p.name,
            status: 'pending',
            notifyByEmail: p.notifyByEmail ?? true,
            notifyBySms: p.notifyBySms ?? false,
            phoneNumber: p.phoneNumber
          }))
        }
      },
      include: {
        participants: true
      }
    });

    // Check which participants are registered Meetini users
    const registeredUsers = await prisma.user.findMany({
      where: {
        email: {
          in: invite.participants.map(p => p.email)
        }
      },
      select: { email: true }
    });

    const registeredEmails = new Set(registeredUsers.map(u => u.email));

    // Prepare meeting details for email
    const meetingDetails = {
      title: eventTitle,
      type: meetingType,
      dateTime: new Date(event.start.dateTime),
      duration: '30 minutes',
      location: invite.location || 'Virtual',
      description: invite.description,
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
      calendarLink: event.htmlLink || '#',
      originalPrompt: invite.type,
      creator: {
        name: session.user.name || session.user.email.split('@')[0],
        email: session.user.email
      },
      participants: invite.participants.map(p => p.email)
    };

    // Send participant notifications with calendar and Meet links
    const emailErrors = [];
    const emailService = new EmailService(); // Create once for all emails

    // First send creator confirmation
    try {
      await emailService.sendMeetingCreatedConfirmation({
        title: eventTitle,
        type: meetingType,
        dateTime: new Date(event.start.dateTime),
        duration: '30 minutes',
        location: invite.location || 'Virtual',
        description: invite.description,
        meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
        calendarLink: event.htmlLink || '#',
        originalPrompt: invite.type,
        creator: {
          name: session.user.name || session.user.email.split('@')[0],
          email: session.user.email
        },
        participants: invite.participants.map(p => p.email)
      });
    } catch (emailError) {
      console.error('Failed to send creator confirmation:', emailError);
      emailErrors.push({ email: session.user.email, error: emailError instanceof Error ? emailError.message : 'Unknown error' });
    }

    // Then send participant notifications
    for (const participant of invite.participants) {
      if (participant.email === session.user.email) continue;

      const isRegistered = registeredEmails.has(participant.email);
      const signupLink = `https://meetini.ai/signup?email=${encodeURIComponent(participant.email)}&invite=${dbInvite.id}`;

      try {
        const customHtml = !isRegistered ? `
          <div style="margin-top: 20px; padding: 20px; background: #f0f9ff; border-radius: 8px;">
            <h3 style="color: #0369a1; margin: 0 0 10px 0;">New to Meetini?</h3>
            <p style="margin: 0 0 15px 0;">
              Get more out of your meetings by joining Meetini:
              • Create AI-powered meetings
              • Manage your availability
              • Sync with your calendar
              • Get smart meeting suggestions
            </p>
            <a href="${signupLink}" 
               style="background: #0ea5e9; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Sign up for Meetini
            </a>
          </div>
        ` : undefined;

        await emailService.sendMeetingConfirmation({
          title: eventTitle,
          type: meetingType,
          dateTime: new Date(event.start.dateTime),
          duration: '30 minutes',
          location: invite.location || 'Virtual',
          description: invite.description,
          meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
          calendarLink: event.htmlLink || '#',
          originalPrompt: invite.type,
          creator: {
            name: session.user.name || session.user.email.split('@')[0],
            email: session.user.email
          },
          participants: invite.participants.map(p => p.email),
          additionalHtml: customHtml,
          to: participant.email
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${participant.email}:`, emailError);
        emailErrors.push({ email: participant.email, error: emailError instanceof Error ? emailError.message : 'Unknown error' });
      }
    }

    // Return success with registration stats
    return res.status(200).json({
      success: true,
      inviteId: dbInvite.id,
      registeredParticipants: registeredEmails.size,
      unregisteredParticipants: invite.participants.length - registeredEmails.size,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined
    });

  } catch (error) {
    console.error('Failed to create meeting:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to create meeting'
    });
  }
}
