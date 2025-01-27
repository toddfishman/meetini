import { Resend } from 'resend';
import twilio from 'twilio';
import { formatInTimeZone } from 'date-fns-tz';

const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Twilio client only if credentials are available
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

interface NotificationRecipient {
  email?: string;
  phoneNumber?: string;
  name?: string;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

interface NotificationData {
  type: 'invitation' | 'reminder' | 'update';
  title: string;
  description?: string;
  date?: string;
  location?: string;
  actionUrl?: string;
  invitationId?: string;
  creatorName?: string;
  creatorEmail?: string;
  proposedTimes?: string[];
}

export async function sendNotifications(
  recipients: NotificationRecipient[],
  data: NotificationData
): Promise<void> {
  const emailPromises = recipients
    .filter(r => r.notifyByEmail && r.email)
    .map(recipient => sendEmail(recipient, data));

  const smsPromises = recipients
    .filter(r => r.notifyBySms && r.phoneNumber)
    .map(recipient => sendSMS(recipient, data));

  try {
    await Promise.all([...emailPromises, ...smsPromises]);
  } catch (error) {
    console.error('Failed to send notifications:', error);
    throw error;
  }
}

async function sendEmail(
  recipient: NotificationRecipient,
  data: NotificationData
): Promise<void> {
  try {
    if (!recipient.email) throw new Error('Email address is required');

    const subject = getEmailSubject(data);
    const html = generateEmailTemplate(recipient, data);

    await resend.emails.send({
      from: 'Meetini <notifications@meetini.app>',
      to: recipient.email,
      subject,
      html,
    });
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

async function sendSMS(
  recipient: NotificationRecipient,
  data: NotificationData
): Promise<void> {
  try {
    if (!recipient.phoneNumber) throw new Error('Phone number is required');
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('SMS notifications are disabled - Twilio credentials not configured');
      return;
    }

    const message = generateSMSTemplate(recipient, data);

    await twilioClient.messages.create({
      body: message,
      to: recipient.phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  } catch (error) {
    console.error('Failed to send SMS:', error);
    // Don't throw error for SMS failures
  }
}

function getEmailSubject(data: NotificationData): string {
  switch (data.type) {
    case 'invitation':
      return `New Meetini Invitation: ${data.title}`;
    case 'reminder':
      return `Reminder: ${data.title}`;
    case 'update':
      return `Update: ${data.title}`;
    default:
      return data.title;
  }
}

function generateEmailTemplate(
  recipient: NotificationRecipient,
  data: NotificationData
): string {
  const greeting = recipient.name ? `Hi ${recipient.name},` : 'Hi there,';
  
  let content = '';
  switch (data.type) {
    case 'invitation':
      content = `
        <p>You've been invited to: <strong>${data.title}</strong></p>
        ${data.description ? `<p>${data.description}</p>` : ''}
        ${data.date ? `<p>When: ${data.date}</p>` : ''}
        ${data.location ? `<p>Where: ${data.location}</p>` : ''}
        ${data.actionUrl ? `
          <p style="margin: 24px 0;">
            <a href="${data.actionUrl}" style="
              background-color: #14b8a6;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
            ">
              Respond to Invitation
            </a>
          </p>
        ` : ''}
      `;
      break;
    case 'reminder':
      content = `
        <p>This is a reminder for: <strong>${data.title}</strong></p>
        ${data.description ? `<p>${data.description}</p>` : ''}
        ${data.date ? `<p>When: ${data.date}</p>` : ''}
        ${data.location ? `<p>Where: ${data.location}</p>` : ''}
      `;
      break;
    case 'update':
      content = `
        <p>There's been an update to: <strong>${data.title}</strong></p>
        ${data.description ? `<p>${data.description}</p>` : ''}
        ${data.actionUrl ? `
          <p style="margin: 24px 0;">
            <a href="${data.actionUrl}" style="
              background-color: #14b8a6;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
            ">
              View Details
            </a>
          </p>
        ` : ''}
      `;
      break;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f3f4f6;
      ">
        <div style="
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
          background-color: white;
          border-radius: 8px;
          margin-top: 24px;
        ">
          <img src="https://meetini.app/logos/logo-with-words.png" alt="Meetini" style="width: 120px; margin-bottom: 24px;">
          <p style="color: #374151;">${greeting}</p>
          ${content}
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This email was sent by Meetini. If you don't want to receive these emails, you can
            <a href="https://meetini.app/settings/notifications" style="color: #14b8a6;">update your notification preferences</a>.
          </p>
        </div>
      </body>
    </html>
  `;
}

function generateSMSTemplate(
  recipient: NotificationRecipient,
  data: NotificationData
): string {
  const greeting = recipient.name ? `Hi ${recipient.name}! ` : '';
  
  switch (data.type) {
    case 'invitation':
      return `${greeting}You've been invited to: ${data.title}${
        data.date ? `\nWhen: ${data.date}` : ''
      }${
        data.location ? `\nWhere: ${data.location}` : ''
      }${
        data.actionUrl ? `\nRespond here: ${data.actionUrl}` : ''
      }`;
    
    case 'reminder':
      return `${greeting}Reminder: ${data.title}${
        data.date ? `\nWhen: ${data.date}` : ''
      }${
        data.location ? `\nWhere: ${data.location}` : ''
      }`;
    
    case 'update':
      return `${greeting}Update for ${data.title}: ${
        data.description || ''
      }${
        data.actionUrl ? `\nView details: ${data.actionUrl}` : ''
      }`;
    
    default:
      return `${greeting}${data.title}${
        data.description ? `\n${data.description}` : ''
      }`;
  }
} 