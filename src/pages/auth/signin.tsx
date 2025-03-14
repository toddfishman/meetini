import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Image from 'next/image';

export default function SignIn() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { callbackUrl, error } = router.query;

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (session) {
      router.replace('/dashboard', undefined);
    }
  }, [session, router]);

  // Clean up URL if there's an error
  useEffect(() => {
    if (router.asPath !== router.pathname && error) {
      const newQuery = { ...router.query };
      // Keep only error and callbackUrl params
      Object.keys(newQuery).forEach(key => {
        if (key !== 'error' && key !== 'callbackUrl') {
          delete newQuery[key];
        }
      });
      router.replace({
        pathname: router.pathname,
        query: newQuery
      }, undefined, { shallow: true });
    }
  }, [router, error]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  const handleSignIn = async () => {
    try {
      await signIn('google', { 
        callbackUrl: '/dashboard',
        scope: [
          'openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/contacts.readonly'
        ].join(' ')
      });
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Image
            src="/logos/beta-logo.png"
            alt="Meetini"
            width={200}
            height={200}
            className="mx-auto"
            priority
          />
          <h2 className="mt-6 text-3xl font-bold text-white">
            Welcome to Meetini
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Sign in to start scheduling meetings effortlessly
          </p>
          {error === 'access_denied' && (
            <p className="mt-2 text-sm text-red-500">
              You need to grant access to your Google account to use Meetini
            </p>
          )}
        </div>

        <div className="mt-8">
          <button
            onClick={handleSignIn}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
