import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { handleBiometricAuth, isBiometricsAvailable } from '@/lib/biometrics';
import FaceIDSetup from './FaceIDSetup';
import Toast, { ToastType } from './Toast';
import { FaTimes, FaBars } from 'react-icons/fa';

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
          <div className="flex items-center justify-between w-full">
            <Link href="/dashboard" className="flex items-center">
              <div className="relative">
                <Image
                  src="/images/meetini_martini.jpeg"
                  alt="Meetini Logo"
                  width={140}
                  height={140}
                  className="rounded-full shadow-lg hover:shadow-[#22c55e]/10 transition-shadow duration-200"
                  priority
                />
              </div>
            </Link>

            {/* Right side menu for larger screens */}
            <div className="hidden md:flex items-center space-x-4">
              {session?.user?.email && (
                <span className="text-sm text-gray-400">
                  {session.user.email}
                </span>
              )}
              <button
                onClick={() => signOut()}
                className="px-4 py-2 text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
              >
                Sign out
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-[#22c55e] hover:text-[#22c55e]/80 hover:bg-[#1a1d23] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:ring-opacity-50"
                aria-expanded={isMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {isMenuOpen ? (
                  <FaTimes className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <FaBars className="w-6 h-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-md shadow-lg bg-[#1a1d23] ring-1 ring-[#22c55e]/20 divide-y divide-gray-700">
            <div className="py-1">
              <Link
                href="/dashboard"
                className="block px-4 py-2 text-sm text-[#22c55e] hover:bg-[#2f3336] transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm text-[#22c55e] hover:bg-[#2f3336] transition-colors"
              >
                Settings
              </Link>
            </div>
            <div className="py-1">
              <button
                onClick={() => signOut()}
                className="block w-full text-left px-4 py-2 text-sm text-[#22c55e] hover:bg-[#2f3336] transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
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