import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only handle API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    console.log(`[Middleware] ${request.method} ${request.nextUrl.pathname}`);
  }
  return NextResponse.next();
}

// Explicitly define which routes this middleware applies to
export const config = {
  matcher: ['/api/:path*']
}; 