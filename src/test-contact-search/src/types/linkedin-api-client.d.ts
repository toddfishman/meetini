declare module 'linkedin-api-client' {
  interface LinkedInConfig {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
  }

  export class LinkedInClient {
    constructor(config: LinkedInConfig);
    get(path: string, options?: any): Promise<any>;
  }
}
