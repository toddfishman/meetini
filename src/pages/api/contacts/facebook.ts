import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import authOptions from '../auth/[...nextauth]';
import type { Session } from 'next-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions) as Session;

    if (!session?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // TODO: Implement Facebook API integration
    // 1. Get user's Facebook friends
    // 2. Filter and format contacts
    // 3. Return formatted contacts

    // Temporary mock response
    return res.status(200).json({
      contacts: [],
      message: 'Facebook integration coming soon!'
    });
  } catch (error) {
    console.error('Facebook API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch Facebook contacts' });
  }
}
