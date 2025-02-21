import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { searchEmailContacts } from '@/lib/google';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { names } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Names array is required' });
    }

    const contacts = await searchEmailContacts(req, names);
    return res.status(200).json(contacts);
  } catch (error) {
    console.error('Failed to search contacts:', error);
    return res.status(500).json({ 
      error: 'Failed to search contacts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
