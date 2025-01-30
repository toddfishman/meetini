import React from 'react';
import Link from 'next/link';

export default function Custom404() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
        <p className="text-gray-400 mb-4">We can&apos;t seem to find the page you&apos;re looking for.</p>
        <Link href="/" className="text-teal-500 hover:text-teal-400">
          Return Home
        </Link>
      </div>
    </div>
  );
} 