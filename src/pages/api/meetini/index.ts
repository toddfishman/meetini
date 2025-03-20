import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
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
  // Set JSON content type header early
  res.setHeader('Content-Type', 'application/json');

  try {
    // Get the token directly
    const token = await getToken({ req });
    
    if (!token?.email) {
      console.error('Authentication error: No token or email');
      return res.status(401).json({ 
        error: 'Not authenticated',
        details: 'Please sign in to access invites'
      });
    }

    if (req.method === 'POST') {
      const { title, contacts, location, preferences, proposedTimes: reqProposedTimes } = req.body;

      // Log request data for debugging
      console.log('Received request:', {
        method: req.method,
        body: req.body,
        token: { email: token.email }
      });

      // Validate required fields
      if (!title?.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'At least one contact is required' });
      }
      
      // If no proposed times, set default to next hour rounded up
      let proposedTimes = reqProposedTimes;
      if (!Array.isArray(proposedTimes) || proposedTimes.length === 0) {
        const now = new Date();
        const nextHour = new Date(now.setHours(now.getHours() + 1, 0, 0, 0));
        proposedTimes = [nextHour.toISOString()];
      }

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

      try {
        // Create the invitation
        const invitation = await prisma.invitation.create({
          data: {
            title: title.trim(),
            status: 'pending',
            type: 'sent',  // Explicitly set type to 'sent' for new invitations
            createdBy: token.email,
            location: location?.trim(),
            proposedTimes: proposedTimes.map((time: string) => new Date(time)),
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

        console.log('Created invitation:', invitation);

        // Send notifications
        try {
          await sendNotifications(
            invitation.participants.map((p: { 
              email: string | null; 
              phoneNumber: string | null; 
              name: string | null;
              notifyByEmail: boolean;
              notifyBySms: boolean;
            }) => ({
              email: p.email || undefined,
              phoneNumber: p.phoneNumber || undefined,
              name: p.name || undefined,
              notifyByEmail: p.notifyByEmail,
              notifyBySms: p.notifyBySms
            })),
            {
              type: 'invitation',
              title: invitation.title,
              creatorName: token.name || token.email,
              creatorEmail: token.email,
              proposedTimes: invitation.proposedTimes.map((time: Date) => time.toISOString()),
              location: invitation.location || undefined,
              invitationId: invitation.id
            }
          );
          console.log('All notifications sent successfully');
        } catch (notifyError) {
          console.error('Notification error:', notifyError);
          // Don't fail the request if notifications partially failed
          // The invitation was still created successfully
        }

        // Set response headers explicitly
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({
          success: true,
          invitation
        });
      } catch (dbError) {
        console.error('Database or notification error:', dbError);
        return res.status(500).json({ 
          error: 'Failed to create invitation',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }
    }

    if (req.method === 'GET') {
      try {
        console.log('Fetching invitations for user:', token.email);
        
        const invitations = await prisma.invitation.findMany({
          where: {
            OR: [
              {
                createdBy: token.email
              },
              {
                participants: {
                  some: {
                    email: token.email
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

        console.log('Found invitations:', JSON.stringify(invitations, null, 2));

        // Transform the invitations to include the correct type based on the user's perspective
        const transformedInvitations = invitations.map(invitation => ({
          ...invitation,
          type: invitation.createdBy === token.email ? 'sent' : 'received'
        }));

        console.log('Transformed invitations:', JSON.stringify(transformedInvitations, null, 2));

        return res.status(200).json(transformedInvitations);
      } catch (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({ 
          error: 'Failed to fetch invites',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }
    }

    if (req.method === 'PUT') {
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
                  { email: token.email },
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
        p.email !== token.email && p.phoneNumber !== null
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
            creatorName: token.name || token.email,
            creatorEmail: token.email,
            proposedTimes: invitation.proposedTimes.map(time => time.toISOString()),
            location: invitation.location || undefined,
            type: 'update'
          }
        );
      }

      return res.status(200).json(updatedInvitation);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in API route:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 