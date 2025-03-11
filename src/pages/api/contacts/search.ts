import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { extractNames } from '../../../lib/nlp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    console.log('Processing contact search for query:', query);
    const names = extractNames(query);
    
    if (!names.length) {
      console.log('No names found in query:', query);
      return res.status(200).json({ contacts: [] });
    }

    console.log('Extracted names:', names);
    
    // Call the Google contacts search API
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/google/search-contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the auth cookie
        Cookie: req.headers.cookie || '',
      },
      body: JSON.stringify({ names })
    });

    if (!response.ok) {
      throw new Error('Failed to search contacts');
    }

    const contacts = await response.json();
    console.log('Search results:', contacts);
    
    return res.status(200).json({ contacts });
  } catch (error) {
    console.error('Contact search error:', error);
    const message = error instanceof Error ? error.message : 'Failed to search contacts';
    return res.status(500).json({ 
      error: message,
      details: error instanceof Error ? error.stack : undefined
    });
  }
}
