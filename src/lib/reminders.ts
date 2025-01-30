import { prisma } from '@/lib/prisma';
import { sendNotifications } from '@/lib/notifications';
import { addMinutes } from 'date-fns';
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
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        participants: true,
        creator: {
          include: {
            reminderSettings: true,
          },
        },
        recipients: {
          include: {
            reminderSettings: true,
          },
        },
      },
    });

    if (!invitation) throw new Error('Invitation not found');

    // Schedule reminders based on user preferences
    const reminderJobs: ReminderJob[] = [];

    // For each participant, schedule reminders based on their settings
    [...invitation.recipients, invitation.creator].forEach((user: UserWithSettings) => {
      if (!user.reminderSettings) return;

      user.reminderSettings.forEach(setting => {
        if (!setting.enabled) return;

        setting.timing.forEach(minutes => {
          const scheduledFor = addMinutes(new Date(), -minutes);
          reminderJobs.push({
            invitationId,
            type: setting.type as 'invitation' | 'response_needed' | 'upcoming_meeting',
            scheduledFor,
          });
        });
      });
    });

    // Create reminder records in the database
    await prisma.reminder.createMany({
      data: reminderJobs.map(job => ({
        invitationId: job.invitationId,
        type: job.type,
        scheduledFor: job.scheduledFor,
      })),
    });
  } catch (error) {
    console.error('Failed to schedule reminders:', error);
    throw error;
  }
}

export async function processReminders(): Promise<void> {
  try {
    // Find all due reminders that haven't been sent
    const dueReminders = await prisma.reminder.findMany({
      where: {
        sent: false,
        scheduledFor: {
          lte: new Date(),
        },
      },
      include: {
        invitation: {
          include: {
            participants: true,
            creator: true,
          },
        },
      },
    });

    // Process each reminder
    await Promise.all(
      dueReminders.map(async (reminder: ReminderWithInvitation) => {
        const { invitation } = reminder;
        if (!invitation) return;

        // Prepare notification data
        const notificationData = {
          type: reminder.type === 'upcoming_meeting' ? 'reminder' : 'update',
          title: invitation.title,
          description: getReminderDescription(reminder.type),
          date: invitation.proposedTimes[0]?.toISOString(),
          location: invitation.location || undefined,
          actionUrl: `${process.env.NEXTAUTH_URL}/invitations/${invitation.id}`,
        } as const;

        // Get recipients based on reminder type and map to NotificationRecipient format
        const recipients = (reminder.type === 'response_needed'
          ? invitation.participants.filter(p => p.status === 'pending')
          : invitation.participants).map(p => ({
            email: p.email,
            phoneNumber: p.phoneNumber || undefined,
            name: p.name || undefined,
            notifyByEmail: p.notifyByEmail,
            notifyBySms: p.notifyBySms
          }));

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
    // Delete old sent reminders (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await prisma.reminder.deleteMany({
      where: {
        sent: true,
        sentAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    // Delete reminders for past meetings
    const now = new Date();
    const pastInvitations = await prisma.invitation.findMany({
      where: {
        proposedTimes: {
          lte: now,
        },
      },
      select: { id: true },
    });

    await prisma.reminder.deleteMany({
      where: {
        invitationId: {
          in: pastInvitations.map(inv => inv.id),
        },
      },
    });
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