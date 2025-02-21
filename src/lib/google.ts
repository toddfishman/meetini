import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';

const gmail = google.gmail('v1');

interface EmailContact {
  name: string;
  email: string;
  frequency: number;
  lastContact?: Date;
  confidence: number;
}

// Cache email search results for 5 minutes
const searchCache = new Map<string, { 
  timestamp: number;
  results: EmailContact[];
}>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function buildEmailQuery(names: string[]): string {
  const queryParts = names.map(name => {
    const parts = name.split(' ');
    const queries = [];

    // Add exact name match
    queries.push(`"${name}"`);

    if (parts.length > 1) {
      // For full names, search individual parts
      parts.forEach(part => {
        if (part.length > 2) { // Only search parts longer than 2 characters
          queries.push(`"${part}"`);
        }
      });
    }

    // Create combined query for this name
    return `{${queries.map(q => `from:${q} OR to:${q}`).join(' OR ')}}`;
  });

  return queryParts.join(' OR ');
}

async function getEmailDetails(auth: any, messageId: string): Promise<EmailContact | null> {
  try {
    const details = await gmail.users.messages.get({
      auth,
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Date', 'Subject']
    });

    const headers = details.data.payload?.headers;
    if (!headers) return null;

    const fromHeader = headers.find(h => h.name === 'From');
    const toHeader = headers.find(h => h.name === 'To');
    const dateHeader = headers.find(h => h.name === 'Date');

    // Parse email addresses and names
    const parseEmailHeader = (header: { value: string } | undefined) => {
      if (!header?.value) return null;
      
      // Handle multiple email addresses in the header
      const addresses = header.value.split(',').map(addr => {
        const matches = addr.trim().match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
        return matches ? {
          name: matches[1]?.trim() || matches[2].split('@')[0],
          email: matches[2].trim()
        } : null;
      }).filter(Boolean);

      return addresses[0]; // Return the first valid address
    };

    const from = parseEmailHeader(fromHeader);
    const to = parseEmailHeader(toHeader);

    if (!from && !to) return null;

    // Skip your own email address
    const ownEmail = (await getToken({ req: {} as any }))?.email;
    const contact = from?.email === ownEmail ? to : from;
    
    if (!contact || contact.email === ownEmail) return null;

    return {
      name: contact.name,
      email: contact.email,
      frequency: 1,
      lastContact: dateHeader?.value ? new Date(dateHeader.value) : undefined,
      confidence: 0 // Will be calculated later
    };
  } catch (error) {
    console.error('Error getting email details:', error);
    return null;
  }
}

export async function searchEmailContacts(req: NextApiRequest, names: string[]): Promise<EmailContact[]> {
  try {
    // Check cache first
    const cacheKey = names.sort().join(',');
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
    }

    const token = await getToken({ req });
    if (!token) throw new Error('No token found');

    const auth = new google.auth.OAuth2();
    auth.setCredentials(token.credentials as any);

    const query = buildEmailQuery(names);
    console.log('Searching with query:', query);

    const response = await gmail.users.messages.list({
      auth,
      userId: 'me',
      q: query,
      maxResults: 100 // Increased to get more context
    });

    if (!response.data.messages) return [];

    // Get details for all messages in parallel
    const contactsMap = new Map<string, EmailContact>();
    const contactPromises = response.data.messages.map(message => 
      getEmailDetails(auth, message.id!)
    );

    const contacts = (await Promise.all(contactPromises)).filter((c): c is EmailContact => c !== null);

    // Aggregate contacts and calculate frequencies
    contacts.forEach(contact => {
      const existing = contactsMap.get(contact.email);
      if (existing) {
        existing.frequency += 1;
        if (contact.lastContact && (!existing.lastContact || contact.lastContact > existing.lastContact)) {
          existing.lastContact = contact.lastContact;
        }
      } else {
        contactsMap.set(contact.email, contact);
      }
    });

    // Calculate confidence scores
    const results = Array.from(contactsMap.values()).map(contact => {
      // Base confidence on frequency and recency
      const frequencyScore = Math.min(contact.frequency / 20, 1); // Max out at 20 emails
      
      const recencyScore = contact.lastContact 
        ? Math.max(0, 1 - (Date.now() - contact.lastContact.getTime()) / (30 * 24 * 60 * 60 * 1000)) // Higher score for more recent
        : 0;

      // Name matching score
      const nameMatchScore = Math.max(
        ...names.map(searchName => {
          const searchParts = searchName.toLowerCase().split(' ');
          const contactParts = contact.name.toLowerCase().split(' ');
          
          // Check for exact matches first
          if (searchName.toLowerCase() === contact.name.toLowerCase()) return 1;
          
          // Check for partial matches
          const matchingParts = searchParts.filter(part => 
            contactParts.some(contactPart => contactPart.includes(part) || part.includes(contactPart))
          );
          
          return matchingParts.length / Math.max(searchParts.length, contactParts.length);
        })
      );
      
      // Weighted average of all scores
      contact.confidence = (
        frequencyScore * 0.4 + // 40% weight on frequency
        recencyScore * 0.3 + // 30% weight on recency
        nameMatchScore * 0.3 // 30% weight on name matching
      );
      
      return contact;
    });

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    // Cache the results
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      results
    });

    return results;
  } catch (error) {
    console.error('Failed to search email contacts:', error);
    throw error;
  }
}
