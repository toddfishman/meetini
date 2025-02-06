import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test database connection
    await prisma.$connect();
    
    // Try a simple query
    const count = await prisma.invitation.count();
    
    // Get database connection info
    const dbUrl = process.env.DATABASE_URL || '';
    const connectionInfo = {
      host: dbUrl.split('@')[1]?.split('/')[0] || 'unknown',
      database: dbUrl.split('/').pop()?.split('?')[0] || 'unknown',
      ssl: dbUrl.includes('sslmode='),
      provider: 'postgresql',
      invitationCount: count
    };

    return res.status(200).json({
      status: 'success',
      message: 'Database connection successful',
      connection: connectionInfo
    });
  } catch (error) {
    console.error('Database test error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await prisma.$disconnect();
  }
} 