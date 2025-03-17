import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { DateTime } from 'luxon';

export default function TestCalendar() {
  const { data: session } = useSession();
  const [status, setStatus] = useState('');
  const [eventDetails, setEventDetails] = useState<any>(null);

  const createTestEvent = async () => {
    try {
      setStatus('Creating event...');
      
      // Create a test event 30 minutes from now
      const startTime = DateTime.now().plus({ minutes: 30 });
      const endTime = startTime.plus({ minutes: 30 });

      const response = await fetch('/api/calendar/create-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: "Coffee Chat with Todd",
          description: "Quick catch-up scheduled via Meetini",
          start: {
            dateTime: startTime.toISO(),
          },
          end: {
            dateTime: endTime.toISO(),
          },
          attendees: [session?.user?.email].filter(Boolean).map(email => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: `meetini-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setStatus('Event created! Check your calendar.');
        setEventDetails(data);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus('Failed to create event');
      console.error(error);
    }
  };

  if (!session) {
    return <div className="p-8">Please sign in to test calendar events.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Test Calendar Integration</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <p className="text-gray-600 mb-6">
            This will create a test calendar event (Coffee Chat) with:
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>30-minute duration</li>
              <li>Google Meet link</li>
              <li>Starting 30 minutes from now</li>
              <li>You as the only attendee: {session.user?.email}</li>
            </ul>
          </p>
          
          <button 
            onClick={createTestEvent}
            className="bg-[#22c55e] hover:bg-[#22c55e]/80 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Create Test Event
          </button>
        </div>

        {status && (
          <div className={`rounded-md p-4 ${
            status.includes('Error') 
              ? 'bg-red-50 text-red-700' 
              : status.includes('created') 
                ? 'bg-green-50 text-green-700'
                : 'bg-blue-50 text-blue-700'
          }`}>
            <p className="font-medium">{status}</p>
            {eventDetails && (
              <div className="mt-4 space-y-2">
                <p>Event Link: <a href={eventDetails.htmlLink} target="_blank" rel="noopener noreferrer" className="text-[#22c55e] hover:text-[#22c55e]/80">View in Calendar</a></p>
                {eventDetails.meetLink && (
                  <p>Meet Link: <a href={eventDetails.meetLink} target="_blank" rel="noopener noreferrer" className="text-[#22c55e] hover:text-[#22c55e]/80">Join Meeting</a></p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
