import { formatDate } from '@/utils/date';

export interface EmailTemplateData {
  userName?: string;
  meetingTitle?: string;
  proposedTimes?: Date[];
  confirmationLink?: string;
  declineLink?: string;
  signupLink?: string;
  manualScheduleLink?: string;
}

export const emailTemplates = {
  supportAutoResponse: () => ({
    subject: 'We received your message - Meetini Support',
    html: `
      <h2>Thanks for reaching out!</h2>
      <p>We've received your email and we're on top of it! Please give us 24-48 hours to review and respond (but we'll shoot for much sooner!!)</p>
      <p>Best regards,<br>The Meetini Team</p>
    `
  }),

  nonUserInvite: (data: EmailTemplateData) => ({
    subject: `${data.userName} invited you to: ${data.meetingTitle}`,
    html: `
      <h2>You've been invited to a Meetini!</h2>
      <p>${data.userName} would like to schedule: ${data.meetingTitle}</p>
      
      <div style="margin: 20px 0;">
        <a href="${data.signupLink}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">
          Let Meetini Schedule It
        </a>
        
        <a href="${data.manualScheduleLink}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">
          Choose a Time
        </a>
        
        <a href="${data.declineLink}" style="display: inline-block; background: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Decline Invitation
        </a>
      </div>

      ${data.proposedTimes ? `
        <div style="margin-top: 20px;">
          <h3>Suggested Times:</h3>
          <ul>
            ${data.proposedTimes.map(time => 
              `<li>${formatDate(time)}</li>`
            ).join('')}
          </ul>
        </div>
      ` : ''}
    `
  }),

  userInvite: (data: EmailTemplateData) => ({
    subject: `New Meetini: ${data.meetingTitle}`,
    html: `
      <h2>New Meetini Request</h2>
      <p>${data.userName} would like to schedule: ${data.meetingTitle}</p>
      
      <div style="margin: 20px 0;">
        <a href="${data.confirmationLink}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">
          Confirm Meetini
        </a>
        
        <a href="${data.declineLink}" style="display: inline-block; background: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Decline
        </a>
      </div>
    `
  }),

  meetiniConfirmation: (data: EmailTemplateData) => ({
    subject: `Confirmed: ${data.meetingTitle}`,
    html: `
      <h2>Your Meetini is confirmed!</h2>
      <p>Everyone has confirmed the meetini: ${data.meetingTitle}</p>
      <p>The event has been added to your calendar.</p>
    `
  }),

  mixedUserInvite: (data: EmailTemplateData) => ({
    subject: `Pending Meetini: ${data.meetingTitle}`,
    html: `
      <h2>Meetini in Progress</h2>
      <p>Your meetini "${data.meetingTitle}" is being scheduled. We're waiting for responses from some participants who aren't Meetini users yet.</p>
      <p>We'll send a confirmation email once everyone has responded.</p>
    `
  })
};
