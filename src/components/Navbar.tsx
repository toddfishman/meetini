import { useState, useEffect } from 'react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const showToast = (type: ToastType, message: string) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: 'success', message: '' }), 3000);
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
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

          <div className="flex items-center">
            {session ? (
              <div className="flex flex-col items-end pt-8">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="text-white hover:text-teal-500 transition-colors mb-3"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                <button
                  onClick={() => signOut()}
                  className="text-sm text-gray-300 hover:text-white mb-2"
                >
                  Sign Out
                </button>

                {session?.user?.email && (
                  <p className="text-sm text-gray-400">Logged in as: {session.user.email}</p>
                )}

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 top-24 mt-2 w-48 bg-gray-900 rounded-lg shadow-lg py-2 z-50">
                    <Link href="/dashboard">
                      <span className="block px-4 py-2 text-white hover:bg-gray-800 cursor-pointer">
                        Dashboard
                      </span>
                    </Link>
                    <Link href="/settings">
                      <span className="block px-4 py-2 text-white hover:bg-gray-800 cursor-pointer">
                        Meeting Preferences
                      </span>
                    </Link>
                  </div>
                )}
              </div>
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