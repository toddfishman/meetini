import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { sendNotifications } from '@/lib/notifications';

interface Contact {
  type: 'email' | 'phone';
  value: string;
  name?: string;
}

interface Participant {
  email: string | null;
  phoneNumber: string | null;
  name: string | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.method === 'POST') {
    try {
      console.log('POST request received:', req.body);
      const { title, contacts, location, preferences, proposedTimes } = req.body;

      // Log the parsed data
      console.log('Parsed request data:', {
        title,
        contacts,
        location,
        preferences,
        proposedTimes
      });

      // Validate required fields
      if (!title) {
        console.log('Validation failed: Title is required');
        return res.status(400).json({ error: 'Title is required' });
      }
      if (!contacts) {
        console.log('Validation failed: Contacts are required');
        return res.status(400).json({ error: 'Contacts are required' });
      }
      if (!Array.isArray(contacts)) {
        console.log('Validation failed: Contacts must be an array');
        return res.status(400).json({ error: 'Contacts must be an array' });
      }
      if (contacts.length === 0) {
        console.log('Validation failed: At least one contact is required');
        return res.status(400).json({ error: 'At least one contact is required' });
      }
      if (!proposedTimes || !Array.isArray(proposedTimes) || proposedTimes.length === 0) {
        console.log('Validation failed: At least one proposed time is required');
        return res.status(400).json({ error: 'At least one proposed time is required' });
      }

      console.log('All validations passed');

      // Validate each contact
      for (const contact of contacts) {
        if (!contact.type || !contact.value) {
          return res.status(400).json({ error: 'Each contact must have a type and value' });
        }
        if (contact.type !== 'email' && contact.type !== 'phone') {
          return res.status(400).json({ error: 'Contact type must be either email or phone' });
        }
        if (contact.type === 'email' && !contact.value.includes('@')) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
      }

      // Create the invitation
      console.log('Creating invitation in database...');
      const invitation = await prisma.invitation.create({
        data: {
          title,
          status: 'pending',
          type: 'sent',
          createdBy: session.user.email,
          location,
          proposedTimes,
          participants: {
            create: contacts.map(contact => ({
              email: contact.type === 'email' ? contact.value : null,
              phoneNumber: contact.type === 'phone' ? contact.value : null,
              name: contact.name,
              notifyByEmail: contact.type === 'email',
              notifyBySms: contact.type === 'phone'
            }))
          },
          preferences: preferences ? {
            create: {
              timePreference: preferences.timePreference,
              durationType: preferences.durationType,
              locationType: preferences.locationType
            }
          } : undefined
        },
        include: {
          participants: true,
          preferences: true
        }
      });

      console.log('Invitation created:', invitation);

      // Send notifications to participants
      console.log('Sending notifications to participants...');
      await sendNotifications(
        invitation.participants.map((p: Participant) => ({
          email: p.email || undefined,
          phoneNumber: p.phoneNumber || undefined,
          name: p.name || undefined,
          notifyByEmail: p.notifyByEmail,
          notifyBySms: p.notifyBySms
        })),
        {
          invitationId: invitation.id,
          title: invitation.title,
          creatorName: session.user.name || session.user.email,
          creatorEmail: session.user.email,
          proposedTimes: invitation.proposedTimes.map(time => time.toISOString()),
          location: invitation.location || undefined,
          type: 'invitation'
        }
      );

      console.log('Notifications sent successfully');
      return res.status(200).json(invitation);
    } catch (error) {
      console.error('Failed to create invitation:', error);
      // Log the full error details
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
      return res.status(500).json({ 
        error: 'Failed to create invitation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  if (req.method === 'GET') {
    try {
      const invitations = await prisma.invitation.findMany({
        where: {
          OR: [
            { createdBy: session.user.email },
            {
              participants: {
                some: {
                  OR: [
                    { email: session.user.email },
                    { phoneNumber: { not: null } } // Include invitations where user is invited by phone
                  ]
                }
              }
            }
          ]
        },
        include: {
          participants: true,
          preferences: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return res.status(200).json(invitations);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
      return res.status(500).json({ error: 'Failed to fetch invitations' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, action } = req.body;

      if (!id || !action) {
        return res.status(400).json({ error: 'Invalid request data' });
      }

      const invitation = await prisma.invitation.findUnique({
        where: { id },
        include: { participants: true }
      });

      if (!invitation) {
        return res.status(404).json({ error: 'Invitation not found' });
      }

      // Update invitation status
      const updatedInvitation = await prisma.invitation.update({
        where: { id },
        data: {
          status: action,
          participants: {
            updateMany: {
              where: {
                OR: [
                  { email: session.user.email },
                  { phoneNumber: { not: null } } // Update status for phone participants
                ]
              },
              data: { status: action }
            }
          }
        },
        include: {
          participants: true
        }
      });

      // Notify other participants of the status change
      const otherParticipants = updatedInvitation.participants.filter((p: Participant) => 
        p.email !== session.user.email && p.phoneNumber !== null
      );

      if (otherParticipants.length > 0) {
        await sendNotifications(
          otherParticipants.map((p: Participant) => ({
            email: p.email || undefined,
            phoneNumber: p.phoneNumber || undefined,
            name: p.name || undefined,
            notifyByEmail: p.notifyByEmail,
            notifyBySms: p.notifyBySms
          })),
          {
            invitationId: invitation.id,
            title: invitation.title,
            creatorName: session.user.name || session.user.email,
            creatorEmail: session.user.email,
            proposedTimes: invitation.proposedTimes.map(time => time.toISOString()),
            location: invitation.location || undefined,
            type: 'update'
          }
        );
      }

      return res.status(200).json(updatedInvitation);
    } catch (error) {
      console.error('Failed to update invitation:', error);
      return res.status(500).json({ error: 'Failed to update invitation' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 