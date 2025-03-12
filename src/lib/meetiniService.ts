import { Session } from 'next-auth';

interface MeetiniInvite {
  type: string;
  participants: Array<{ email: string; name?: string }>;
  suggestedTimes: string[];
  createdBy: string;
  title?: string;
  location?: string;
  description?: string;
}

interface UserStatus {
  isMeetiniUser: boolean;
  preferences: any;
  name: string | null;
}

interface MeetiniUser {
  isMeetiniUser: boolean;
  preferences?: any;
  name: string | null;
}

export async function createMeetiniInvite(
  invite: MeetiniInvite,
  userStatuses: Record<string, MeetiniUser>,
  session: Session | null
): Promise<any> {
  console.log('Creating Meetini invite:', { invite, userStatuses });

  if (!session?.user?.email) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch('/api/meetini/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite,
        userStatuses
      })
    });

    const data = await response.json();
    console.log('Response from create API:', { status: response.status, data });

    if (!response.ok) {
      throw new Error(data.error || data.details || 'Failed to create Meetini invite');
    }

    return data;
  } catch (error) {
    console.error('Error creating Meetini invite:', error);
    throw error instanceof Error ? error : new Error('Failed to create Meetini invite');
  }
}

function generateEventDescription(invite: MeetiniInvite, inviteId: string) {
  return `
Meeting organized via Meetini
Type: ${invite.type}
${invite.description ? `\nDescription: ${invite.description}` : ''}
${invite.location ? `\nLocation: ${invite.location}` : ''}

View and respond to this Meetini: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteId}
  `.trim();
}

function parseTimeSlot(timeSlot: string): [string, string] {
  // Convert timeSlot to start and end times
  const startDate = new Date(timeSlot);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour meeting
  return [startDate.toISOString(), endDate.toISOString()];
}
