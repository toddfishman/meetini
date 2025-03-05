import { Resend } from 'resend';
import twilio from 'twilio';
import { formatInTimeZone } from 'date-fns-tz';

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

  // Wait for all notifications to complete
  const results = await Promise.allSettled([...emailPromises, ...smsPromises]);
  
  // Check for any failures
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.error('Some notifications failed:', failures);
    // Don't throw error if at least one notification succeeded
    if (failures.length === results.length) {
      throw new Error('Failed to send notifications');
    }
  }
}

async function sendEmail(
  recipient: NotificationRecipient,
  data: NotificationData
): Promise<void> {
  console.log('=== Email Sending Process Started ===');
  console.log('Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY_LENGTH: process.env.RESEND_API_KEY?.length,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL
  });
  
  if (!process.env.RESEND_API_KEY) {
    const error = new Error('Email notifications are disabled: Resend API key not configured');
    console.error(error);
    throw error; 
  }

  // Create a fresh Resend client for each email
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  try {
    if (!recipient.email) throw new Error('Email address is required');

    const subject = getEmailSubject(data);
    const html = generateEmailTemplate(recipient, data);

    // Generate ICS file content if we have date information
    let attachments = [];
    if (data.proposedTimes && data.proposedTimes.length > 0) {
      const startTime = new Date(data.proposedTimes[0]);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration
      
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meetini//Calendar//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${data.invitationId || Math.random().toString(36).substring(2, 15)}
DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').replace(/\d{3}Z$/, 'Z')}
DTSTART:${startTime.toISOString().replace(/[-:.]/g, '').replace(/\d{3}Z$/, 'Z')}
DTEND:${endTime.toISOString().replace(/[-:.]/g, '').replace(/\d{3}Z$/, 'Z')}
SUMMARY:${data.title}
${data.location ? `LOCATION:${data.location}` : ''}
ORGANIZER;CN=${data.creatorName || 'Meetini'}:mailto:${data.creatorEmail || process.env.RESEND_FROM_EMAIL || 'notifications@meetini.ai'}
ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${recipient.email}
END:VEVENT
END:VCALENDAR`;

      attachments.push({
        filename: 'invite.ics',
        content: Buffer.from(icsContent).toString('base64'),
        type: 'application/ics'
      });
    }

    const emailPayload = {
      from: process.env.RESEND_FROM_EMAIL || 'Meetini <notifications@meetini.ai>',
      to: recipient.email,
      subject,
      html,
      attachments
    };

    console.log('Preparing to send email via Resend:', {
      ...emailPayload,
      htmlLength: html.length,
      recipientDetails: {
        name: recipient.name,
        notifyByEmail: recipient.notifyByEmail
      },
      notificationData: {
        type: data.type,
        title: data.title,
        hasActionUrl: !!data.actionUrl,
        hasLocation: !!data.location,
        hasCalendarAttachment: attachments.length > 0
      }
    });

    const result = await resend.emails.send(emailPayload);
    
    console.log('Resend API Response:', {
      result,
      timestamp: new Date().toISOString()
    });

    if (!result?.id) {
      throw new Error('Failed to send email - no confirmation ID received');
    }

    console.log('Email sent successfully to:', recipient.email);
  } catch (error) {
    console.error('Failed to send email:', {
      error,
      recipient: recipient.email,
      errorDetails: {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    throw error; 
  } finally {
    console.log('=== Email Sending Process Completed ===');
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
  const greeting = recipient.name ? `Hi ${recipient.name}!` : 'Hi there!';
  
  let content = '';
  switch (data.type) {
    case 'invitation':
      if (data.creatorEmail) {
        // AI-powered invitation template
        content = `
          <div style="font-size: 16px; line-height: 1.6;">
            <p>${data.creatorName || data.creatorEmail} is inviting you to get some time together for: <strong>${data.title}</strong></p>
            
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin-top: 0;"><strong>🪄 Let Meetini do the work!</strong></p>
              <p>We can find the perfect time that works for everyone automatically - no back-and-forth needed! Here's how:</p>
              
              <div style="display: flex; gap: 16px; margin: 24px 0;">
                <a href="${process.env.NEXTAUTH_URL}/calendar/connect" style="
                  background-color: #14b8a6;
                  color: white;
                  padding: 12px 24px;
                  text-decoration: none;
                  border-radius: 6px;
                  text-align: center;
                  flex: 1;
                ">
                  ✨ Let Meetini Schedule It
                </a>
              </div>
              
              <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
                By clicking this button, you'll be asked to securely connect your calendar. 
                We'll then find the perfect time that works for everyone!
              </p>
            </div>

            <p><strong>Prefer to choose manually?</strong> No problem! You can also:</p>
            
            <div style="display: flex; gap: 16px; margin: 24px 0;">
              <a href="${data.actionUrl}?response=accept" style="
                background-color: #22c55e;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                text-align: center;
                flex: 1;
              ">
                👍 Yes, I'm Interested
              </a>
              
              <a href="${data.actionUrl}?response=decline" style="
                background-color: #ef4444;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                text-align: center;
                flex: 1;
              ">
                👎 No, Thanks
              </a>
            </div>

            ${data.proposedTimes && data.proposedTimes.length > 0 ? `
              <div style="margin-top: 24px;">
                <p><strong>Suggested Time:</strong></p>
                <p style="color: #4b5563;">${new Date(data.proposedTimes[0]).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                  timeZoneName: 'short'
                })}</p>
              </div>
            ` : ''}

            ${data.location ? `
              <div style="margin-top: 16px;">
                <p><strong>Suggested Location:</strong></p>
                <p style="color: #4b5563;">${data.location}</p>
              </div>
            ` : ''}
          </div>
          
          <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
            A calendar invitation is attached to this email. You can add it to your calendar, but don't worry - 
            it can be updated later once everyone's availability is confirmed.
          </p>
        `;
      } else {
        // Original template for non-AI invitations
        const dateStr = data.proposedTimes && data.proposedTimes.length > 0
          ? new Date(data.proposedTimes[0]).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              timeZoneName: 'short'
            })
          : '';

        content = `
          <p>You've been invited to: <strong>${data.title}</strong></p>
          ${data.description ? `<p>${data.description}</p>` : ''}
          ${dateStr ? `<p><strong>When:</strong> ${dateStr}</p>` : ''}
          ${data.location ? `<p><strong>Where:</strong> ${data.location}</p>` : ''}
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
          <p style="margin-top: 16px; color: #6b7280;">
            A calendar invitation has been attached to this email. You can add it to your calendar by opening the attachment.
          </p>
        `;
      }
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
          <p style="color: #374151; font-size: 18px;">${greeting}</p>
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

export async function sendEmailNotification(to: string, subject: string, content: string) {
  if (!process.env.RESEND_API_KEY) {
    const error = new Error('Email notifications are disabled: Resend API key not configured');
    console.error(error);
    throw error; 
  }
  
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Meetini <notifications@meetini.ai>',
      to,
      subject,
      html: content,
    });
  } catch (error) {
    console.error('Failed to send email notification:', error);
    throw error; 
  }
} 