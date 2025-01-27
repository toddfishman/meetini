import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]';
import { verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/typescript-types';
import { prisma } from '@/lib/prisma';

interface ExtendedNextApiRequest extends NextApiRequest {
  body: AuthenticationResponseJSON | RegistrationResponseJSON;
}

async function handler(req: ExtendedNextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { credentials: true },
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const expectedChallenge = user.currentChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No challenge found' });
    }

    const expectedOrigin = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const expectedRPID = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : 'localhost';

    let verification;
    if ('response' in req.body && 'authenticatorAttachment' in req.body) {
      // Registration verification
      verification = await verifyRegistrationResponse({
        response: req.body as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin,
        expectedRPID,
      });

      if (verification.verified) {
        const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
        await prisma.credential.create({
          data: {
            userId: user.id,
            credentialID: Buffer.from(credentialID).toString('base64'),
            publicKey: Buffer.from(credentialPublicKey).toString('base64'),
            counter,
          },
        });
      }
    } else {
      // Authentication verification
      const credential = user.credentials[0];
      if (!credential) {
        return res.status(400).json({ error: 'No credentials found' });
      }

      verification = await verifyAuthenticationResponse({
        response: req.body as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin,
        expectedRPID,
        authenticator: {
          credentialID: Buffer.from(credential.credentialID, 'base64'),
          credentialPublicKey: Buffer.from(credential.publicKey, 'base64'),
          counter: credential.counter,
        },
      });

      if (verification.verified) {
        await prisma.credential.update({
          where: { id: credential.id },
          data: { counter: verification.authenticationInfo.newCounter },
        });
      }
    }

    // Clear challenge after verification
    await prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: null },
    });

    return res.json({ verified: verification.verified });
  } catch (error) {
    console.error('Verification failed:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}

export default handler; 