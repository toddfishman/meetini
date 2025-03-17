import NextAuth, { AuthOptions, JWT, Session, Account, Profile, User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    user: {
      email: string;
      name: string;
      image: string;
    };
    error?: 'RefreshAccessTokenError';
    accessTokenExpires?: number;
  }
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: 'RefreshAccessTokenError';
    email?: string;
  }
}

// Required scopes as per our memory
const REQUIRED_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly'
] as const;

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: REQUIRED_SCOPES.join(' '),
          prompt: 'consent',
          access_type: 'offline'  // Needed for refresh tokens
        }
      }
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) {
        console.error('Sign in failed: No email provided');
        return false;
      }

      // Verify we have all required scopes
      const grantedScopes = account?.scope?.split(' ') || [];
      const missingScopes = REQUIRED_SCOPES.filter(scope => !grantedScopes.includes(scope));
      
      if (missingScopes.length > 0) {
        console.error('Missing required scopes:', missingScopes);
        return false;
      }

      try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          // Create new user if they don't exist
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || '',
              image: user.image || '',
            },
          });
        }

        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async jwt({ token, user, account, profile }) {
      // Initial sign in
      if (account && profile) {
        return {
          accessToken: account.access_token || undefined,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : undefined,
          refreshToken: account.refresh_token || undefined,
          email: profile.email || undefined,
        };
      }

      // Return previous token if the access token has not expired yet
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Access token has expired, try to update it
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.NEXTAUTH_URL
        );

        oauth2Client.setCredentials({
          refresh_token: token.refreshToken || undefined
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        
        console.log('Token refreshed successfully');

        return {
          ...token,
          accessToken: credentials.access_token || undefined,
          accessTokenExpires: credentials.expiry_date || undefined,
          refreshToken: credentials.refresh_token || token.refreshToken,
          error: undefined as 'RefreshAccessTokenError' | undefined,
        };
      } catch (error) {
        console.error('Error refreshing access token:', error);

        return {
          ...token,
          error: 'RefreshAccessTokenError' as const,
          accessToken: undefined,
          accessTokenExpires: undefined,
        };
      }
    },
    async session({ session, token }): Promise<Session> {
      return {
        ...session,
        accessToken: token.accessToken,
        error: token.error as 'RefreshAccessTokenError' | undefined,
        accessTokenExpires: token.accessTokenExpires,
        refreshToken: token.refreshToken,
      };
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
  logger: {
    error(code, ...message) {
      console.error('NextAuth error:', code, message);
    },
    warn(code, ...message) {
      console.warn('NextAuth warning:', code, message);
    },
    debug(code, ...message) {
      if (process.env.NODE_ENV === 'development') {
        console.log('NextAuth debug:', code, message);
      }
    },
  },
};

export default NextAuth(authOptions);