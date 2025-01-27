import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.method === 'GET') {
    try {
      const accounts = await prisma.calendarAccount.findMany({
        where: { userId: user.id },
      });
      return res.status(200).json(accounts);
    } catch (error) {
      console.error('Failed to fetch calendar accounts:', error);
      return res.status(500).json({ error: 'Failed to fetch calendar accounts' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { provider, accountId, accessToken, refreshToken, expiresAt } = req.body;

      if (!provider || !accountId || !accessToken) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const account = await prisma.calendarAccount.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider,
          },
        },
        update: {
          accountId,
          accessToken,
          refreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        create: {
          userId: user.id,
          provider,
          accountId,
          accessToken,
          refreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });

      return res.status(200).json(account);
    } catch (error) {
      console.error('Failed to create/update calendar account:', error);
      return res.status(500).json({ error: 'Failed to create/update calendar account' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { provider } = req.query;

      if (!provider || typeof provider !== 'string') {
        return res.status(400).json({ error: 'Provider is required' });
      }

      await prisma.calendarAccount.delete({
        where: {
          userId_provider: {
            userId: user.id,
            provider,
          },
        },
      });

      return res.status(200).json({ message: 'Calendar account removed' });
    } catch (error) {
      console.error('Failed to remove calendar account:', error);
      return res.status(500).json({ error: 'Failed to remove calendar account' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 