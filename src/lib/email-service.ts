import { EmailTemplateData, emailTemplates } from './email-templates';
import { Resend } from 'resend';

interface EmailOptions {
  to: string | string[];
  template: keyof typeof emailTemplates;
  data: EmailTemplateData;
}

class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmail({ to, template, data }: EmailOptions) {
    const templateFn = emailTemplates[template];
    if (!templateFn) {
      throw new Error(`Template ${template} not found`);
    }

    const { subject, html } = templateFn(data);
    const toAddresses = Array.isArray(to) ? to : [to];

    try {
      await this.resend.emails.send({
        from: 'Meetini <notifications@meetini.ai>',
        to: toAddresses,
        subject,
        html,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendSupportAutoResponse(to: string) {
    return this.sendEmail({
      to,
      template: 'supportAutoResponse',
      data: {},
    });
  }

  async sendNonUserInvite(to: string, data: EmailTemplateData) {
    return this.sendEmail({
      to,
      template: 'nonUserInvite',
      data,
    });
  }

  async sendUserInvite(to: string | string[], data: EmailTemplateData) {
    return this.sendEmail({
      to,
      template: 'userInvite',
      data,
    });
  }

  async sendMeetiniConfirmation(to: string | string[], data: EmailTemplateData) {
    return this.sendEmail({
      to,
      template: 'meetiniConfirmation',
      data,
    });
  }

  async sendMixedUserInvite(to: string | string[], data: EmailTemplateData) {
    return this.sendEmail({
      to,
      template: 'mixedUserInvite',
      data,
    });
  }
}

export const emailService = new EmailService();
