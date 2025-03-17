import { google } from 'googleapis';
import { gmail_v1, people_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { redis, cacheGet, cacheSet } from './redis';

interface EmailContact {
  name: string;
  email: string;
  confidence: number;
  source: 'contacts' | 'gmail';
  frequency: number;
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        );
      }
    }
  }

  return dp[m][n];
}

// Calculate similarity score between 0 and 1
function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLength;
}

export async function searchEmailContacts(
  query: string,
  accessToken: string,
  userEmail: string
): Promise<EmailContact[]> {
  try {
    // Check cache first with proper key format
    const cacheKey = `contact_search:${userEmail}:${query.toLowerCase()}`;
    const cachedResults = await cacheGet(cacheKey);
    if (cachedResults) {
      console.log('Cache hit for query:', query);
      return JSON.parse(cachedResults);
    }

    console.log('Cache miss for query:', query);
    const oauth2Client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const people = google.people({ version: 'v1', auth: oauth2Client });

    // Search email headers with proper query format
    const gmailQuery = `from:(${query}) OR to:(${query})`;
    console.log('Searching Gmail with query:', gmailQuery);
    
    const messages = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 25, // Limit to 25 results as per memory
    });

    if (!messages.data.messages) {
      console.log('No messages found for query:', query);
      return [];
    }

    // Process messages in parallel for better performance
    const emailMap = new Map<string, { frequency: number; lastContact: Date }>();
    const processPromises = messages.data.messages.map(async (message) => {
      try {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Date'],
        });

        const headers = details.data.payload?.headers;
        if (!headers) return;

        const date = new Date(headers.find(h => h.name === 'Date')?.value || '');

        headers.forEach((header) => {
          if (header.name === 'From' || header.name === 'To') {
            const emails = extractEmails(header.value || '');
            emails.forEach((email) => {
              if (email !== userEmail) { // Exclude current user's email
                const existing = emailMap.get(email) || { frequency: 0, lastContact: date };
                emailMap.set(email, {
                  frequency: existing.frequency + 1,
                  lastContact: date > existing.lastContact ? date : existing.lastContact,
                });
              }
            });
          }
        });
      } catch (error) {
        console.error('Error processing message:', message.id, error);
      }
    });

    await Promise.all(processPromises);

    // Get contact details and calculate confidence scores
    const contacts = await Promise.all(
      Array.from(emailMap.entries()).map(async ([email, stats]) => {
        try {
          const person = await people.people.searchDirectoryPeople({
            query: email,
            readMask: 'names,emailAddresses',
            sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT'],
          });

          const contact = person.data.people?.[0];
          const name = contact?.names?.[0]?.displayName || email;
          
          // Calculate confidence score based on our exact scoring algorithm from memory
          let confidence = 0.7; // Base confidence

          const queryLower = query.toLowerCase();
          const nameLower = name.toLowerCase();
          const emailLower = email.toLowerCase();

          // Exact match: 100% confidence
          if (nameLower === queryLower || emailLower === queryLower) {
            confidence = 1.0;
          }
          // Full name contained: 90% confidence
          else if (nameLower.includes(queryLower)) {
            confidence = 0.9;
          }
          // All parts match: 85% confidence
          else if (queryLower.split(' ').every(part => 
            nameLower.includes(part) || emailLower.includes(part)
          )) {
            confidence = 0.85;
          }
          // Partial/similar matches using Levenshtein distance: 70% confidence
          else {
            const nameSimilarity = calculateSimilarity(queryLower, nameLower);
            const emailSimilarity = calculateSimilarity(queryLower, emailLower);
            const maxSimilarity = Math.max(nameSimilarity, emailSimilarity);
            
            // Only consider partial matches if similarity is above 0.5
            if (maxSimilarity > 0.5) {
              confidence = 0.7 + (maxSimilarity - 0.5) * 0.2; // Scale between 0.7 and 0.8
            }
          }

          // Adjust confidence based on interaction frequency (max 10% boost)
          const frequencyBoost = Math.min(stats.frequency / 10, 0.1);
          confidence = Math.min(confidence + frequencyBoost, 1.0);

          return {
            name,
            email,
            confidence,
            source: contact ? 'contacts' : 'gmail',
            frequency: stats.frequency,
          } as EmailContact;
        } catch (error) {
          console.error('Error fetching contact details:', error);
          return null;
        }
      })
    );

    // Filter out nulls, ensure minimum confidence (0.7), and sort by confidence
    const results = contacts
      .filter((contact): contact is EmailContact => 
        contact !== null && contact.confidence >= 0.7
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // Return top 3 matches as per memory

    // Cache results for 5 minutes using our new cacheSet function
    await cacheSet(cacheKey, JSON.stringify(results));
    console.log('Cached results for query:', query);

    return results;
  } catch (error) {
    console.error('Contact search error:', error);
    throw error;
  }
}

function extractEmails(str: string): string[] {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  return Array.from(new Set((str.match(emailRegex) || []).map(email => email.toLowerCase())));
}
