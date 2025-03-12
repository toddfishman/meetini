import { google } from 'googleapis';
import { formatDate, titleCase } from './utils';

interface EmailOptions {
  to: string[];
  subject: string;
  body: string;
  from?: string;
}

interface MeetingDetails {
  title: string;
  dateTime: string;
  duration: number;
  description?: string;
  meetLink?: string;
  eventLink: string;  
  organizer: string;
  originalPrompt?: string;
}

export class EmailService {
  private static async getGmailClient(token: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  private static createEmailContent(options: EmailOptions): string {
    const { to, subject, body, from } = options;
    const emailLines = [
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      `To: ${to.join(', ')}`,
      `From: ${from || 'Meetini <noreply@meetini.app>'}`,
      `Subject: ${subject}`,
      '',
      body
    ];

    return Buffer.from(emailLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  static async sendMeetingConfirmation(
    participants: string[],
    details: MeetingDetails,
    token: string
  ): Promise<void> {
    const gmail = await this.getGmailClient(token);
    const organizerName = titleCase(details.organizer.split('@')[0]);

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2DD4BF;">Meeting Created! 🎉</h2>
        
        <div style="background-color: #1F2937; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0; color: white;">${details.title}</h3>
          <p style="font-size: 18px; margin: 10px 0 0 0;">
            📅 ${formatDate(new Date(details.dateTime))}
          </p>
          <p style="color: #9CA3AF; margin: 10px 0 0 0;">
            Duration: ${details.duration} minutes
          </p>
        </div>

        ${details.originalPrompt ? `
          <div style="margin: 20px 0; color: #4B5563;">
            <h3 style="color: #111827;">Original Request</h3>
            <p style="font-style: italic;">"${details.originalPrompt}"</p>
          </div>
        ` : ''}

        <div style="margin: 20px 0;">
          <p style="margin: 5px 0;">
            <strong>Created by:</strong> ${organizerName}
          </p>
          <p style="margin: 5px 0;">
            <strong>Participants:</strong> ${participants.map(p => titleCase(p.split('@')[0])).join(', ')}
          </p>
        </div>

        <div style="margin: 20px 0;">
          <a href="${details.eventLink}" 
             style="background-color: #2DD4BF; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 4px; display: inline-block;">
            View in Calendar
          </a>
          ${details.meetLink ? `
            <p style="margin-top: 10px;">
              <a href="${details.meetLink}" style="color: #2DD4BF;">
                Join Google Meet
              </a>
            </p>
          ` : ''}
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; 
                    color: #6B7280; font-size: 14px;">
          <p>
            This meeting was created via Meetini. Check your calendar for the official invite!
          </p>
        </div>
      </div>
    `;

    const emailOptions: EmailOptions = {
      to: participants,
      subject: `Meetini Created: ${details.title}`,
      body: emailBody
    };

    const email = this.createEmailContent(emailOptions);

    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: email
        }
      });
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      throw new Error('Failed to send meeting confirmation email');
    }
  }
}
