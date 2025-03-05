import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { searchEmailContacts } from '@/lib/google';
import { extractNames } from '@/lib/nlp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    // Extract potential names from the input text
    const names = extractNames(text);
    if (names.length === 0) {
      return res.status(200).json({ contacts: [] });
    }

    // Search email history for these names
    const contacts = await searchEmailContacts(req, names);
    
    // Return only high-confidence matches
    const suggestions = contacts
      .filter(contact => contact.confidence > 0.4) // Only return reasonably confident matches
      .slice(0, 5); // Limit to top 5 suggestions

    return res.status(200).json({ contacts: suggestions });
  } catch (error) {
    console.error('Failed to suggest contacts:', error);
    return res.status(500).json({ 
      error: 'Failed to suggest contacts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
