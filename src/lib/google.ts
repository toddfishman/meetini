import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';

const gmail = google.gmail('v1');

export interface EmailContact {
  name: string;
  email: string;
  frequency: number;
  lastContact?: Date;
  confidence: number;
  matchedName?: string;
}

interface ContactSearchResults {
  [name: string]: EmailContact[];
}

// Cache email search results for 5 minutes
const searchCache = new Map<string, { 
  timestamp: number;
  results: ContactSearchResults;
}>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function buildEmailQuery(names: string[]): string[] {
  // Create separate queries for each name to ensure we get results for all
  return names.map(name => {
    const nameParts = name.split(' ');
    const exactMatch = `"${name}"`;
    
    // For single-word names, also search without quotes but only in From/To
    if (nameParts.length === 1) {
      return `(${exactMatch} OR (from:${name} OR to:${name}))`;
    }
    
    return exactMatch;
  });
}

function getExactNameMatchScore(contactName: string, searchName: string): number {
  const cn = contactName.toLowerCase();
  const sn = searchName.toLowerCase();
  
  // Exact match
  if (cn === sn) return 1;
  
  // Check if contact name contains the full search name
  if (cn.includes(sn)) return 0.9;
  
  // Check if search name contains the full contact name
  if (sn.includes(cn)) return 0.9;
  
  // Split into parts and check for exact part matches
  const contactParts = cn.split(' ').filter(p => p.length > 1);
  const searchParts = sn.split(' ').filter(p => p.length > 1);
  
  const matchingParts = searchParts.filter(p => contactParts.some(cp => cp.includes(p) || p.includes(cp)));
  if (matchingParts.length === searchParts.length) return 0.85;
  
  // Partial name matches (e.g., "tod" matches "todd")
  if (searchParts.some(p => 
    contactParts.some(cp => 
      cp.startsWith(p) || 
      p.startsWith(cp) ||
      // Levenshtein distance for similar names
      (p.length > 3 && cp.length > 3 && levenshteinDistance(p, cp) <= 2)
    )
  )) {
    return 0.7;
  }
  
  return 0;
}

// Helper function to calculate Levenshtein distance for similar names
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

export async function searchEmailContacts(req: NextApiRequest, names: string[]): Promise<ContactSearchResults> {
  try {
    const cacheKey = names.sort().join(',');
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
    }

    const token = await getToken({ req });
    if (!token?.accessToken) {
      throw new Error('No access token available');
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token.accessToken });

    const queries = buildEmailQuery(names);
    console.log('Gmail search queries:', queries);

    // Get messages for each name in parallel
    const messagePromises = queries.map(query => 
      gmail.users.messages.list({
        auth: oauth2Client,
        userId: 'me',
        q: query,
        maxResults: 25 // Reduced per name since we're searching multiple times
      })
    );

    const responses = await Promise.all(messagePromises);
    const allMessageIds = new Set(
      responses
        .flatMap(response => response.data.messages || [])
        .map(msg => msg.id!)
    );

    if (allMessageIds.size === 0) {
      const emptyResults: ContactSearchResults = {};
      names.forEach(name => { emptyResults[name] = []; });
      searchCache.set(cacheKey, { timestamp: Date.now(), results: emptyResults });
      return emptyResults;
    }

    // Process messages in parallel for speed
    const contactsByName = new Map<string, Map<string, EmailContact>>();
    names.forEach(name => contactsByName.set(name, new Map()));
    
    await Promise.all(
      Array.from(allMessageIds).map(async messageId => {
        try {
          const details = await gmail.users.messages.get({
            auth: oauth2Client,
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Date']
          });

          const headers = details.data.payload?.headers;
          if (!headers) return;

          const fromHeader = headers.find(h => h.name === 'From')?.value;
          const toHeader = headers.find(h => h.name === 'To')?.value;
          const dateHeader = headers.find(h => h.name === 'Date')?.value;

          // Only process direct participants (From/To), ignore CC/BCC
          const parseEmail = (header: string) => {
            const match = header.match(/(?:"?([^"<]*)"?\s*)?(?:<(.+@[^>]+)>|\b([^@\s]+@[^@\s]+)\b)/);
            if (!match) return null;
            return {
              name: (match[1] || '').trim() || match[2]?.split('@')[0] || match[3]?.split('@')[0],
              email: match[2] || match[3]
            };
          };

          // Process From header
          if (fromHeader) {
            const contact = parseEmail(fromHeader);
            if (contact && contact.email !== token.email) {
              for (const searchName of names) {
                const score = getExactNameMatchScore(contact.name, searchName);
                if (score >= 0.7) { // More lenient threshold
                  const contactsForName = contactsByName.get(searchName)!;
                  const existing = contactsForName.get(contact.email.toLowerCase());
                  if (existing) {
                    existing.frequency++;
                    if (dateHeader) {
                      const date = new Date(dateHeader);
                      if (!existing.lastContact || date > existing.lastContact) {
                        existing.lastContact = date;
                      }
                    }
                    if (score > existing.confidence) {
                      existing.confidence = score;
                    }
                  } else {
                    contactsForName.set(contact.email.toLowerCase(), {
                      name: contact.name,
                      email: contact.email,
                      frequency: 1,
                      lastContact: dateHeader ? new Date(dateHeader) : undefined,
                      confidence: score,
                      matchedName: searchName
                    });
                  }
                }
              }
            }
          }

          // Process To header similarly
          if (toHeader) {
            const toContacts = toHeader.split(',').map(parseEmail).filter(Boolean);
            for (const contact of toContacts) {
              if (contact && contact.email !== token.email) {
                for (const searchName of names) {
                  const score = getExactNameMatchScore(contact.name, searchName);
                  if (score >= 0.7) { // More lenient threshold
                    const contactsForName = contactsByName.get(searchName)!;
                    const existing = contactsForName.get(contact.email.toLowerCase());
                    if (existing) {
                      existing.frequency++;
                      if (dateHeader) {
                        const date = new Date(dateHeader);
                        if (!existing.lastContact || date > existing.lastContact) {
                          existing.lastContact = date;
                        }
                      }
                      if (score > existing.confidence) {
                        existing.confidence = score;
                      }
                    } else {
                      contactsForName.set(contact.email.toLowerCase(), {
                        name: contact.name,
                        email: contact.email,
                        frequency: 1,
                        lastContact: dateHeader ? new Date(dateHeader) : undefined,
                        confidence: score,
                        matchedName: searchName
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      })
    );

    // Convert results to final format
    const results: ContactSearchResults = {};
    contactsByName.forEach((contacts, name) => {
      results[name] = Array.from(contacts.values())
        .sort((a, b) => {
          if (b.confidence !== a.confidence) return b.confidence - a.confidence;
          return b.frequency - a.frequency;
        })
        .slice(0, 3); // Top 3 matches per name
    });

    // Cache results
    searchCache.set(cacheKey, { timestamp: Date.now(), results });
    return results;
  } catch (error) {
    console.error('Error searching contacts:', error);
    throw error;
  }
}
