import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';

const gmail = google.gmail('v1');

interface EmailContact {
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

function buildEmailQuery(names: string[]): string {
  const queryParts = names.map(name => {
    const nameParts = name.split(' ');
    const exactMatch = `"${name}"`;
    
    if (nameParts.length === 1) {
      return `(${exactMatch} OR (from:${name} OR to:${name}))`;
    }
    
    return exactMatch;
  });

  return queryParts.join(' OR ');
}

function getExactNameMatchScore(contactName: string, searchName: string): number {
  const cn = contactName.toLowerCase();
  const sn = searchName.toLowerCase();
  
  if (cn === sn) return 1;
  if (cn.includes(sn)) return 0.9;
  if (sn.includes(cn)) return 0.9;
  
  const contactParts = cn.split(' ').filter(p => p.length > 1);
  const searchParts = sn.split(' ').filter(p => p.length > 1);
  
  const matchingParts = searchParts.filter(p => contactParts.includes(p));
  if (matchingParts.length === searchParts.length) return 0.85;
  
  return 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { names } = req.body;
    if (!Array.isArray(names) || !names.length) {
      return res.status(400).json({ error: 'Names array required' });
    }

    const cacheKey = names.sort().join(',');
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json(cached.results);
    }

    const token = await getToken({ req });
    if (!token?.accessToken) {
      return res.status(401).json({ error: 'No access token available' });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token.accessToken });

    const query = buildEmailQuery(names);
    console.log('Gmail search query:', query);

    const response = await gmail.users.messages.list({
      auth: oauth2Client,
      userId: 'me',
      q: query,
      maxResults: 50
    });

    if (!response.data.messages?.length) {
      const emptyResults: ContactSearchResults = {};
      names.forEach(name => { emptyResults[name] = []; });
      searchCache.set(cacheKey, { timestamp: Date.now(), results: emptyResults });
      return res.status(200).json(emptyResults);
    }

    const contactsByName = new Map<string, Map<string, EmailContact>>();
    names.forEach(name => contactsByName.set(name, new Map()));
    
    await Promise.all(
      response.data.messages.map(async message => {
        try {
          const details = await gmail.users.messages.get({
            auth: oauth2Client,
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Date']
          });

          const headers = details.data.payload?.headers;
          if (!headers) return;

          const fromHeader = headers.find(h => h.name === 'From')?.value;
          const toHeader = headers.find(h => h.name === 'To')?.value;
          const dateHeader = headers.find(h => h.name === 'Date')?.value;

          const parseEmail = (header: string) => {
            const match = header.match(/(?:"?([^"<]*)"?\s*)?(?:<(.+@[^>]+)>|\b([^@\s]+@[^@\s]+)\b)/);
            if (!match) return null;
            return {
              name: (match[1] || '').trim() || match[2]?.split('@')[0] || match[3]?.split('@')[0],
              email: match[2] || match[3]
            };
          };

          if (fromHeader) {
            const contact = parseEmail(fromHeader);
            if (contact && contact.email !== token.email) {
              for (const searchName of names) {
                const score = getExactNameMatchScore(contact.name, searchName);
                if (score >= 0.85) {
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

          if (toHeader) {
            const toContacts = toHeader.split(',').map(parseEmail).filter(Boolean);
            for (const contact of toContacts) {
              if (contact && contact.email !== token.email) {
                for (const searchName of names) {
                  const score = getExactNameMatchScore(contact.name, searchName);
                  if (score >= 0.85) {
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

    const results: ContactSearchResults = {};
    for (const [name, contacts] of contactsByName.entries()) {
      results[name] = Array.from(contacts.values())
        .sort((a, b) => b.confidence - a.confidence || b.frequency - a.frequency);
    }

    searchCache.set(cacheKey, { timestamp: Date.now(), results });
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error searching contacts:', error);
    return res.status(500).json({ 
      error: 'Failed to search contacts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
