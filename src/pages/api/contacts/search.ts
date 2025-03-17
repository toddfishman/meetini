import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { searchEmailContacts } from '../../../lib/google';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', message: 'Only GET requests are supported' });
  }

  try {
    // Use getToken instead of getSession for API routes
    const token = await getToken({ req });
    if (!token?.accessToken || !token?.email) {
      console.error('Authentication failed: No access token available');
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please sign in to search contacts'
      });
    }

    const query = req.query.q as string;
    if (!query) {
      console.error('Validation failed: Missing query parameter');
      return res.status(400).json({ 
        error: 'Missing query',
        message: 'Search query is required'
      });
    }

    if (query.length < 2) {
      console.error('Validation failed: Query too short:', query);
      return res.status(400).json({ 
        error: 'Query too short',
        message: 'Search query must be at least 2 characters'
      });
    }

    console.log('Processing contact search for query:', query);
    
    const contacts = await searchEmailContacts(query, token.accessToken, token.email);
    
    if (!contacts || contacts.length === 0) {
      console.log('No contacts found for query:', query);
      return res.status(200).json({ 
        contacts: {
          [query]: []
        },
        message: `No contacts found matching "${query}"`
      });
    }

    // Group contacts by confidence level as per our memory
    const highConfidenceContacts = contacts.filter(c => c.confidence >= 0.9);  // Exact match and full name
    const mediumConfidenceContacts = contacts.filter(c => c.confidence >= 0.85 && c.confidence < 0.9); // All parts match
    const lowConfidenceContacts = contacts.filter(c => c.confidence >= 0.7 && c.confidence < 0.85); // Partial matches
    
    console.log('Contact search stats:', {
      query,
      total: contacts.length,
      high: highConfidenceContacts.length,
      medium: mediumConfidenceContacts.length,
      low: lowConfidenceContacts.length
    });

    // Format message according to confidence levels
    let message = `Found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`;
    if (highConfidenceContacts.length > 0) {
      message += ` (${highConfidenceContacts.length} exact match${highConfidenceContacts.length === 1 ? '' : 'es'})`;
    }
    
    return res.status(200).json({ 
      contacts: {
        [query]: contacts.sort((a, b) => b.confidence - a.confidence) // Sort by confidence
      },
      message,
      stats: {
        total: contacts.length,
        highConfidence: highConfidenceContacts.length,
        mediumConfidence: mediumConfidenceContacts.length,
        lowConfidence: lowConfidenceContacts.length
      }
    });
  } catch (error) {
    console.error('Contact search error:', error);
    const message = error instanceof Error ? error.message : 'Failed to search contacts';
    return res.status(500).json({ 
      error: 'Search failed',
      message,
      details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : undefined : undefined
    });
  }
}
