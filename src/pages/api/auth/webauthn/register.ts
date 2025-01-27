import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get or create user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { credentials: true },
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: 'Meetini',
      rpID: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : 'localhost',
      userID: user.id,
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
      },
    });

    // Store challenge in database
    await prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: options.challenge },
    });

    return res.json(options);
  } catch (error) {
    console.error('Failed to generate registration options:', error);
    return res.status(500).json({ error: 'Failed to generate registration options' });
  }
}

export default handler; 