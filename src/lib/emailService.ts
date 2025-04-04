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
  to?: string;  // Optional recipient email
}

export class EmailService {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      throw new Error('Missing required environment variables: RESEND_API_KEY and/or RESEND_FROM_EMAIL');
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.RESEND_FROM_EMAIL;
    
    console.log('EmailService initialized with Resend configuration');
  }

  private formatParticipantNames(participants: string[]): string {
    return participants.map(email => 
      email.split('@')[0].split('.').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join(' ')
    ).join(', ');
  }

  async sendMeetingConfirmation(details: MeetingDetails & { to: string, additionalHtml?: string }) {
    try {
      const { 
        title, 
        type, 
        dateTime, 
        duration, 
        location, 
        description, 
        meetLink, 
        calendarLink, 
        originalPrompt, 
        creator, 
        participants, 
        additionalHtml,
        to
      } = details;

      const participantNames = this.formatParticipantNames(participants);
      const creatorName = creator.name || creator.email.split('@')[0];

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #2DD4BF;">${type} with ${participantNames}</h2>
          
          <div style="margin: 20px 0; padding: 20px; background: #f8f8f8; border-radius: 8px;">
            ${originalPrompt ? `
              <p style="color: #666; font-style: italic;">"${originalPrompt}"</p>
            ` : ''}
            
            <div style="margin-top: 20px;">
              <p><strong>When:</strong> ${dateTime.toLocaleString('en-US', { 
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
              })}</p>
              <p><strong>Duration:</strong> ${duration}</p>
              <p><strong>Where:</strong> ${location}</p>
              <p><strong>Created by:</strong> ${creatorName}</p>
              <p><strong>Participants:</strong> ${participantNames}</p>
            </div>
          </div>

          <div style="margin: 20px 0;">
            <a href="${calendarLink}" 
               style="display: inline-block; background: #2DD4BF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 10px;">
              View in Calendar
            </a>
            ${location === 'Virtual' && meetLink ? `
              <a href="${meetLink}" 
                 style="display: inline-block; background: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Join Google Meet
              </a>
            ` : ''}
          </div>

          <p style="color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
            You'll receive a separate calendar invitation that you can use to modify or decline if needed.
            ${location === 'Virtual' ? 'The calendar invite will include the official Google Meet link for joining the meeting.' : ''}
          </p>

          ${additionalHtml || ''}
        </div>
      `;

      await this.resend.emails.send({
        from: `Meetini <${this.fromEmail}>`,
        to: [to],
        subject: `${type} with ${participantNames}`,
        html: emailContent
      });
    } catch (error) {
      console.error(`Failed to send meeting confirmation email to ${details.to}:`, error);
      throw error;
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

  async sendUnregisteredParticipantInvite(details: MeetingDetails & { 
    to: string, 
    additionalHtml?: string, 
    suggestedTimes?: string[],
    inviteId: string 
  }) {
    try {
      const { 
        title, 
        creator, 
        dateTime, 
        duration, 
        to, 
        meetLink, 
        additionalHtml, 
        suggestedTimes,
        inviteId
      } = details;

      // Format suggested times nicely
      const formattedTimes = suggestedTimes?.map(time => {
        const date = new Date(time);
        return date.toLocaleString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      });

      const timesHtml = formattedTimes?.length ? `
        <div style="margin-top: 15px;">
          <h4 style="margin-bottom: 10px;">Suggested Times:</h4>
          <ul style="padding-left: 20px;">
            ${formattedTimes.map(time => `<li>${time}</li>`).join('')}
          </ul>
        </div>
      ` : '';

      const subject = `📅 Meeting Invitation: ${title}`;

      const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #2563EB; margin-bottom: 20px;">You've Been Invited to a Meeting</h2>
          
          <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #2563EB;">
            <h3 style="margin-top: 0; color: #1e40af;">${title}</h3>
            <p><strong>Organizer:</strong> ${creator.name} (${creator.email})</p>
            <p><strong>When:</strong> ${dateTime.toLocaleString()}</p>
            <p><strong>Duration:</strong> ${duration}</p>
            ${meetLink ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}" target="_blank">Join Meeting</a></p>` : ''}
            ${timesHtml}
          </div>
          
          ${additionalHtml || ''}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
            <p>This invitation was sent via <a href="https://meetini.ai" style="color: #2563EB; text-decoration: none;">Meetini</a>.</p>
            <p>To stop receiving these emails, please contact the meeting organizer.</p>
          </div>
        </div>
      `;

      const text = `
        Meeting Invitation: ${title}
        
        Organizer: ${creator.name} (${creator.email})
        When: ${dateTime.toLocaleString()}
        Duration: ${duration}
        ${meetLink ? `Meeting Link: ${meetLink}` : ''}
        
        View and respond to this invitation at: https://meetini.ai/confirm-time?email=${encodeURIComponent(to)}&invite=${inviteId}
        
        This invitation was sent via Meetini.
      `;

      const result = await this.resend.emails.send({
        from: 'Meetini <invites@meetini.ai>',
        to: [details.to],
        subject,
        html,
        text,
        replyTo: creator.email
      });

      return result;
    } catch (error) {
      console.error(`Failed to send invitation email to unregistered participant ${details.to}:`, error);
      throw error;
    }
  }

  async sendDeclinedNotification(details: {
    title: string;
    inviteId: string;
    participantEmail: string;
    creatorEmail: string;
    suggestedAlternatives: boolean;
    message: string;
  }) {
    try {
      const { title, inviteId, participantEmail, creatorEmail, suggestedAlternatives, message } = details;

      const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #e11d48; margin-bottom: 20px;">Meeting Time Not Confirmed</h2>
          
          <div style="background-color: #fef2f2; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #e11d48;">
            <h3 style="margin-top: 0; color: #b91c1c;">${title}</h3>
            <p><strong>${participantEmail}</strong> cannot make the proposed time.</p>
            ${suggestedAlternatives ? `
              <p>${message}</p>
              <p>Please consider rescheduling or choosing a different time.</p>
            ` : `
              <p>No alternative time was suggested.</p>
            `}
          </div>
          
          <div style="margin-top: 20px;">
            <a href="https://meetini.ai/meetini/${inviteId}" 
              style="background-color: #2563EB; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; display: inline-block;">
              View Meeting Details
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
            <p>This notification was sent via <a href="https://meetini.ai" style="color: #2563EB; text-decoration: none;">Meetini</a>.</p>
          </div>
        </div>
      `;

      const text = `
        Meeting Time Not Confirmed: ${title}
        
        ${participantEmail} cannot make the proposed time.
        ${message}
        
        Please consider rescheduling or choosing a different time.
        
        View meeting details at: https://meetini.ai/meetini/${inviteId}
        
        This notification was sent via Meetini.
      `;

      const result = await this.resend.emails.send({
        from: 'Meetini <notifications@meetini.ai>',
        to: [creatorEmail],
        subject: `📅 Meeting Response: ${participantEmail} declined "${title}"`,
        html,
        text
      });

      return result;
    } catch (error) {
      console.error(`Failed to send declined notification to creator:`, error);
      throw error;
    }
  }
}
