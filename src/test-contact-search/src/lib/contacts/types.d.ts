declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(appId: string, appSecret: string, accessToken: string): FacebookAdsApi;
    call(method: string, path: string, params?: any): Promise<any>;
  }

  export class User {
    static getFields(): string[];
  }
}

declare module 'linkedin-api-client' {
  export interface LinkedInConfig {
    clientId: string;
    clientSecret: string;
  }

  export class LinkedInClient {
    constructor(config: LinkedInConfig);
    get(path: string, options?: any): Promise<any>;
  }
}

export interface Contact {
  name: string;
  email?: string;
  profileUrl?: string;
  source: 'facebook' | 'linkedin' | 'device';
  confidence: number;
}

export interface SearchOptions {
  includeSocialNetworks?: boolean;
  includeDeviceContacts?: boolean;
  minConfidence?: number;
}

export interface ApiStatus {
  facebook: boolean;
  linkedin: boolean;
  errors?: {
    facebook?: string;
    linkedin?: string;
  };
}
