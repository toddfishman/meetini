import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (typeof window === 'undefined') {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
  } else {
    if (!global.prisma) {
      global.prisma = new PrismaClient({
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'info', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ],
      });

      // Add event listeners for detailed logging
      global.prisma.$on('query', (e: { query: string; duration: number }) => {
        console.log('Query:', {
          query: e.query,
          duration: `${e.duration}ms`,
          timestamp: new Date().toISOString()
        });
      });
    }
    prisma = global.prisma;
  }
} else {
  // Return a dummy client in the browser
  prisma = new Proxy({} as PrismaClient, {
    get() {
      throw new Error(
        'PrismaClient is unable to run in the browser. Please use API routes for database operations.'
      );
    },
  });
}

// Log database connection URL (without sensitive info)
const dbUrl = process.env.DATABASE_URL || '';
console.log('Database connection:', {
  host: dbUrl.split('@')[1]?.split('/')[0] || 'unknown',
  database: dbUrl.split('/').pop()?.split('?')[0] || 'unknown',
  ssl: dbUrl.includes('sslmode='),
  provider: 'postgresql'
});

// Test database connection on startup
if (process.env.NODE_ENV === 'production') {
  prisma.$connect()
    .then(() => {
      console.log('Successfully connected to database');
    })
    .catch((error: Error & { code?: string; meta?: unknown }) => {
      console.error('Failed to connect to database:', {
        error: error.message,
        code: error.code,
        meta: error.meta,
        timestamp: new Date().toISOString()
      });
    });
}

export { prisma };