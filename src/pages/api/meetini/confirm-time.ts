import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/calendarService';
import { getServerSession, Session } from 'next-auth';
import authOptions from '../auth/[...nextauth]';
import { EmailService } from '@/lib/emailService';

// At the beginning of the file, add this type
type CustomSession = {
  user: {
    email: string;
    name?: string | null;
  };
  accessToken: string;
  refreshToken?: string;
  expires?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // GET request is for unregistered users responding via email link
    if (req.method === 'GET') {
      const { email, invite: inviteId, response } = req.query;

      if (!email || !inviteId || !response) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Redirect to a web page that shows confirmation status
      return res.redirect(
        `/confirm-time?email=${encodeURIComponent(email as string)}&invite=${inviteId}&response=${response}`
      );
    }

    // POST is for handling the actual confirmation
    const { email, inviteId, response, suggestedTime, alternativeTimes } = req.body;

    if (!email || !inviteId || !response) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Find the invitation
    const invitation = await prisma.invitation.findUnique({
      where: { id: inviteId as string },
      include: {
        participants: true
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Find the participant
    const participant = invitation.participants.find(p => p.email === email);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found in this invitation' });
    }

    // Update participant status based on response
    if (response === 'yes') {
      await prisma.participant.update({
        where: { id: participant.id },
        data: { status: 'confirmed' }
      });

      // Check if all participants have confirmed
      const allConfirmed = await areAllParticipantsConfirmed(inviteId as string);
      
      if (allConfirmed && invitation.status === 'pending_confirmation' && !invitation.calendarEventId) {
        // All participants have confirmed and no calendar event exists yet
        // Create the calendar event now
        await createCalendarEvent(invitation);
      }

      return res.status(200).json({ 
        success: true,
        message: 'Time confirmed successfully',
        allConfirmed
      });
    } 
    else if (response === 'no') {
      // Participant declined the suggested time
      await prisma.participant.update({
        where: { id: participant.id },
        data: { status: 'declined' }
      });

      // Record their suggested alternative times if provided
      if (alternativeTimes && Array.isArray(alternativeTimes) && alternativeTimes.length > 0) {
        // Store the response with alternative times
        await prisma.response.create({
          data: {
            invitationId: invitation.id,
            participantEmail: email as string,
            availableTimes: alternativeTimes.map((time: string) => new Date(time))
          }
        });
      }

      // Notify the creator about the declined invitation
      const emailService = new EmailService();
      
      try {
        await emailService.sendDeclinedNotification({
          title: invitation.title,
          inviteId: invitation.id,
          participantEmail: email as string,
          creatorEmail: invitation.createdBy,
          suggestedAlternatives: alternativeTimes?.length > 0,
          message: suggestedTime ? `Suggested alternative time: ${new Date(suggestedTime).toLocaleString()}` : 'No alternative time was suggested'
        });
      } catch (emailError) {
        console.error('Failed to send decline notification:', emailError);
      }

      return res.status(200).json({
        success: true,
        message: 'Response recorded successfully. The meeting organizer will be notified.'
      });
    }

    return res.status(400).json({ error: 'Invalid response' });
  } catch (error) {
    console.error('Error processing time confirmation:', error);
    return res.status(500).json({ 
      error: 'Failed to process time confirmation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function areAllParticipantsConfirmed(inviteId: string): Promise<boolean> {
  const participants = await prisma.participant.findMany({
    where: { invitationId: inviteId }
  });

  return participants.every(p => p.status === 'confirmed');
}

async function createCalendarEvent(invitation: any) {
  try {
    // Instead of using getServerSession directly, we'll use the creator's credentials
    // First, get the creator's info
    const creator = await prisma.user.findUnique({
      where: { email: invitation.createdBy },
      include: { 
        calendarAccounts: true 
      }
    });
    
    if (!creator || !creator.calendarAccounts?.length) {
      throw new Error('No calendar account found for the meeting creator');
    }

    // Create a custom session with the necessary data
    const session: CustomSession = {
      user: {
        email: creator.email,
        name: creator.name
      },
      // Use the first calendar account's access token
      accessToken: creator.calendarAccounts[0].accessToken,
      refreshToken: creator.calendarAccounts[0].refreshToken || undefined,
      expires: creator.calendarAccounts[0].expiresAt?.toISOString()
    };

    const calendarService = new CalendarService(session as any);
    
    // Create calendar event
    const event = await calendarService.createEvent({
      summary: invitation.title,
      description: `Scheduled via Meetini\n\nThis meeting was created after all participants confirmed availability.`,
      attendees: invitation.participants.map((p: any) => ({ email: p.email })),
      startTime: invitation.proposedTimes[0].toISOString(),
      duration: 30,
      virtual: true
    });

    // Update invitation with calendar event ID
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        calendarEventId: event.id,
        status: 'confirmed'
      }
    });

    // Notify all participants about the confirmed meeting
    const emailService = new EmailService();
    
    // Notify participants about the confirmation
    for (const participant of invitation.participants) {
      try {
        await emailService.sendMeetingConfirmation({
          title: invitation.title,
          type: 'Meeting',
          dateTime: new Date(invitation.proposedTimes[0]),
          duration: '30 minutes',
          location: 'Virtual',
          description: '',
          meetLink: event.conferenceData?.entryPoints?.[0]?.uri || undefined,
          calendarLink: event.htmlLink || '#',
          originalPrompt: '',
          creator: {
            name: '',
            email: invitation.createdBy
          },
          participants: invitation.participants.map((p: any) => p.email),
          to: participant.email
        });
      } catch (emailError) {
        console.error(`Failed to send confirmation to ${participant.email}:`, emailError);
      }
    }

    return event;
  } catch (error) {
    console.error('Failed to create calendar event after confirmation:', error);
    throw error;
  }
} 