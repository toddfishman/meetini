import { google } from 'googleapis';
import { NextApiRequest } from 'next';
import { getToken } from 'next-auth/jwt';

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
  return names.map(name => {
    const nameParts = name.split(' ');
    
    // Build a comprehensive search query that mimics how Gmail's UI search works
    const searchParts = [];
    
    // 1. Search for the name in various forms
    searchParts.push(`(${[
      // Full name variations (without quotes for partial matches)
      `${name}`,
      `${name.toLowerCase()}`,
      // First/last name combinations if multiple parts
      ...(nameParts.length > 1 ? nameParts.map(part => part.toLowerCase()) : []),
      // Email patterns (without quotes for partial matches)
      ...nameParts.map(part => `${part.toLowerCase()}@`),
      // Display name patterns
      ...nameParts.map(part => `name:${part.toLowerCase()}`),
      // Add partial match patterns
      ...nameParts.map(part => part.length > 3 ? part.toLowerCase().substring(0, part.length - 1) : part.toLowerCase())
    ].join(' OR ')})`);
    
    // 2. Search in email headers (more lenient)
    const headerSearch = `(${[
      ...nameParts.map(part => part.length > 3 ? 
        `(from:${part.toLowerCase()} OR to:${part.toLowerCase()} OR cc:${part.toLowerCase()})` : 
        null
      ).filter(Boolean)
    ].join(' OR ')})`;
    searchParts.push(headerSearch);
    
    // 3. Add subject search for context (more lenient)
    searchParts.push(`(${[
      `subject:${name.toLowerCase()}`,
      ...nameParts.map(part => part.length > 3 ? `subject:${part.toLowerCase()}` : null).filter(Boolean)
    ].join(' OR ')})`);
    
    // Combine all search parts with OR
    return `(${searchParts.join(' OR ')})`;
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
    const token = await getToken({ req });
    if (!token?.accessToken || !token.email) {
      throw new Error('No access token or email available');
    }

    const userEmail = token.email.toLowerCase();
    const cacheKey = `${userEmail}:${names.sort().join(',')}`;
    
    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
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
        q: query, // Remove the exclusion of user's own emails for broader search
        maxResults: 50
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
            metadataHeaders: ['From', 'To', 'Cc', 'Date'] // Added Cc for broader search
          });

          const headers = details.data.payload?.headers;
          if (!headers) return;

          const fromHeader = headers.find(h => h.name === 'From')?.value;
          const toHeader = headers.find(h => h.name === 'To')?.value;
          const ccHeader = headers.find(h => h.name === 'Cc')?.value; // Added Cc processing
          const dateHeader = headers.find(h => h.name === 'Date')?.value;

          const parseEmail = (header: string) => {
            const match = header.match(/(?:"?([^"<]*)"?\s*)?(?:<(.+@[^>]+)>|\b([^@\s]+@[^@\s]+)\b)/);
            if (!match) return null;
            return {
              name: (match[1] || '').trim() || match[2]?.split('@')[0] || match[3]?.split('@')[0],
              email: match[2] || match[3]
            };
          };

          // Process all headers
          const processHeader = (headerValue: string | undefined, searchName: string) => {
            if (!headerValue) return;
            const contacts = headerValue.split(',').map(parseEmail).filter((c): c is NonNullable<typeof c> => c !== null);
            for (const contact of contacts) {
              if (contact.email !== token.email) {
                const score = getNameMatchScore(contact.name, searchName); // Use more lenient scoring
                if (score >= 0.5) { // Lower threshold for matches
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
                      existing.matchedName = contact.name;
                    }
                  } else {
                    contactsForName.set(contact.email.toLowerCase(), {
                      name: contact.name,
                      email: contact.email,
                      frequency: 1,
                      lastContact: dateHeader ? new Date(dateHeader) : undefined,
                      confidence: score,
                      matchedName: contact.name
                    });
                  }
                }
              }
            }
          };

          // Process all headers for each name
          for (const searchName of names) {
            if (fromHeader) processHeader(fromHeader, searchName);
            if (toHeader) processHeader(toHeader, searchName);
            if (ccHeader) processHeader(ccHeader, searchName);
          }
        } catch (error) {
          console.error('Error processing message:', messageId, error);
        }
      })
    );

    // Convert to final format and sort by confidence and frequency
    const results: ContactSearchResults = {};
    for (const [name, contacts] of contactsByName) {
      results[name] = Array.from(contacts.values())
        .sort((a, b) => {
          // First by confidence
          if (b.confidence !== a.confidence) {
            return b.confidence - a.confidence;
          }
          // Then by frequency
          if (b.frequency !== a.frequency) {
            return b.frequency - a.frequency;
          }
          // Finally by last contact date
          if (a.lastContact && b.lastContact) {
            return b.lastContact.getTime() - a.lastContact.getTime();
          }
          return 0;
        });
    }

    // Cache the results
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      results
    });

    return results;
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

// More lenient name matching function
function getNameMatchScore(name1: string, name2: string): number {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  
  // Direct match
  if (n1 === n2) return 1;
  
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;
  
  // Check individual parts
  const parts1 = n1.split(/[\s-_]+/);
  const parts2 = n2.split(/[\s-_]+/);
  
  // Check if any parts match or are contained within each other
  for (const p1 of parts1) {
    for (const p2 of parts2) {
      if (p1 === p2) return 0.8;
      if (p1.includes(p2) || p2.includes(p1)) return 0.7;
      if (p1.length > 3 && p2.length > 3) {
        // Check for partial matches of longer words
        if (p1.startsWith(p2) || p2.startsWith(p1)) return 0.6;
      }
    }
  }
  
  return 0;
}
