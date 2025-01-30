import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { Resend } from 'resend';

// Use Node.js runtime instead of Edge
export const runtime = 'nodejs';

export async function POST() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Initialize Resend with error checking
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Resend API key is not configured' }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Attempt to send email with custom domain
    const data = await resend.emails.send({
      from: 'Meetini <notifications@meetini.app>',
      to: session.user.email,
      subject: 'Test Email from Meetini',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #14b8a6;">Test Email from Meetini</h1>
          <p>This is a test email from your Meetini application.</p>
          <p style="color: #10b981;">If you're receiving this, your email configuration is working correctly!</p>
          <p><strong>Sent to:</strong> ${session.user.email}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 14px;">This is an automated test email. No action is required.</p>
        </div>
      `,
      tags: [{ name: 'test_email', value: 'true' }]
    });

    return NextResponse.json({ 
      message: 'Test email sent successfully',
      email: session.user.email,
      resendResponse: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json({
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorObject: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }, { status: 500 });
  }
} 
