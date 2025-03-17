import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '../../../lib/calendarService';
import { detectMeetingPurpose } from '@/lib/nlp';
import { EmailService } from '@/lib/emailService';

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
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { invite } = req.body as { invite: MeetiniInvite };
    
    if (!invite?.type || !invite.participants || invite.participants.length === 0) {
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
      .join('/');
    
    const eventTitle = `${meetingType} with ${participantNames}`;
    
    // Default to 30 minutes from now if no time specified
    const defaultStartTime = new Date();
    defaultStartTime.setMinutes(defaultStartTime.getMinutes() + 30);
    const startTime = invite.suggestedTimes?.[0] || defaultStartTime.toISOString();
    
    // Create calendar event with Meet link for virtual meetings
    const event = await calendarService.createEvent({
      summary: eventTitle,
      description: invite.description || `Scheduled via Meetini\n\nOriginal prompt: ${invite.type}`,
      attendees: invite.participants.map((p: MeetiniParticipant) => ({ email: p.email })),
      startTime,
      duration: 30, // Default 30-minute duration
      virtual: true, // Always include Meet link for now
    });

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

    const emailService = new EmailService();

    // Send creator confirmation with management link
    try {
      await emailService.sendMeetingCreatedConfirmation(meetingDetails);
    } catch (emailError) {
      console.error('Failed to send creator confirmation:', emailError);
      throw new Error(`Failed to send email notification: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`);
    }

    // Send participant notifications with calendar and Meet links
    const emailErrors = [];
    for (const participant of invite.participants) {
      if (participant.email === session.user.email) continue;

      const isRegistered = registeredEmails.has(participant.email);
      const signupLink = `https://meetini.ai/signup?email=${encodeURIComponent(participant.email)}&invite=${dbInvite.id}`;

      try {
        // Add registration prompt for unregistered users
        if (!isRegistered) {
          const customHtml = `
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
          `;

          // Add the signup prompt to the email
          await emailService.sendMeetingConfirmation({
            ...meetingDetails,
            additionalHtml: customHtml
          });
        } else {
          await emailService.sendMeetingConfirmation(meetingDetails);
        }
      } catch (emailError) {
        console.error(`Failed to send email to ${participant.email}:`, emailError);
        emailErrors.push({ email: participant.email, error: emailError instanceof Error ? emailError.message : 'Unknown error' });
      }
    }

    // If any email failed to send, include that in the response
    if (emailErrors.length > 0) {
      return res.status(207).json({ 
        success: true,
        inviteId: dbInvite.id,
        eventId: event.id,
        eventLink: event.htmlLink || '#',
        meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
        registeredParticipants: registeredEmails.size,
        unregisteredParticipants: invite.participants.length - registeredEmails.size,
        emailErrors
      });
    }

    return res.status(200).json({ 
      success: true, 
      inviteId: dbInvite.id,
      eventId: event.id,
      eventLink: event.htmlLink || '#',
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
      registeredParticipants: registeredEmails.size,
      unregisteredParticipants: invite.participants.length - registeredEmails.size
    });

  } catch (error) {
    console.error('Error creating Meetini:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Check if it's a Resend-specific error
    if (errorMessage.includes('Failed to send email')) {
      return res.status(500).json({ 
        error: errorMessage,
        details: 'There was an issue sending email notifications. The calendar event was created but emails may not have been sent.'
      });
    }
    return res.status(500).json({ 
      error: 'Failed to create Meetini',
      details: errorMessage
    });
  }
}
