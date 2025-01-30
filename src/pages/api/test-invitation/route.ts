import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { sendNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function POST() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Create a test invitation
    const invitation = await prisma.invitation.create({
      data: {
        title: 'Test Invitation',
        status: 'pending',
        type: 'sent',
        createdBy: session.user.email,
        location: 'Virtual Meeting',
        proposedTimes: [
          new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
          new Date(Date.now() + 48 * 60 * 60 * 1000), // day after tomorrow
        ],
        participants: {
          create: [
            {
              email: session.user.email,
              name: session.user.name || 'Test User',
              notifyByEmail: true,
              notifyBySms: false,
              status: 'pending'
            }
          ]
        },
        preferences: {
          create: {
            timePreference: 'morning',
            durationType: '1hour',
            locationType: 'virtual'
          }
        }
      },
      include: {
        participants: true,
        preferences: true
      }
    });

    // Send test notification
    await sendNotifications(
      invitation.participants.map(p => ({
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

    return NextResponse.json({
      message: 'Test invitation created and notification sent successfully',
      invitation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test invitation error:', error);
    return NextResponse.json({
      error: 'Failed to create test invitation',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorObject: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }, { status: 500 });
  }
} 