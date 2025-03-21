import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import authOptions from '../auth/[...nextauth]';
import type { Session } from 'next-auth';

interface Contact {
  name: string;
  email: string;
  source: 'email' | 'linkedin' | 'facebook' | 'phone';
  confidence: number;
}

async function searchGmailContacts(query: string, session: Session): Promise<Contact[]> {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/contacts/search?query=${query}`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to search Gmail contacts');
    }

    const data = await response.json();
    return data.contacts.map((contact: any) => ({
      ...contact,
      source: 'email' as const,
      confidence: 0.9 // High confidence for Gmail contacts
    }));
  } catch (error) {
    console.error('Gmail search error:', error);
    return [];
  }
}

async function searchLinkedInContacts(query: string): Promise<Contact[]> {
  // For now, return empty array since we don't have LinkedIn integration yet
  // This will be implemented when we add LinkedIn OAuth
  return [];
}

async function searchFacebookContacts(query: string): Promise<Contact[]> {
  // For now, return empty array since we don't have Facebook integration yet
  // This will be implemented when we add Facebook OAuth
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions) as Session;
    const query = req.query.query as string;

    if (!session?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Search all sources in parallel
    const [gmailContacts, linkedinContacts, facebookContacts] = await Promise.all([
      searchGmailContacts(query, session),
      searchLinkedInContacts(query),
      searchFacebookContacts(query)
    ]);

    // Combine all results
    const allContacts = [...gmailContacts, ...linkedinContacts, ...facebookContacts];

    // Remove duplicates based on email
    const uniqueContacts = allContacts.reduce((acc: Contact[], current) => {
      const exists = acc.some(contact => contact.email === current.email);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    // Sort by confidence
    const sortedContacts = uniqueContacts.sort((a, b) => b.confidence - a.confidence);

    return res.status(200).json({
      contacts: sortedContacts,
      sources: {
        gmail: gmailContacts.length > 0,
        linkedin: linkedinContacts.length > 0,
        facebook: facebookContacts.length > 0
      }
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return res.status(500).json({ error: 'Failed to search contacts' });
  }
}
