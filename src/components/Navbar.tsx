import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { handleBiometricAuth, isBiometricsAvailable } from '@/lib/biometrics';
import FaceIDSetup from './FaceIDSetup';
import Toast, { ToastType } from './Toast';
import HamburgerMenu from './HamburgerMenu';

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
    <nav className="fixed w-full bg-black shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-24 items-center">
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <Image
                src="/logos/beta-logo.png"
                alt="Meetini"
                width={200}
                height={200}
                className="w-auto h-auto"
                priority
              />
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {session ? (
              <>
                <HamburgerMenu />
                <button
                  onClick={() => signOut()}
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/api/auth/signin"
                className="text-sm text-gray-300 hover:text-white"
              >
                Sign In
              </Link>
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