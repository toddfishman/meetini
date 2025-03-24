import { OpenAI } from 'openai';
import { gmail_v1 } from '@googleapis/gmail';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface ContactMatch {
  name: string;
  email: string;
  source: 'gmail' | 'facebook' | 'linkedin';
  confidence: number;
  recentInteractions?: number;
  lastInteraction?: Date;
  profileUrl?: string;
  commonConnections?: number;
  verificationStatus: 'verified' | 'likely' | 'possible' | 'ambiguous';
}

export interface ExtractedParticipant {
  rawText: string;
  possibleNames: string[];
  context: string;
  role?: 'organizer' | 'attendee';
}

export class ContactResolver {
  private openai: OpenAI;
  private gmail: gmail_v1.Gmail;
  private cache: Map<string, ContactMatch[]>;
  private cacheExpiry: Map<string, number>;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(openaiApiKey: string, authClient: OAuth2Client) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.cache = new Map();
    this.cacheExpiry = new Map();
  }

  async extractParticipants(input: string): Promise<ExtractedParticipant[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Extract potential participant names from the input text. Consider:
              1. Common name formats (First Last, Last First, nicknames)
              2. Context clues ("with", "and", "meet", "@")
              3. Role indicators ("organize", "host", "join")
              
              Return a JSON array of participants with this structure:
              [{
                "rawText": "the exact text snippet",
                "possibleNames": ["parsed name variations"],
                "context": "relevant context around the name",
                "role": "organizer or attendee if clear"
              }]`
          },
          {
            role: "user",
            content: input
          }
        ],
        response_format: { type: "json_object" }
      });

      if (!completion.choices[0].message.content) {
        throw new Error('OpenAI API returned empty response');
      }

      const result = JSON.parse(completion.choices[0].message.content);
      return result.participants || [];
    } catch (error) {
      console.error('Error extracting participants:', error);
      return this.fallbackExtraction(input);
    }
  }

  private fallbackExtraction(input: string): ExtractedParticipant[] {
    const participants: ExtractedParticipant[] = [];
    
    // Simple regex-based extraction
    const nameMarkers = ['with', 'and', 'for', '@'];
    const words = input.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      if (nameMarkers.includes(words[i].toLowerCase())) {
        if (i + 1 < words.length) {
          const context = words.slice(Math.max(0, i - 2), Math.min(words.length, i + 3)).join(' ');
          participants.push({
            rawText: words[i + 1],
            possibleNames: [words[i + 1]],
            context
          });
        }
      }
    }

    return participants;
  }

  async resolveContacts(participants: ExtractedParticipant[]): Promise<Map<ExtractedParticipant, ContactMatch[]>> {
    const results = new Map<ExtractedParticipant, ContactMatch[]>();
    
    for (const participant of participants) {
      const matches: ContactMatch[] = [];
      
      // Check cache first
      const cacheKey = participant.possibleNames.join('|');
      if (this.cache.has(cacheKey) && 
          this.cacheExpiry.get(cacheKey)! > Date.now()) {
        results.set(participant, this.cache.get(cacheKey)!);
        continue;
      }

      // Search Gmail contacts
      const gmailMatches = await this.searchGmailContacts(participant);
      matches.push(...gmailMatches);

      // TODO: Add Facebook and LinkedIn integration
      // const facebookMatches = await this.searchFacebookContacts(participant);
      // const linkedinMatches = await this.searchLinkedinContacts(participant);
      // matches.push(...facebookMatches, ...linkedinMatches);

      // Score and deduplicate matches
      const scoredMatches = this.scoreAndDeduplicateMatches(matches);

      // Cache results
      this.cache.set(cacheKey, scoredMatches);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);

      results.set(participant, scoredMatches);
    }

    return results;
  }

  private async searchGmailContacts(participant: ExtractedParticipant): Promise<ContactMatch[]> {
    const matches: ContactMatch[] = [];

    try {
      for (const name of participant.possibleNames) {
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: name,
          maxResults: 20
        });

        if (!response.data.messages) continue;

        const emailSet = new Set<string>();
        const nameEmailMap = new Map<string, number>();

        // Analyze recent email interactions
        for (const message of response.data.messages) {
          const details = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id!
          });

          const headers = details.data.payload?.headers;
          if (!headers) continue;

          const from = headers.find(h => h.name === 'From');
          const to = headers.find(h => h.name === 'To');
          
          if (from?.value) {
            const email = this.extractEmail(from.value);
            if (email) {
              emailSet.add(email);
              nameEmailMap.set(email, (nameEmailMap.get(email) || 0) + 1);
            }
          }
        }

        // Create contact matches
        for (const [email, frequency] of nameEmailMap) {
          matches.push({
            name,
            email,
            source: 'gmail',
            confidence: this.calculateConfidence(frequency, name, participant.context),
            recentInteractions: frequency,
            lastInteraction: new Date(), // We could get the actual date from the messages
            verificationStatus: frequency > 5 ? 'verified' : 'likely'
          });
        }
      }
    } catch (error) {
      console.error('Error searching Gmail contacts:', error);
    }

    return matches;
  }

  private extractEmail(str: string): string | null {
    const match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
  }

  private calculateConfidence(
    frequency: number,
    name: string,
    context: string
  ): number {
    let score = 0;

    // Frequency score (0-0.4)
    score += Math.min(frequency / 10, 1) * 0.4;

    // Name match score (0-0.3)
    const nameParts = name.toLowerCase().split(/\s+/);
    const contextParts = context.toLowerCase().split(/\s+/);
    const nameMatchScore = nameParts.filter(part => 
      contextParts.includes(part)
    ).length / nameParts.length;
    score += nameMatchScore * 0.3;

    // Context score (0-0.3)
    const contextKeywords = ['meet', 'with', 'schedule', 'contact'];
    const hasContextKeywords = contextKeywords.some(keyword => 
      context.toLowerCase().includes(keyword)
    );
    if (hasContextKeywords) score += 0.3;

    return Math.min(score, 1);
  }

  private scoreAndDeduplicateMatches(matches: ContactMatch[]): ContactMatch[] {
    // Group by email
    const emailGroups = new Map<string, ContactMatch[]>();
    for (const match of matches) {
      const existing = emailGroups.get(match.email) || [];
      existing.push(match);
      emailGroups.set(match.email, existing);
    }

    // Take highest confidence match for each email
    const deduplicated = Array.from(emailGroups.values()).map(group => 
      group.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      )
    );

    // Sort by confidence
    return deduplicated.sort((a, b) => b.confidence - a.confidence);
  }
}
