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
  // Gmail search operators:
  // from: - Specify sender
  // to: - Specify recipient
  // in:anywhere - Search all emails (sent and received)
  // OR - Match either term
  const queryParts = names.map(name => {
    const parts = name.split(' ');
    const queries = [];
    
    // For full names, search exact phrase in from/to
    if (name.includes(' ')) {
      queries.push(`(from:"${name}" OR to:"${name}")`);
    }
    
    // Also search individual parts
    parts.forEach(part => {
      if (part.length > 2) { // Only search parts longer than 2 characters
        queries.push(`(from:${part} OR to:${part})`);
      }
    });

    return `{${queries.join(' OR ')}} in:anywhere`;
  });

  return queryParts.join(' OR ');
}

// Merge similar contacts and update their confidence scores
function mergeAndScoreContacts(contacts: EmailContact[], names: string[]): EmailContact[] {
  const mergedMap = new Map<string, EmailContact>();
  
  contacts.forEach(contact => {
    const normalizedEmail = contact.email.toLowerCase();
    const existing = mergedMap.get(normalizedEmail);
    
    if (existing) {
      // Merge with existing contact
      existing.frequency += contact.frequency;
      if (contact.lastContact && (!existing.lastContact || contact.lastContact > existing.lastContact)) {
        existing.lastContact = contact.lastContact;
      }
      // Keep the name with better matching score
      const existingNameScore = getNameMatchScore(existing.name, names);
      const newNameScore = getNameMatchScore(contact.name, names);
      if (newNameScore > existingNameScore) {
        existing.name = contact.name;
      }
    } else {
      mergedMap.set(normalizedEmail, { ...contact });
    }
  });

  return Array.from(mergedMap.values())
    .map(contact => {
      // Frequency score (max out at 10 emails)
      const frequencyScore = Math.min(contact.frequency / 10, 1);
      
      // Recency score (full score for emails in last 24 hours, decreasing over 30 days)
      const recencyScore = contact.lastContact 
        ? Math.max(0, 1 - (Date.now() - contact.lastContact.getTime()) / (30 * 24 * 60 * 60 * 1000))
        : 0;

      // Name matching score with higher weight
      const nameMatchScore = getNameMatchScore(contact.name, names);

      // Final confidence score with adjusted weights
      contact.confidence = (
        nameMatchScore * 0.5 + // 50% weight on name matching
        frequencyScore * 0.3 + // 30% weight on frequency
        recencyScore * 0.2    // 20% weight on recency
      );

      return contact;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .filter(contact => contact.confidence > 0.1) // Filter out very low confidence matches
    .slice(0, 5); // Only return top 5 matches
}

// Helper function to calculate name match score
function getNameMatchScore(contactName: string, searchNames: string[]): number {
  return Math.max(
    ...searchNames.map(searchName => {
      const searchParts = searchName.toLowerCase().split(' ');
      const contactParts = contactName.toLowerCase().split(' ');
      
      // Exact match gets full score
      if (searchName.toLowerCase() === contactName.toLowerCase()) {
        return 1;
      }
      
      // Calculate partial matches with position weighting
      let totalScore = 0;
      let matchedParts = 0;
      
      searchParts.forEach((searchPart, index) => {
        const bestMatch = Math.max(
          ...contactParts.map(contactPart => {
            if (contactPart === searchPart) return 1;
            if (contactPart.includes(searchPart)) return 0.8;
            if (searchPart.includes(contactPart)) return 0.6;
            return 0;
          })
        );
        
        if (bestMatch > 0) {
          // Weight matches by position (earlier parts are more important)
          totalScore += bestMatch * (1 - index * 0.2);
          matchedParts++;
        }
      });
      
      // Consider the ratio of matched parts and their scores
      return (totalScore / searchParts.length) * (matchedParts / Math.max(searchParts.length, contactParts.length));
    })
  );
}

export async function searchEmailContacts(req: NextApiRequest, names: string[]): Promise<EmailContact[]> {
  try {
    // Check cache first
    const cacheKey = names.sort().join(',');
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Returning cached results for:', names);
      return cached.results;
    }

    const token = await getToken({ req });
    if (!token?.accessToken) {
      console.error('No access token found in session');
      throw new Error('No access token available');
    }

    // Initialize the OAuth2 client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: token.accessToken
    });

    // Build the search query
    const query = buildEmailQuery(names);
    console.log('Gmail search query:', query);

    try {
      // Search for messages
      const response = await gmail.users.messages.list({
        auth: oauth2Client,
        userId: 'me',
        q: query,
        maxResults: 20
      });

      if (!response.data.messages?.length) {
        console.log('No messages found for query:', query);
        return [];
      }

      console.log(`Found ${response.data.messages.length} messages`);

      // Get message details in batches to avoid rate limits
      const contactsMap = new Map<string, EmailContact>();
      
      for (let i = 0; i < Math.min(response.data.messages.length, 20); i++) {
        const message = response.data.messages[i];
        try {
          const details = await gmail.users.messages.get({
            auth: oauth2Client,
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Date', 'Subject']
          });

          const headers = details.data.payload?.headers;
          if (!headers) continue;

          const fromHeader = headers.find(h => h.name === 'From')?.value;
          const toHeader = headers.find(h => h.name === 'To')?.value;
          const dateHeader = headers.find(h => h.name === 'Date')?.value;

          if (!fromHeader || !toHeader) continue;

          // Parse email addresses
          const parseEmail = (header: string) => {
            const match = header.match(/(?:"?([^"<]*)"?\s*)?(?:<(.+@[^>]+)>|\b([^@\s]+@[^@\s]+)\b)/);
            if (!match) return null;
            return {
              name: match[1]?.trim() || match[2]?.split('@')[0] || match[3]?.split('@')[0],
              email: match[2] || match[3]
            };
          };

          // Process both from and to addresses
          [fromHeader, toHeader].forEach(header => {
            const contact = parseEmail(header);
            if (!contact) return;

            // Skip if it's your own email
            if (contact.email === token.email) return;

            const existing = contactsMap.get(contact.email);
            if (existing) {
              existing.frequency += 1;
              if (dateHeader) {
                const date = new Date(dateHeader);
                if (!existing.lastContact || date > existing.lastContact) {
                  existing.lastContact = date;
                }
              }
            } else {
              contactsMap.set(contact.email, {
                name: contact.name,
                email: contact.email,
                frequency: 1,
                lastContact: dateHeader ? new Date(dateHeader) : undefined,
                confidence: 0
              });
            }
          });

        } catch (error) {
          console.error('Error fetching message details:', error);
        }
      }

      // Process results through the new merging and scoring system
      const results = mergeAndScoreContacts(Array.from(contactsMap.values()), names);

      // Cache results
      searchCache.set(cacheKey, {
        timestamp: Date.now(),
        results
      });

      return results;
    } catch (error) {
      console.error('Error searching contacts:', error);
      throw error;
    }
  } catch (error) {
    console.error('Email search error:', error);
    throw error;
  }
}
