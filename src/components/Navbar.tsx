import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { handleBiometricAuth, isBiometricsAvailable } from '@/lib/biometrics';
import FaceIDSetup from './FaceIDSetup';
import Toast, { ToastType } from './Toast';

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showFaceIDSetup, setShowFaceIDSetup] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; type: ToastType; message: string }>({
    show: false,
    type: 'success',
    message: '',
  });

  const showToast = (type: ToastType, message: string) => {
    setToast({ show: true, type, message });
  };

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false });
      router.push('/');
      showToast('success', 'Successfully signed out');
    } catch (err) {
      showToast('error', 'Failed to sign out. Please try again.');
    }
  };

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      // Directly use Google sign in without Face ID check
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to sign in. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-black shadow-sm z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-24 py-2">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/logos/beta-logo.png"
                alt="Meetini Logo"
                width={200}
                height={200}
                className="w-auto h-auto"
                priority
              />
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/faq"
              className="text-white hover:text-gray-300 transition-colors font-medium"
            >
              FAQ
            </Link>

            {session ? (
              <div className="flex items-center space-x-4">
                <Link
                  href="/settings"
                  className="text-white hover:text-gray-300 transition-colors font-medium"
                >
                  Settings
                </Link>
                <button
                  onClick={() => setShowFaceIDSetup(true)}
                  className="text-white hover:text-gray-300 transition-colors font-medium"
                >
                  Set Up Face ID
                </button>
                <button
                  onClick={handleSignOut}
                  className="text-white hover:text-gray-300 transition-colors font-medium"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                disabled={isAuthenticating}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2" />
                    Authenticating...
                  </>
                ) : (
                  'Log In/Sign Up'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <FaceIDSetup
        isOpen={showFaceIDSetup}
        onClose={() => setShowFaceIDSetup(false)}
        onSuccess={() => {
          setShowFaceIDSetup(false);
          showToast('success', 'Face ID has been successfully set up!');
        }}
      />

      <Toast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </nav>
  );
} 