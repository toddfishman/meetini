import OpenAI from 'openai';
import { google, people_v1 } from 'googleapis';

export interface ExtractedContact {
  name: string;
  email?: string;
  confidence: number;
}

export interface ContactSearchResult {
  contacts: ExtractedContact[];
  remainingText: string;
}

export class ContactExtractor {
  private openai: OpenAI;
  private peopleApi: people_v1.People;

  constructor(openaiApiKey: string, auth: any) {
    this.openai = new OpenAI({
      apiKey: openaiApiKey
    });
    this.peopleApi = google.people({ version: 'v1', auth });
  }

  private async searchContacts(query: string): Promise<people_v1.Schema$Person[]> {
    try {
      const response = await this.peopleApi.people.searchContacts({
        query,
        readMask: 'names,emailAddresses',
        pageSize: 10
      });
      
      return response.data.results || [];
    } catch (error) {
      console.error('Error searching contacts:', error);
      return [];
    }
  }

  private async extractNamesWithAI(input: string): Promise<string[]> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts people's names from text. Return only the names in a JSON array."
        },
        {
          role: "user",
          content: `Extract all names from this text: "${input}". For example, from "coffee with John and Sarah tomorrow", return ["John", "Sarah"]. Return only a JSON array of names.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return response.names || [];
  }

  private removeNamesFromText(text: string, names: string[]): string {
    let remaining = text;
    for (const name of names) {
      // Remove the name and any connecting words (with, and) around it
      remaining = remaining.replace(new RegExp(`\\s*(with|and)?\\s*${name}\\s*(with|and)?\\s*`, 'gi'), ' ');
    }
    return remaining.trim();
  }

  public async extractContacts(input: string): Promise<ContactSearchResult> {
    try {
      // First, use GPT to identify potential names
      const names = await this.extractNamesWithAI(input);
      console.log('Extracted names:', names);
      
      // Search for each name in contacts
      const contactPromises = names.map(async name => {
        const searchResults = await this.searchContacts(name);
        console.log('Search results for', name, ':', searchResults);
        
        if (searchResults.length > 0) {
          // Sort by relevance/confidence
          const matches = searchResults.map(result => ({
            name: result.names?.[0]?.displayName || name,
            email: result.emailAddresses?.[0]?.value,
            confidence: this.calculateConfidence(name, result)
          }));
          
          // Return the best match
          return matches.sort((a, b) => b.confidence - a.confidence)[0];
        }
        
        // If no match found, return just the name with low confidence
        return {
          name,
          confidence: 0.3 // Low confidence for unmatched names
        };
      });

      const contacts = await Promise.all(contactPromises);
      const remainingText = this.removeNamesFromText(input, names);

      console.log('Final contacts:', contacts);
      console.log('Remaining text:', remainingText);

      return {
        contacts: contacts.filter(c => c.confidence > 0.2), // Filter out very low confidence matches
        remainingText
      };
    } catch (error) {
      console.error('Error in extractContacts:', error);
      throw error;
    }
  }

  private calculateConfidence(queryName: string, result: people_v1.Schema$Person): number {
    let confidence = 0;

    // Exact match on display name
    if (result.names?.[0]?.displayName?.toLowerCase() === queryName.toLowerCase()) {
      confidence += 0.6;
    }
    // Partial match on display name
    else if (result.names?.[0]?.displayName?.toLowerCase().includes(queryName.toLowerCase())) {
      confidence += 0.4;
    }

    // Has email
    if (result.emailAddresses?.[0]?.value) {
      confidence += 0.3;
    }

    // Is from directory
    if (result.metadata?.source?.type === 'DIRECTORY') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1);
  }
}
