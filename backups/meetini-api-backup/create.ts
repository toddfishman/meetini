import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession, Session } from 'next-auth';
import authOptions from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '../../../lib/calendarService';
import { detectMeetingPurpose } from '@/lib/nlp';
import { EmailService } from '@/lib/emailService';
import { Resend } from 'resend';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';

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
    
    // REQUIRE suggested times from the Assistant
    if (!invite.suggestedTimes?.length) {
      return res.status(400).json({ 
        error: 'No suggested times provided. Please use the AI Assistant to find optimal meeting times.'
      });
    }

    // If no conflicts, create the calendar event
    let event;
    try {
      event = await calendarService.createEvent({
        summary: eventTitle,
        description: invite.description || `Scheduled via Meetini\n\nOriginal prompt: ${invite.type}`,
        attendees: invite.participants.map((p: MeetiniParticipant) => ({ email: p.email })),
        startTime: invite.suggestedTimes[0],
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

    // Check for recent invitations that might not be reflected in Google Calendar yet
    const oneHourAgo = new Date(new Date().getTime() - 60 * 60 * 1000);
    const startDateTime = new Date(invite.suggestedTimes[0]);
    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + 30); // Default 30 minutes
    
    console.log(`Checking for conflicts at time: ${startDateTime.toISOString()} - ${endDateTime.toISOString()}`);
    
    // First check with google calendar to make sure we don't have conflicts 
    // that might not be in our database
    try {
      // Get busy times for the meeting organizer for double checking
      const token = await getToken({ req });
      if (token?.access_token) {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        
        // Handle token data safely - these can sometimes be undefined
        const accessToken = typeof token.access_token === 'string' ? token.access_token : '';
        const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : undefined;
        const expiryDate = typeof token.accessTokenExpires === 'number' ? token.accessTokenExpires : undefined;
        
        auth.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
          expiry_date: expiryDate
        });
        
        const calendar = google.calendar({ version: 'v3', auth });

        const busy = await calendar.freebusy.query({
          requestBody: {
            timeMin: startDateTime.toISOString(),
            timeMax: endDateTime.toISOString(),
            items: [{ id: 'primary' }],
            timeZone: 'UTC'
          }
        });

        if (busy.data.calendars?.primary?.busy && busy.data.calendars.primary.busy.length > 0) {
          console.log(`Found ${busy.data.calendars.primary.busy.length} busy slots in organizer's calendar`);
          
          return res.status(409).json({
            error: 'Calendar conflict detected',
            conflictType: 'calendar_busy',
            message: "You have a calendar conflict during this time slot.",
            suggestion: "Please try a different time or check your calendar for conflicts."
          });
        }
      }
    } catch (error) {
      console.error('Failed to check calendar availability:', error);
      // Continue with the database check even if calendar check fails
    }

    // Then check our database for recent invitations
    const recentInvitations = await prisma.invitation.findMany({
      where: {
        OR: [
          {
            createdBy: {
              in: invite.participants.map(p => p.email)
            }
          },
          {
            participants: {
              some: {
                email: {
                  in: invite.participants.map(p => p.email)
                }
              }
            }
          }
        ],
        createdAt: {
          gte: oneHourAgo
        }
      },
      include: {
        participants: true
      }
    });
    
    console.log(`Found ${recentInvitations.length} recent invitations to check for conflicts`);
    
    // Check each invitation for conflicts
    for (const invitation of recentInvitations) {
      console.log(`Checking invitation ${invitation.id}, proposedTimes: ${invitation.proposedTimes?.length || 0}`);
      
      // Start with proposedTimes
      if (invitation.proposedTimes && invitation.proposedTimes.length > 0) {
        for (const proposedTime of invitation.proposedTimes) {
          const proposedEndTime = new Date(proposedTime);
          proposedEndTime.setMinutes(proposedEndTime.getMinutes() + 30);
          
          // Improved overlap detection
          const hasOverlap = (
            (startDateTime >= proposedTime && startDateTime < proposedEndTime) ||
            (endDateTime > proposedTime && endDateTime <= proposedEndTime) ||
            (startDateTime <= proposedTime && endDateTime >= proposedEndTime)
          );
          
          if (hasOverlap) {
            // Check if the invitation involves the same participants
            const currentParticipantEmails = invite.participants.map(p => p.email);
            const existingParticipantEmails = invitation.participants.map(p => p.email);
            
            // Find common participants
            const commonParticipants = existingParticipantEmails.filter(email => 
              currentParticipantEmails.includes(email)
            );
            
            // Generate a more accurate conflict message
            let conflictMessage = `You already have a pending meetini "${invitation.title}" scheduled during this time window.`;
            if (commonParticipants.length === existingParticipantEmails.length && 
                commonParticipants.length === currentParticipantEmails.length) {
              conflictMessage = `You already have a pending meetini "${invitation.title}" with the same participants scheduled during this time window.`;
            } else if (commonParticipants.length > 0) {
              conflictMessage = `You already have a pending meetini "${invitation.title}" with some of the same participants scheduled during this time window.`;
            }
            
            return res.status(409).json({
              error: 'Scheduling conflict detected',
              conflictType: 'existing_meetini',
              conflictDetails: {
                meetingId: invitation.id,
                title: invitation.title,
                participants: invitation.participants.map(p => ({ email: p.email, name: p.name })),
                timeSlot: proposedTime.toISOString(),
                status: invitation.status,
                commonParticipants: commonParticipants
              },
              message: conflictMessage,
              suggestion: "Would you like to cancel the existing meetini or choose a different time slot?"
            });
          }
        }
      }
      
      // If proposedTimes is empty but calendarEventId exists, use createdAt as fallback
      if ((!invitation.proposedTimes || invitation.proposedTimes.length === 0) && invitation.calendarEventId) {
        const createdTime = invitation.createdAt;
        const createdEndTime = new Date(createdTime);
        createdEndTime.setMinutes(createdEndTime.getMinutes() + 30);
        
        const hasOverlap = (
          (startDateTime >= createdTime && startDateTime < createdEndTime) ||
          (endDateTime > createdTime && endDateTime <= createdEndTime) ||
          (startDateTime <= createdTime && endDateTime >= createdEndTime)
        );
        
        if (hasOverlap) {
          // Same participant checking logic as above
          const currentParticipantEmails = invite.participants.map(p => p.email);
          const existingParticipantEmails = invitation.participants.map(p => p.email);
          
          const commonParticipants = existingParticipantEmails.filter(email => 
            currentParticipantEmails.includes(email)
          );
          
          let conflictMessage = `You already have a pending meetini "${invitation.title}" scheduled during this time window.`;
          if (commonParticipants.length === existingParticipantEmails.length && 
              commonParticipants.length === currentParticipantEmails.length) {
            conflictMessage = `You already have a pending meetini "${invitation.title}" with the same participants scheduled during this time window.`;
          } else if (commonParticipants.length > 0) {
            conflictMessage = `You already have a pending meetini "${invitation.title}" with some of the same participants scheduled during this time window.`;
          }
          
          return res.status(409).json({
            error: 'Scheduling conflict detected',
            conflictType: 'existing_meetini',
            conflictDetails: {
              meetingId: invitation.id,
              title: invitation.title,
              participants: invitation.participants.map(p => ({ email: p.email, name: p.name })),
              timeSlot: createdTime.toISOString(),
              status: invitation.status,
              commonParticipants: commonParticipants
            },
            message: conflictMessage,
            suggestion: "Would you like to cancel the existing meetini or choose a different time slot?"
          });
        }
      }
    }

    // Save invite to database with proper proposedTimes
    const dbInvite = await prisma.invitation.create({
      data: {
        title: eventTitle,
        type: invite.type,
        status: 'pending',
        createdBy: session.user.email,
        calendarEventId: event.id,
        proposedTimes: invite.suggestedTimes ? invite.suggestedTimes.map(time => new Date(time)) : [startDateTime], // Ensure we always have at least one time
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
    
    // Provide more meaningful error messages based on error type
    if (error instanceof Error) {
      // Keep the existing detailed error message
      if (error.message.includes('Scheduling conflict')) {
        // This should not be reached due to our earlier response handling, but just in case
        return res.status(409).json({ 
          error: error.message,
          suggestion: "You may want to cancel the existing invitation or schedule for a different time."
        });
      } else if (error.message.includes('calendar')) {
        return res.status(500).json({ 
          error: "There was an issue accessing your calendar.", 
          details: error.message,
          suggestion: "Please check your calendar permissions and try again."
        });
      } else if (error.message.includes('No suggested times')) {
        return res.status(400).json({ 
          error: "No suitable time slots were found.", 
          details: error.message,
          suggestion: "Try selecting a different time range or fewer participants."
        });
      }
      
      return res.status(500).json({ 
        error: error.message,
        suggestion: "Please try again or contact support if the issue persists."
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to create meeting',
      suggestion: "An unexpected error occurred. Please try again later."
    });
  }
}
