import { Resend } from 'resend';

interface MeetingDetails {
  title: string;
  type: string;
  dateTime: Date;
  duration: string;
  location: string;
  description?: string;
  meetLink?: string;
  calendarLink: string;
  originalPrompt?: string;
  creator: {
    name: string;
    email: string;
  };
  participants: string[];
  additionalHtml?: string;  // For signup prompts and other custom content
}

export class EmailService {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    if (!process.env.RESEND_FROM_EMAIL) {
      throw new Error('RESEND_FROM_EMAIL is not configured');
    }
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.RESEND_FROM_EMAIL;
  }

  private formatParticipantNames(participants: string[]): string {
    return participants.map(email => 
      email.split('@')[0].split('.').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join(' ')
    ).join(', ');
  }

  async sendMeetingConfirmation(details: MeetingDetails): Promise<void> {
    const participantNames = this.formatParticipantNames(details.participants);
    const creatorName = details.creator.name || details.creator.email.split('@')[0];

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #2DD4BF;">${details.type} with ${participantNames}</h2>
        
        <div style="margin: 20px 0; padding: 20px; background: #f8f8f8; border-radius: 8px;">
          ${details.originalPrompt ? `
            <p style="color: #666; font-style: italic;">"${details.originalPrompt}"</p>
          ` : ''}
          
          <div style="margin-top: 20px;">
            <p><strong>When:</strong> ${details.dateTime.toLocaleString('en-US', { 
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short'
            })}</p>
            <p><strong>Duration:</strong> ${details.duration}</p>
            <p><strong>Where:</strong> ${details.location}</p>
            <p><strong>Created by:</strong> ${creatorName}</p>
            <p><strong>Participants:</strong> ${participantNames}</p>
          </div>
        </div>

        <div style="margin: 20px 0;">
          <a href="${details.calendarLink}" 
             style="display: inline-block; background: #2DD4BF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 10px;">
            View in Calendar
          </a>
          ${details.location === 'Virtual' && details.meetLink ? `
            <a href="${details.meetLink}" 
               style="display: inline-block; background: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Join Google Meet
            </a>
          ` : ''}
        </div>

        <p style="color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
          You'll receive a separate calendar invitation that you can use to modify or decline if needed.
          ${details.location === 'Virtual' ? 'The calendar invite will include the official Google Meet link for joining the meeting.' : ''}
        </p>

        ${details.additionalHtml || ''}
      </div>
    `;

    try {
      // Send to all participants including the creator
      const emailPromises = details.participants.map(async (email) => {
        await this.resend.emails.send({
          from: `Meetini <${this.fromEmail}>`,
          to: email,
          subject: `${details.type} with ${participantNames}`,
          html: emailContent
        });
      });

      await Promise.all(emailPromises);
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      throw new Error('Failed to send meeting confirmation email');
    }
  }

  async sendMeetingCreatedConfirmation(details: MeetingDetails): Promise<void> {
    const participantNames = this.formatParticipantNames(details.participants.filter(p => p !== details.creator.email));

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #2DD4BF;">Meeting Created Successfully! 🎉</h2>
        
        <div style="margin: 20px 0; padding: 20px; background: #f8f8f8; border-radius: 8px;">
          <h3 style="margin: 0;">${details.type} with ${participantNames}</h3>
          
          ${details.originalPrompt ? `
            <p style="color: #666; font-style: italic; margin-top: 15px;">"${details.originalPrompt}"</p>
          ` : ''}
          
          <div style="margin-top: 20px;">
            <p><strong>When:</strong> ${details.dateTime.toLocaleString('en-US', { 
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short'
            })}</p>
            <p><strong>Duration:</strong> ${details.duration}</p>
            <p><strong>Where:</strong> ${details.location}</p>
            <p><strong>Participants:</strong> ${participantNames}</p>
          </div>
        </div>

        <div style="margin: 20px 0;">
          <a href="${details.calendarLink}" 
             style="display: inline-block; background: #2DD4BF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 10px;">
            Manage Event
          </a>
        </div>

        <p style="color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
          Your participants will receive a calendar invitation and a branded confirmation email with all the details.
        </p>

        ${details.additionalHtml || ''}
      </div>
    `;

    try {
      await this.resend.emails.send({
        from: `Meetini <${this.fromEmail}>`,
        to: details.creator.email,
        subject: `Meeting Created: ${details.type} with ${participantNames}`,
        html: emailContent,
        replyTo: details.creator.email
      });
    } catch (error) {
      console.error('Failed to send creator confirmation:', error);
      throw new Error('Failed to send meeting creation confirmation');
    }
  }
}
