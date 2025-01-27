import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getIronSession, IronSession } from 'iron-session';

interface WebAuthnSessionData {
  authenticationChallenge?: string;
}

interface WebAuthnSession extends IronSession<WebAuthnSessionData> {}

const sessionOptions = {
  password: process.env.NEXTAUTH_SECRET!,
  cookieName: 'webauthn-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const options = await generateAuthenticationOptions({
      rpID: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : 'localhost',
      allowCredentials: [], // We'll need to store and retrieve user's credentials
      userVerification: 'preferred',
    });

    // Create iron session
    const ironSession = await getIronSession<WebAuthnSession>(req, res, sessionOptions);
    
    // Store challenge in session
    ironSession.authenticationChallenge = options.challenge;
    await ironSession.save();

    return res.json(options);
  } catch (error) {
    console.error('Failed to generate authentication options:', error);
    return res.status(500).json({ error: 'Failed to generate authentication options' });
  }
}

export default handler; 