import NextAuth, { NextAuthOptions, User } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { JWT } from 'next-auth/jwt';

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/contacts.readonly'
] as const;

interface ExtendedToken extends JWT {
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number;
  user: {
    email: string;
    name: string;
    image: string;
  };
  error?: string;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: SCOPES.join(' '),
          access_type: 'offline',
          prompt: 'consent',
          response_type: 'code'
        }
      }
    })
  ],
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        console.log('NextAuth: Initial sign in', {
          hasAccessToken: !!account.access_token,
          hasRefreshToken: !!account.refresh_token,
          hasExpiresIn: !!account.expires_in,
          scopes: account.scope?.split(' ')
        });

        const expires_in = account.expires_in ? Number(account.expires_in) : 3600;
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (expires_in * 1000),
          user: {
            email: user.email || '',
            name: user.name || '',
            image: user.image || ''
          }
        } as ExtendedToken;
      }

      const typedToken = token as ExtendedToken;

      // Return previous token if the access token has not expired yet
      if (typedToken.accessTokenExpires && Date.now() < typedToken.accessTokenExpires) {
        console.log('NextAuth: Using existing token', {
          expiresIn: Math.round((typedToken.accessTokenExpires - Date.now()) / 1000)
        });
        return typedToken;
      }

      // Access token has expired, try to update it
      try {
        console.log('NextAuth: Refreshing token');
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: typedToken.refreshToken
          })
        });

        const tokens = await response.json();

        if (!response.ok) {
          console.error('NextAuth: Token refresh failed', tokens);
          throw tokens;
        }

        console.log('NextAuth: Token refreshed successfully');

        return {
          ...typedToken,
          accessToken: tokens.access_token,
          accessTokenExpires: Date.now() + (tokens.expires_in * 1000),
          refreshToken: tokens.refresh_token ?? typedToken.refreshToken
        };
      } catch (error) {
        console.error('NextAuth: Error refreshing access token', error);
        return {
          ...typedToken,
          error: 'RefreshAccessTokenError'
        };
      }
    },
    async session({ session, token }) {
      const typedToken = token as ExtendedToken;
      
      console.log('NextAuth: Creating session', {
        hasToken: !!typedToken,
        hasAccessToken: !!typedToken.accessToken,
        hasRefreshToken: !!typedToken.refreshToken,
        hasError: !!typedToken.error
      });

      // Add token information to the session
      session.accessToken = typedToken.accessToken;
      session.refreshToken = typedToken.refreshToken;
      session.error = typedToken.error;
      session.accessTokenExpires = typedToken.accessTokenExpires;

      // Ensure user information is properly set
      if (typedToken.user) {
        session.user = typedToken.user;
      }

      // If there was a refresh error, pass it to the client
      if (typedToken.error) {
        throw new Error('Failed to refresh access token');
      }

      return session;
    }
  }
};

export default NextAuth(authOptions);