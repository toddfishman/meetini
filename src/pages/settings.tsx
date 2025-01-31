import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import CalendarSettings from '../components/CalendarSettings';
import MeetingPreferencesForm from '../components/MeetingPreferencesForm';

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32">
        <div className="space-y-12">
          <div>
            <h1 className="text-3xl font-bold text-white">Meeting Preferences</h1>
            <p className="mt-2 text-gray-400">
              Customize how Meetini schedules your meetings and handles your availability.
            </p>
          </div>

          <div className="space-y-12">
            {/* Calendar Integration Section */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Calendar Integration</h2>
              <div className="bg-gray-900 rounded-lg p-6">
                <CalendarSettings />
              </div>
            </section>

            {/* Meeting Preferences Section */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Meeting Preferences</h2>
              <div className="bg-gray-900 rounded-lg p-6">
                <MeetingPreferencesForm />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
} 