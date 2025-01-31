import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      email: string;
      name: string;
      image: string;
    };
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
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        try {
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
          }
        } catch (error) {
          console.error('Error saving calendar account:', error);
          // Don't block sign in if saving calendar account fails
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
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