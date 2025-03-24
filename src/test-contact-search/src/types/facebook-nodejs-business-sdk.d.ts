declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(appId: string, appSecret: string, accessToken: string): FacebookAdsApi;
    call(method: string, path: string, params?: any): Promise<any>;
  }
}
