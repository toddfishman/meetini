import { prisma } from '@/lib/prisma';
import { sendNotifications } from '@/lib/notifications';
import { addMinutes, isBefore } from 'date-fns';
import type { Prisma } from '@prisma/client';

interface ReminderJob {
  invitationId: string;
  type: 'invitation' | 'response_needed' | 'upcoming_meeting';
  scheduledFor: Date;
}

type ReminderWithInvitation = Prisma.ReminderGetPayload<{
  include: {
    invitation: {
      include: {
        participants: true;
        creator: true;
      };
    };
  };
}>;

type UserWithSettings = Prisma.UserGetPayload<{
  include: {
    reminderSettings: true;
  };
}>;

export async function scheduleReminders(invitationId: string): Promise<void> {
  try {
    const response = await fetch('/api/reminders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invitationId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to schedule reminders');
    }
  } catch (error) {
    console.error('Failed to schedule reminders:', error);
    throw error;
  }
}

export async function processReminders(): Promise<void> {
  try {
    const response = await fetch('/api/reminders', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process reminders');
    }

    const reminders = await response.json();

    // Process each reminder
    await Promise.all(
      reminders.map(async (reminder: ReminderWithInvitation) => {
        const { invitation } = reminder;
        if (!invitation) return;

        // Prepare notification data
        const notificationData = {
          type: reminder.type === 'upcoming_meeting' ? 'reminder' : reminder.type,
          title: invitation.title,
          description: getReminderDescription(reminder.type),
          date: invitation.proposedTimes[0]?.toISOString(),
          location: invitation.location,
          actionUrl: `${process.env.NEXTAUTH_URL}/invitations/${invitation.id}`,
        };

        // Get recipients based on reminder type
        const recipients = reminder.type === 'response_needed'
          ? invitation.participants.filter(p => p.status === 'pending')
          : invitation.participants;

        // Send notifications
        await sendNotifications(recipients, notificationData);

        // Mark reminder as sent
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { sent: true, sentAt: new Date() },
        });
      })
    );
  } catch (error) {
    console.error('Failed to process reminders:', error);
    throw error;
  }
}

export async function cleanupReminders(): Promise<void> {
  try {
    const response = await fetch('/api/reminders', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cleanup reminders');
    }
  } catch (error) {
    console.error('Failed to cleanup reminders:', error);
    throw error;
  }
}

function getReminderDescription(type: string): string {
  switch (type) {
    case 'invitation':
      return 'You have a pending invitation that needs your attention.';
    case 'response_needed':
      return 'Please respond to this invitation with your availability.';
    case 'upcoming_meeting':
      return 'Your meeting is coming up soon.';
    default:
      return '';
  }
}