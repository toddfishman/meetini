import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-green-500">Loading...</div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  const handleSignIn = async () => {
    await signIn("google", {
      callbackUrl: `/dashboard`,
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
  };

  return (
    <div className="bg-black text-foreground min-h-screen font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col items-center justify-center py-4">
            <Link href="/" className="flex items-center p-4 rounded-full hover:bg-gray-800/50 transition-colors">
              <Image
                src="/meetini_martini.jpeg"
                alt="Meetini"
                width={160}
                height={160}
                className="w-auto h-40 rounded-full logo-glow"
              />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="pt-64 pb-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              It's YOUR Calendar.<br />
              It Should Not Be YOUR Job.
            </h1>
            <h2 className="text-2xl md:text-3xl text-gray-300 mb-4">
              Coordinate Multiple Schedules Using Meetini.AI
            </h2>
            <h3 className="text-xl md:text-2xl text-green-500">
              Automated Scheduling That Works.
            </h3>
          </div>
          
          {/* Auth Buttons */}
          <div className="auth-buttons mb-16">
            <Link
              href="/signin.html"
              className="inline-flex items-center justify-center px-6 py-3 bg-green-500 hover:bg-green-600 text-white text-base font-medium rounded-md transition-colors mb-4 w-full max-w-md mx-auto"
            >
              Sign In / Create Account
            </Link>
            <div className="text-gray-500 mb-4">or</div>
            <button
              onClick={handleSignIn}
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 rounded-md transition-colors w-full max-w-md mx-auto hover:bg-gray-100"
            >
              <img
                src="https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png"
                alt="Google"
                className="w-5 h-5 mr-3"
              />
              Continue with Google
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Smart Scheduling</h3>
            <p className="text-gray-400">Just tell us what kind of meeting you want, and we'll handle the rest. From coffee chats to team meetings, Meetini makes it effortless.</p>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Venue Finder</h3>
            <p className="text-gray-400">Our intelligent system finds the perfect meeting spot based on everyone's location and preferences.</p>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Calendar Integration</h3>
            <p className="text-gray-400">Seamlessly integrates with Google Calendar to check availability and send beautiful, branded meeting invites.</p>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Group Text Integration</h3>
            <p className="text-gray-400">Plan meetings right from your group chat with @meetini commands. Quick, simple, and accessible for everyone.</p>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Smart Participant Management</h3>
            <p className="text-gray-400">Automatically suggests relevant participants based on meeting context and your interaction history.</p>
          </div>
          
          <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-lg border border-gray-800 hover:border-green-500/50 transition-all hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-green-500 mb-3">Beautiful Notifications</h3>
            <p className="text-gray-400">Receive professionally formatted email notifications with all meeting details and calendar links.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-center items-center space-x-6">
            <Link href="/privacy" className="text-green-500 hover:text-green-400 transition-colors text-sm font-medium">Privacy Policy</Link>
            <span className="text-gray-700 text-xs">•</span>
            <Link href="/support" className="text-green-500 hover:text-green-400 transition-colors text-sm font-medium">Contact Us</Link>
            <span className="text-gray-700 text-xs">•</span>
            <Link href="/faq" className="text-green-500 hover:text-green-400 transition-colors text-sm font-medium">FAQ</Link>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        .logo-glow {
          filter: drop-shadow(0 0 6px rgba(52, 199, 89, 0.2));
          transition: filter 0.3s ease;
        }
        .logo-glow:hover {
          filter: drop-shadow(0 0 8px rgba(52, 199, 89, 0.4));
        }
      `}</style>
    </div>
  );
}
