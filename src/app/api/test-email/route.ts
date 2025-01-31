import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { Resend } from 'resend';

// Use Node.js runtime
export const runtime = 'nodejs';

export async function POST() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('Test email process started:', {
      userEmail: session.user.email,
      timestamp: new Date().toISOString()
    });

    // Initialize Resend with error checking
    if (!process.env.RESEND_API_KEY) {
      console.error('Resend API key is missing');
      return NextResponse.json({ error: 'Resend API key is not configured' }, { status: 500 });
    }

    console.log('Initializing Resend client');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Attempt to send test email
    console.log('Sending test email to:', session.user.email);
    const data = await resend.emails.send({
      from: 'Meetini <onboarding@resend.dev>',
      to: session.user.email,
      subject: 'Test Email from Meetini',
      html: `
        <div>
          <h1>Test Email</h1>
          <p>This is a test email from your Meetini application.</p>
          <p>If you're receiving this, your email configuration is working correctly!</p>
          <p>Sent to: ${session.user.email}</p>
          <p>Time: ${new Date().toISOString()}</p>
        </div>
      `,
      tags: [{ name: 'test_email', value: 'true' }]
    });

    console.log('Test email sent successfully:', {
      response: data,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      message: 'Test email sent successfully',
      email: session.user.email,
      resendResponse: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test email error:', {
      error,
      errorDetails: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : 'Unknown error'
    });
    
    return NextResponse.json({
      error: 'Failed to send test email',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorObject: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }, { status: 500 });
  }
} 
