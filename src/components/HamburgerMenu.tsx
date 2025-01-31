import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  const menuItems = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Meeting Preferences', href: '/settings' },
    { name: 'FAQ', href: '/faq' },
  ];

  const isActive = (path: string) => router.pathname === path;

  const handleSignOut = async () => {
    await signOut({ redirect: true, callbackUrl: '/' });
  };

  const handleSignIn = () => {
    signIn('google', { callbackUrl: '/dashboard' });
  };

  const handleSignUp = () => {
    signIn('google', { callbackUrl: '/dashboard' });
  };

  const handleCreateMeeting = () => {
    setIsOpen(false); // Close the menu
    router.push('/dashboard?openCreateModal=true');
  };

  return (
    <div className="relative">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md text-[#14b8a6] hover:text-[#0d8276] focus:outline-none"
      >
        <span className="sr-only">Open menu</span>
        <svg
          className="h-16 w-16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Menu Items */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-black ring-1 ring-gray-700 ring-opacity-50">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`block px-4 py-3 text-base ${
                  isActive(item.href)
                    ? 'bg-gray-900 text-[#14b8a6]'
                    : 'text-gray-300 hover:bg-gray-900 hover:text-[#14b8a6]'
                }`}
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            {session && (
              <button
                onClick={handleCreateMeeting}
                className="w-full text-left px-4 py-3 text-base text-gray-300 hover:bg-gray-900 hover:text-[#14b8a6]"
                role="menuitem"
              >
                Create Meeting
              </button>
            )}
            <div className="border-t border-gray-700 mt-2 pt-2">
              {session ? (
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-3 text-base text-gray-300 hover:bg-gray-900 hover:text-[#14b8a6]"
                  role="menuitem"
                >
                  Sign Out
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSignIn}
                    className="w-full text-left px-4 py-3 text-base text-gray-300 hover:bg-gray-900 hover:text-[#14b8a6]"
                    role="menuitem"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={handleSignUp}
                    className="w-full text-left px-4 py-3 text-base text-[#14b8a6] hover:bg-gray-900 hover:text-[#0d8276] font-medium"
                    role="menuitem"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}