import { useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignInOut = async () => {
    if (session) {
      await signOut({ redirect: false });
      router.push('/');
    } else {
      await signIn('google', { callbackUrl: '/dashboard' });
    }
    setIsOpen(false);
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    setIsOpen(false);
  };

  const handleSocialLink = (url: string) => {
    window.open(url, '_blank');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 focus:outline-none"
        aria-label="Menu"
      >
        <div className="space-y-2.5">
          <span className={`block w-10 h-1 bg-teal-500 transition-transform duration-300 ${isOpen ? 'rotate-45 translate-y-3' : ''}`}></span>
          <span className={`block w-10 h-1 bg-teal-500 transition-opacity duration-300 ${isOpen ? 'opacity-0' : ''}`}></span>
          <span className={`block w-10 h-1 bg-teal-500 transition-transform duration-300 ${isOpen ? '-rotate-45 -translate-y-3' : ''}`}></span>
        </div>
      </button>

      {/* Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Menu Content */}
      <div
        className={`fixed right-0 top-0 h-full w-64 bg-black border-l border-gray-800 transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col p-4 space-y-4">
          <button
            onClick={() => setIsOpen(false)}
            className="self-end text-gray-400 hover:text-white p-2"
          >
            ×
          </button>
          
          <button
            onClick={() => handleNavigation(session ? '/dashboard' : '/')}
            className="text-white hover:text-teal-500 text-left py-2"
          >
            Home
          </button>
          
          <button
            onClick={() => handleNavigation('/faq')}
            className="text-white hover:text-teal-500 text-left py-2"
          >
            FAQ
          </button>
          
          <button
            onClick={() => handleNavigation('/contact')}
            className="text-white hover:text-teal-500 text-left py-2"
          >
            Contact Us
          </button>

          <div className="py-2">
            <div className="text-gray-400 text-sm mb-2">Social</div>
            <div className="space-y-2 pl-2">
              <button
                onClick={() => handleSocialLink('https://instagram.com/meetiniapp')}
                className="text-white hover:text-teal-500 text-left py-1 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </button>
              <button
                onClick={() => handleSocialLink('https://twitter.com/meetiniapp')}
                className="text-white hover:text-teal-500 text-left py-1 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
                Twitter
              </button>
            </div>
          </div>
          
          {session && (
            <button
              onClick={() => handleNavigation('/settings')}
              className="text-white hover:text-teal-500 text-left py-2"
            >
              Settings
            </button>
          )}
          
          <button
            onClick={handleSignInOut}
            className="text-white hover:text-teal-500 text-left py-2 flex items-center gap-2"
          >
            {session ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 