import { AuthOptions } from 'next-auth';
import { default as GoogleProvider } from 'next-auth/providers/google';

/** @type {AuthOptions} */
export const authConfig: AuthOptions = {
  providers: [
    {
      id: 'google',
      name: 'Google',
      type: 'oauth',
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/contacts.readonly'
        }
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture
        };
      }
    }
  ],
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    /**
     * @param {{ token: any, account: any }} params
     */
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    /**
     * @param {{ session: any, token: any }} params
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    }
  }
};
