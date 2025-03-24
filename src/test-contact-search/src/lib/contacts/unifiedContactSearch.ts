import { SocialApiClient } from './socialApiClient';
import { Contact, SearchOptions, ApiStatus } from './types';

export interface Contact {
  name: string;
  email?: string;
  confidence: number;
  matchedName?: string;
  source: 'google' | 'facebook' | 'linkedin' | 'device';
  profileUrl?: string;
}

export interface SearchOptions {
  includeSocialNetworks: boolean;
  includeDeviceContacts: boolean;
  minConfidence: number;
}

export class UnifiedContactSearch {
  private socialApiClient: SocialApiClient;

  constructor(openaiApiKey: string) {
    this.socialApiClient = new SocialApiClient();
  }

  async validateApiAccess(): Promise<ApiStatus> {
    return this.socialApiClient.validateApiAccess();
  }

  async searchContacts(searchTerm: string, options: SearchOptions = {}): Promise<Contact[]> {
    const {
      includeSocialNetworks = true,
      includeDeviceContacts = true,
      minConfidence = 0.6,
    } = options;

    const results: Contact[] = [];

    if (includeSocialNetworks) {
      try {
        const [facebookContacts, linkedinContacts] = await Promise.all([
          this.socialApiClient.searchFacebookContacts(searchTerm),
          this.socialApiClient.searchLinkedInContacts(searchTerm),
        ]);

        results.push(...facebookContacts, ...linkedinContacts);
      } catch (error) {
        console.error('Error searching social networks:', error);
      }
    }

    if (includeDeviceContacts) {
      // Mock device contacts for testing
      if (searchTerm.length > 0) {
        results.push({
          name: `Test Contact ${searchTerm}`,
          email: `test.${searchTerm}@example.com`,
          source: 'device',
          confidence: 0.95
        });
      }
    }

    // Filter by confidence and sort by confidence score
    return results
      .filter((contact) => contact.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }
}
