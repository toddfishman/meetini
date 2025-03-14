import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';

export default function AuthError() {
  const router = useRouter();
  const { error } = router.query;

  useEffect(() => {
    // If there's a token error, redirect to sign in
    if (error === 'RefreshAccessTokenError') {
      signIn('google', { callbackUrl: '/dashboard' });
    } else {
      // For other errors, redirect to home after a short delay
      const timer = setTimeout(() => {
        router.push('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <h2 className="mt-6 text-3xl font-bold text-white">
          Authentication Error
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {error === 'RefreshAccessTokenError'
            ? 'Your session has expired. Redirecting you to sign in...'
            : 'There was an error with authentication. Redirecting you home...'}
        </p>
      </div>
    </div>
  );
}
