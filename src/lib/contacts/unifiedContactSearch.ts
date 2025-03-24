import { OpenAI } from 'openai';

export interface Contact {
  name: string;
  email?: string;
  confidence: number;
  matchedName?: string;
}

export interface SearchOptions {
  includeSocialNetworks: boolean;
  includeDeviceContacts: boolean;
  minConfidence: number;
}

export class UnifiedContactSearch {
  private openai: OpenAI;

  constructor(openaiApiKey: string) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  public async searchContacts(
    input: string,
    options: SearchOptions
  ): Promise<Contact[]> {
    try {
      // Extract names using OpenAI
      const names = await this.extractNames(input);
      
      // Search for each name
      const allContacts: Contact[] = [];
      for (const name of names) {
        const contacts = await this.searchByName(name, options);
        allContacts.push(...contacts);
      }

      // Filter by confidence
      return allContacts.filter(c => c.confidence >= options.minConfidence);
    } catch (error) {
      console.error('Error searching contacts:', error);
      return [];
    }
  }

  private async extractNames(input: string): Promise<string[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'Extract names of people from the following text. Return only a JSON array of names.'
          },
          {
            role: 'user',
            content: input
          }
        ],
        response_format: { type: 'json_object' }
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      return response.names || [];
    } catch (error) {
      console.error('Error extracting names:', error);
      return [];
    }
  }

  private async searchByName(
    name: string,
    options: SearchOptions
  ): Promise<Contact[]> {
    const contacts: Contact[] = [];

    // Simulate device contacts (in a real app, this would use the Contacts API)
    if (options.includeDeviceContacts) {
      contacts.push({
        name: 'John Smith',
        email: 'john@example.com',
        confidence: name.toLowerCase().includes('john') ? 0.9 : 0.6,
        matchedName: 'John'
      });
    }

    // Simulate social network contacts
    if (options.includeSocialNetworks) {
      contacts.push({
        name: 'Sarah Johnson',
        email: 'sarah@example.com',
        confidence: name.toLowerCase().includes('sarah') ? 0.9 : 0.6,
        matchedName: 'Sarah'
      });
    }

    return contacts;
  }
}
