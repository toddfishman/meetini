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
      const { start, end } = req.query;

      if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      const events = await prisma.manualEvent.findMany({
        where: {
          userId: user.id,
          start: {
            gte: new Date(start),
          },
          end: {
            lte: new Date(end),
          },
        },
        orderBy: {
          start: 'asc',
        },
      });

      return res.status(200).json(events);
    } catch (error) {
      console.error('Failed to fetch manual events:', error);
      return res.status(500).json({ error: 'Failed to fetch manual events' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { title, start, end, location } = req.body;

      if (!title || !start || !end) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const event = await prisma.manualEvent.create({
        data: {
          userId: user.id,
          title,
          start: new Date(start),
          end: new Date(end),
          location,
        },
      });

      return res.status(201).json(event);
    } catch (error) {
      console.error('Failed to create manual event:', error);
      return res.status(500).json({ error: 'Failed to create manual event' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, title, start, end, location } = req.body;

      if (!id || !title || !start || !end) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const event = await prisma.manualEvent.update({
        where: {
          id,
          userId: user.id,
        },
        data: {
          title,
          start: new Date(start),
          end: new Date(end),
          location,
        },
      });

      return res.status(200).json(event);
    } catch (error) {
      console.error('Failed to update manual event:', error);
      return res.status(500).json({ error: 'Failed to update manual event' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Event ID is required' });
      }

      await prisma.manualEvent.delete({
        where: {
          id,
          userId: user.id,
        },
      });

      return res.status(200).json({ message: 'Event deleted' });
    } catch (error) {
      console.error('Failed to delete manual event:', error);
      return res.status(500).json({ error: 'Failed to delete manual event' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 