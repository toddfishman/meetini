import { NextApiRequest, NextApiResponse } from 'next';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { credentials: true },
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const options = await generateAuthenticationOptions({
      rpID: process.env.NEXTAUTH_URL || 'localhost',
      allowCredentials: user.credentials.map(cred => ({
        id: Buffer.from(cred.credentialID, 'base64'),
        type: 'public-key',
        transports: ['internal'],
      })),
      userVerification: 'preferred',
    });

    // Store challenge
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentChallenge: options.challenge,
      },
    });

    return res.json(options);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate authentication options' });
  }
} 