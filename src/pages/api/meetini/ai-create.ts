import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { parseMeetingRequest } from '@/lib/openai';
import { findOptimalTimes } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { Credentials } from 'google-auth-library';
import { Prisma } from '@prisma/client';

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const calendar = google.calendar('v3');

interface MeetingRequest {
  prompt: string;
  participants: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, participants } = req.body as MeetingRequest;

    if (!prompt || !participants?.length) {
      return res.status(400).json({ error: 'Prompt and participants are required' });
    }

    // Step 1: Parse the natural language request using AI
    let parsedRequest;
    try {
      parsedRequest = await parseMeetingRequest(req, prompt);
      console.log('Parsed request:', parsedRequest);
    } catch (error) {
      console.error('Failed to parse meeting request:', error);
      return res.status(400).json({ 
        error: 'Could not understand meeting request. Please try rephrasing.',
        details: error instanceof Error ? error.message : undefined
      });
    }

    // Step 2: Find optimal meeting times using calendar availability
    let proposedTimes;
    try {
      proposedTimes = await findOptimalTimes(
        req,
        participants,
        parsedRequest.preferences
      );

      if (!proposedTimes || proposedTimes.length === 0) {
        return res.status(400).json({ 
          error: 'Could not find any suitable meeting times. Please try different preferences or participants.',
          code: 'NO_AVAILABILITY'
        });
      }
    } catch (error) {
      console.error('Failed to find optimal times:', error);
      return res.status(400).json({ 
        error: 'Failed to check calendar availability. Please try again.',
        details: error instanceof Error ? error.message : undefined
      });
    }

    // Step 3: Create Google Calendar event
    const token = await getToken({ req });
    if (!token?.credentials) {
      return res.status(401).json({ 
        error: 'No calendar access. Please reconnect your Google Calendar.',
        code: 'NO_CALENDAR_ACCESS'
      });
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials(token.credentials as Credentials);

    // Format event details
    const meetingType = parsedRequest.title.split(' with ')[0];
    const eventTitle = `${meetingType} with ${participants.map((p: string) => p.split('@')[0]).join('/')}`;
    
    // Create event with first available time
    const eventStartTime = new Date(proposedTimes[0].start);
    const eventEndTime = new Date(proposedTimes[0].end);

    const event = {
      summary: eventTitle,
      description: `Original request: ${prompt}\n\nCreated by Meetini`,
      start: {
        dateTime: eventStartTime.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: eventEndTime.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      attendees: participants.map((email: string) => ({ email })),
      conferenceData: parsedRequest.preferences.locationType === 'virtual' ? {
        createRequest: {
          requestId: `meetini-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      } : undefined,
      guestsCanModify: true,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true,
      reminders: {
        useDefault: true
      }
    };

    let calendarEvent;
    try {
      calendarEvent = await calendar.events.insert({
        auth,
        calendarId: 'primary',
        requestBody: event,
        conferenceDataVersion: parsedRequest.preferences.locationType === 'virtual' ? 1 : 0,
        sendUpdates: 'all'  // Send Google Calendar's native notifications
      });
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return res.status(500).json({ 
        error: 'Failed to create calendar event. Please try again.',
        details: error instanceof Error ? error.message : undefined
      });
    }

    // Step 4: Create the invitation in the database
    let newInvite;
    try {
      // Find or create the recipient users first
      await Promise.all(participants.map(async (email) => {
        return prisma.user.upsert({
          where: { email },
          create: { 
            email,
            notifyByEmail: true,
            notifyBySms: false
          },
          update: {}
        });
      }));

      const inviteData: Prisma.InvitationCreateInput = {
        title: eventTitle,
        type: parsedRequest.preferences.locationType || 'virtual',
        status: 'confirmed',
        creator: {
          connect: {
            email: session.user.email
          }
        },
        location: parsedRequest.location || '',
        calendarEventId: calendarEvent.data.id || '',
        proposedTimes: [eventStartTime],
        participants: {
          create: participants.map((email: string) => ({
            email: email.toLowerCase(),
            status: 'pending',
            notifyByEmail: true,
            notifyBySms: false
          }))
        },
        preferences: {
          create: {
            timePreference: parsedRequest.preferences.timePreference || null,
            durationType: parsedRequest.preferences.durationType || null,
            locationType: parsedRequest.preferences.locationType || null
          }
        }
      };

      newInvite = await prisma.invitation.create({
        data: inviteData,
        include: {
          participants: true,
          preferences: true
        }
      });
    } catch (error) {
      console.error('Failed to save invitation:', error);
      // Try to clean up the calendar event
      try {
        await calendar.events.delete({
          auth,
          calendarId: 'primary',
          eventId: calendarEvent.data.id!,
          sendUpdates: 'all'
        });
      } catch (cleanupError) {
        console.error('Failed to clean up calendar event:', cleanupError);
      }
      return res.status(500).json({ 
        error: 'Failed to save invitation. Please try again.',
        details: error instanceof Error ? error.message : undefined
      });
    }

    // Step 5: Send branded confirmation email via Resend
    try {
      const emailPromises = participants.map(async (email: string) => {
        const emailContent = generateInviteEmail({
          title: eventTitle,
          type: meetingType,
          location: parsedRequest.location || '',
          dateTime: eventStartTime,
          meetLink: calendarEvent.data.hangoutLink || '',
          calendarLink: calendarEvent.data.htmlLink || '',
          participants,
          creator: {
            name: session.user.name || '',
            email: session.user.email
          }
        });

        return resend.emails.send({
          from: 'Meetini <meetings@meetini.app>',
          to: email,
          subject: `${session.user.name || 'Someone'} invited you to ${eventTitle}`,
          html: emailContent
        });
      });

      await Promise.all(emailPromises);
      console.log('All confirmation emails sent successfully');
    } catch (emailError) {
      console.error('Failed to send confirmation emails:', emailError);
      // Don't fail the request, just warn about email issues
      return res.status(200).json({ 
        ...newInvite,
        warning: 'Meeting created but some confirmation emails may not have been sent'
      });
    }

    return res.status(200).json(newInvite);
  } catch (error) {
    console.error('Failed to process meeting request:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

interface InviteEmailParams {
  title: string;
  type: string;
  location: string;
  dateTime: Date;
  meetLink: string;
  calendarLink: string;
  participants: string[];
  creator: {
    name: string;
    email: string;
  };
}

function generateInviteEmail(params: InviteEmailParams): string {
  const {
    title,
    type,
    location,
    dateTime,
    meetLink,
    calendarLink,
    participants,
    creator
  } = params;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F2937;">
      <h2 style="color: #059669;">${creator.name || creator.email} invited you to ${title}</h2>

      <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1F2937;">${title}</h3>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>When:</strong> ${dateTime.toLocaleString()}</p>
        ${location ? `<p><strong>Location:</strong> ${location}</p>` : ''}
        ${meetLink ? `<p><strong>Google Meet:</strong> <a href="${meetLink}" style="color: #059669;">Join meeting</a></p>` : ''}
        
        <p><strong>Participants:</strong></p>
        <ul style="list-style: none; padding-left: 0;">
          ${participants.map(p => `<li style="margin: 4px 0;">${p}</li>`).join('')}
        </ul>
      </div>

      <div style="margin: 20px 0; text-align: center;">
        <a href="${calendarLink}" 
           style="background-color: #059669; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Add to Calendar
        </a>
      </div>

      <p style="color: #6B7280; font-size: 14px; text-align: center;">
        Powered by Meetini
      </p>
    </div>
  `;
}