import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
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
  }
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar"
        }
      }
    }),
  ],
  debug: true, // Enable debug logs in all environments temporarily
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        try {
          console.log('Sign in callback - account:', { 
            provider: account.provider,
            accessToken: !!account.access_token,
            refreshToken: !!account.refresh_token,
            email: user.email 
          });

          // Get or create user
          const dbUser = await prisma.user.upsert({
            where: { email: user.email },
            create: {
              email: user.email,
              name: user.name || null,
              image: user.image || null,
            },
            update: {
              name: user.name || null,
              image: user.image || null,
            },
          });

          // Create or update calendar account
          if (account.access_token) {
            await prisma.calendarAccount.upsert({
              where: {
                userId_provider: {
                  userId: dbUser.id,
                  provider: 'google',
                },
              },
              create: {
                userId: dbUser.id,
                provider: 'google',
                accountId: account.providerAccountId,
                accessToken: account.access_token,
                refreshToken: account.refresh_token,
                expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
              },
              update: {
                accessToken: account.access_token,
                refreshToken: account.refresh_token,
                expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
              },
            });
            console.log('Calendar account updated successfully');
          } else {
            console.warn('No access token in account during sign in');
          }
        } catch (error) {
          console.error('Error in signIn callback:', error);
          // Don't block sign in if saving calendar account fails
        }
      }
      return true;
    },
    async jwt({ token, account, user }) {
      console.log('JWT callback - token before:', { 
        hasAccessToken: !!token.accessToken,
        hasRefreshToken: !!token.refreshToken,
        hasAccount: !!account
      });

      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
      }

      // Return previous token if the access token has not expired yet
      if (token.accessTokenExpires && typeof token.accessTokenExpires === 'number' && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Access token has expired, try to refresh it
      if (token.refreshToken && typeof token.refreshToken === 'string') {
        try {
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: 'refresh_token',
              refresh_token: token.refreshToken,
            }),
          });

          const tokens = await response.json();

          if (!response.ok) throw tokens;

          console.log('Token refresh successful');
          
          return {
            ...token,
            accessToken: tokens.access_token as string,
            accessTokenExpires: Date.now() + ((tokens.expires_in as number) * 1000),
          };
        } catch (error) {
          console.error('Error refreshing access token:', error);
          return { ...token, error: 'RefreshAccessTokenError' };
        }
      }

      console.log('JWT callback - token after:', { 
        hasAccessToken: !!token.accessToken,
        hasRefreshToken: !!token.refreshToken
      });

      return token;
    },
    async session({ session, token }) {
      console.log('Session callback:', { 
        hasAccessToken: !!token.accessToken,
        hasRefreshToken: !!token.refreshToken,
        hasError: !!token.error
      });

      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken;
      }
      if (typeof token.refreshToken === 'string') {
        session.refreshToken = token.refreshToken;
      }
      
      if (token.error) {
        // @ts-ignore
        session.error = token.error;
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/',
    error: '/',
  }
};

export default NextAuth(authOptions); 