import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { parseMeetingRequest } from '@/lib/openai';
import { findOptimalTimes } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import { sendNotifications } from '@/lib/notifications';

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

    // Log the incoming request body
    console.log('Request body:', req.body);

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
      const invitation = await prisma.invitation.create({
        data: {
          title: parsedRequest.title,
          status: 'pending',
          type: 'sent',
          participants: {
            create: parsedRequest.participants.map(email => ({
              email,
              notifyByEmail: true,
              notifyBySms: false
            }))
          },
          proposedTimes: proposedTimes.map(slot => slot.start),
          location: parsedRequest.location,
          createdBy: session.user.email,
          preferences: {
            create: {
              timePreference: parsedRequest.preferences.timePreference || 'morning',
              durationType: parsedRequest.preferences.durationType || '1hour',
              locationType: parsedRequest.preferences.locationType || 'coffee',
            },
          },
        },
        include: {
          participants: true,
          preferences: true,
        },
      });

      // Log the invitation details before sending notifications
      console.log('Invitation details:', invitation);

      // Step 4: Send notifications to all participants
      await sendNotifications(
        invitation.participants.map((p: { 
          email: string | null; 
          phoneNumber: string | null; 
          name: string | null; 
          notifyByEmail: boolean; 
          notifyBySms: boolean; 
        }) => ({
          email: p.email || undefined,
          phoneNumber: p.phoneNumber || undefined,
          name: p.name || undefined,
          notifyByEmail: p.notifyByEmail,
          notifyBySms: p.notifyBySms
        })),
        {
          type: 'invitation',
          title: invitation.title,
          creatorName: session.user.name || session.user.email,
          creatorEmail: session.user.email,
          proposedTimes: invitation.proposedTimes.map((time: Date) => time.toISOString()),
          location: invitation.location || undefined,
          invitationId: invitation.id,
          actionUrl: `${process.env.NEXTAUTH_URL}/invitations/${invitation.id}`
        }
      );

      // Log participant notifications
      console.log('Sending notifications to:', invitation.participants.map((p: { email: string | null }) => p.email));

      // Step 5: Create received invitations for each participant
      await Promise.all(
        parsedRequest.participants.map(async (participant) => {
          if (participant !== session.user.email) {
            await prisma.invitation.create({
              data: {
                title: parsedRequest.title,
                status: 'pending',
                type: 'received',
                participants: parsedRequest.participants,
                proposedTimes: proposedTimes.map(slot => slot.start),
                location: parsedRequest.location,
                createdBy: session.user.email,
                preferences: {
                  create: {
                    timePreference: parsedRequest.preferences.timePreference || 'morning',
                    durationType: parsedRequest.preferences.durationType || '1hour',
                    locationType: parsedRequest.preferences.locationType || 'coffee',
                  },
                },
              },
            });
          }
        })
      );

      return res.status(200).json(invitation);
    } catch (parseError) {
      console.error('Error parsing meeting request:', parseError);
      return res.status(400).json({ 
        error: 'Could not understand the meeting request. Please try rephrasing it.',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Failed to process AI request:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}