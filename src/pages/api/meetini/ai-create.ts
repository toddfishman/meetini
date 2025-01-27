import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { parseMeetingRequest } from '@/lib/openai';
import { findOptimalTimes } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';

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

// This would be replaced with actual NLP processing
function parseRequest(prompt: string): ParsedMeetingRequest {
  // Mock implementation - in reality, this would use NLP to parse the request
  const mockParsed: ParsedMeetingRequest = {
    title: "Team Coffee Meeting",
    participants: ["team@company.com"],
    preferences: {
      timePreference: "morning",
      durationType: "1hour",
      locationType: "coffee"
    }
  };

  return mockParsed;
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

    // Step 1: Parse the natural language request using AI
    const parsedRequest = await parseMeetingRequest(prompt);

    // Step 2: Find optimal meeting times using calendar availability
    const proposedTimes = await findOptimalTimes(
      req,
      parsedRequest.participants,
      parsedRequest.preferences
    );

    // Step 3: Create the invitation in the database
    const invitation = await prisma.invitation.create({
      data: {
        title: parsedRequest.title,
        status: 'pending',
        type: 'sent',
        participants: parsedRequest.participants,
        proposedTimes: proposedTimes.map(slot => slot.start),
        location: parsedRequest.location,
        createdBy: session.user.email,
        preferences: {
          create: {
            timePreference: parsedRequest.preferences.timePreference,
            durationType: parsedRequest.preferences.durationType,
            locationType: parsedRequest.preferences.locationType,
          },
        },
      },
      include: {
        preferences: true,
      },
    });

    // Step 4: Create received invitations for each participant
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
                  timePreference: parsedRequest.preferences.timePreference,
                  durationType: parsedRequest.preferences.durationType,
                  locationType: parsedRequest.preferences.locationType,
                },
              },
            },
          });
        }
      })
    );

    return res.status(200).json(invitation);
  } catch (error) {
    console.error('Failed to process AI request:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      code: 'AI_PROCESSING_ERROR'
    });
  }
} 