import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { groupId } = req.query;
  if (!groupId || typeof groupId !== 'string') {
    return res.status(400).json({ error: 'Group ID is required' });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Verify group ownership
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      userId: user.id,
    },
  });

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (req.method === 'POST') {
    try {
      const { type, value, name } = req.body;

      if (!type || !value) {
        return res.status(400).json({ error: 'Contact type and value are required' });
      }

      if (!['email', 'phone'].includes(type)) {
        return res.status(400).json({ error: 'Invalid contact type' });
      }

      // Create or find existing contact
      const contact = await prisma.contact.upsert({
        where: {
          userId_type_value: {
            userId: user.id,
            type,
            value,
          },
        },
        update: { name },
        create: {
          userId: user.id,
          type,
          value,
          name,
        },
      });

      // Add contact to group
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: {
          contacts: {
            connect: { id: contact.id },
          },
        },
        include: {
          contacts: true,
        },
      });

      return res.status(200).json(updatedGroup);
    } catch (error) {
      console.error('Failed to add contact to group:', error);
      return res.status(500).json({ error: 'Failed to add contact to group' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { contactId } = req.query;
      
      if (!contactId || typeof contactId !== 'string') {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      // Remove contact from group
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: {
          contacts: {
            disconnect: { id: contactId },
          },
        },
        include: {
          contacts: true,
        },
      });

      return res.status(200).json(updatedGroup);
    } catch (error) {
      console.error('Failed to remove contact from group:', error);
      return res.status(500).json({ error: 'Failed to remove contact from group' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 