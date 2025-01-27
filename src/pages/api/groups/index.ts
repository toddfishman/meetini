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
      const groups = await prisma.group.findMany({
        where: { userId: user.id },
        include: {
          contacts: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return res.status(200).json(groups);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      return res.status(500).json({ error: 'Failed to fetch groups' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const group = await prisma.group.create({
        data: {
          userId: user.id,
          name,
          description,
        },
        include: {
          contacts: true,
        },
      });

      return res.status(201).json(group);
    } catch (error) {
      console.error('Failed to create group:', error);
      return res.status(500).json({ error: 'Failed to create group' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 