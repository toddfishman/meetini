import React from 'react';
import Link from 'next/link';

export default function Custom404() {
  return (
    <div className="min-h-screen bg-[#1a1d23] text-white flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-gray-400 mb-8">The page you're looking for doesn't exist.</p>
      <Link href="/" className="text-[#22c55e] hover:text-[#22c55e]/80">
        Return to Dashboard
      </Link>
    </div>
  );
}