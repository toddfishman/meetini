import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import CalendarSettings from '../components/CalendarSettings';

export default function Settings() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  if (!session) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto pt-32 px-4">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">Calendar Settings</h2>
            <CalendarSettings />
          </section>
        </div>
      </div>
    </div>
  );
} 