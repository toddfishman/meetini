import { Contact, ApiStatus } from './types';
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { LinkedInClient } from 'linkedin-api-client';
import { getSession } from '../../auth/session';

export class SocialApiClient {
  private fbApi: FacebookAdsApi;
  private linkedInClient: LinkedInClient;

  constructor() {
    // Initialize Facebook API with placeholder token (will be updated in methods)
    this.fbApi = FacebookAdsApi.init(
      import.meta.env.VITE_FACEBOOK_APP_ID,
      import.meta.env.VITE_FACEBOOK_APP_SECRET,
      ''
    );

    // Initialize LinkedIn API with placeholder token
    this.linkedInClient = new LinkedInClient({
      clientId: import.meta.env.VITE_LINKEDIN_CLIENT_ID,
      clientSecret: import.meta.env.VITE_LINKEDIN_CLIENT_SECRET,
    });
  }

  async validateApiAccess(): Promise<ApiStatus> {
    const session = await getSession();
    const result: ApiStatus = {
      facebook: false,
      linkedin: false,
      errors: {}
    };

    if (!session?.accessToken) {
      result.errors = {
        facebook: 'Not authenticated',
        linkedin: 'Not authenticated'
      };
      return result;
    }

    if (session.provider === 'facebook') {
      try {
        this.fbApi = FacebookAdsApi.init(
          import.meta.env.VITE_FACEBOOK_APP_ID,
          import.meta.env.VITE_FACEBOOK_APP_SECRET,
          session.accessToken
        );
        await this.fbApi.call('GET', '/me');
        result.facebook = true;
      } catch (error) {
        if (!result.errors) result.errors = {};
        result.errors.facebook = error instanceof Error ? error.message : 'Unknown error';
      }
    } else if (session.provider === 'linkedin') {
      try {
        this.linkedInClient = new LinkedInClient({
          clientId: import.meta.env.VITE_LINKEDIN_CLIENT_ID,
          clientSecret: import.meta.env.VITE_LINKEDIN_CLIENT_SECRET,
          accessToken: session.accessToken
        });
        await this.linkedInClient.get('/v2/me');
        result.linkedin = true;
      } catch (error) {
        if (!result.errors) result.errors = {};
        result.errors.linkedin = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return result;
  }

  async searchFacebookContacts(searchTerm: string): Promise<Contact[]> {
    const session = await getSession();
    if (!session?.accessToken || session.provider !== 'facebook') {
      return [];
    }

    try {
      this.fbApi = FacebookAdsApi.init(
        import.meta.env.VITE_FACEBOOK_APP_ID,
        import.meta.env.VITE_FACEBOOK_APP_SECRET,
        session.accessToken
      );

      const response = await this.fbApi.call('GET', '/me/friends', {
        fields: 'id,name,email',
        q: searchTerm,
        limit: 10,
      });

      if (!response?.data) {
        return [];
      }

      return response.data.map((friend: any) => ({
        name: friend.name,
        email: friend.email,
        profileUrl: `https://facebook.com/${friend.id}`,
        source: 'facebook',
        confidence: 0.95 // High confidence for direct friend matches
      }));
    } catch (error) {
      console.error('Facebook API error:', error);
      return [];
    }
  }

  async searchLinkedInContacts(searchTerm: string): Promise<Contact[]> {
    const session = await getSession();
    if (!session?.accessToken || session.provider !== 'linkedin') {
      return [];
    }

    try {
      this.linkedInClient = new LinkedInClient({
        clientId: import.meta.env.VITE_LINKEDIN_CLIENT_ID,
        clientSecret: import.meta.env.VITE_LINKEDIN_CLIENT_SECRET,
        accessToken: session.accessToken
      });

      const response = await this.linkedInClient.get('/v2/people-search', {
        params: {
          q: searchTerm,
          facetNetwork: ['F'],
          count: 10
        }
      });

      if (!response?.elements) {
        return [];
      }

      return response.elements.map((connection: any) => ({
        name: `${connection.firstName} ${connection.lastName}`,
        email: connection.emailAddress,
        profileUrl: connection.publicProfileUrl,
        source: 'linkedin',
        confidence: 0.9 // High confidence for first-degree connections
      }));
    } catch (error) {
      console.error('LinkedIn API error:', error);
      return [];
    }
  }
}
