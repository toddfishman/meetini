import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function TestEmail() {
  const { data: session } = useSession();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [emailDetails, setEmailDetails] = useState<{
    creator?: string;
    participants?: string[];
  }>({});

  const sendTestEmail = async () => {
    try {
      setStatus('Sending...');
      setError('');
      setEmailDetails({});
      
      const response = await fetch('/api/email/test', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        setStatus('Emails sent! Check your inbox.');
        setEmailDetails(data.details || {});
        console.log('Email send result:', data);
      } else {
        const errorMessage = data.details || data.error || 'Unknown error';
        setError(errorMessage);
        setStatus('Failed to send emails');
        console.error('Email send error:', data);
      }
    } catch (error) {
      setStatus('Failed to send emails');
      setError('Network error - check console for details');
      console.error(error);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Please sign in to test email notifications.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Test Meetini Email Notifications</h1>
      
      <div className="space-y-4 mb-6">
        <div className="p-4 bg-gray-900 rounded">
          <h2 className="text-lg font-semibold mb-2">Test Emails</h2>
          <p className="text-gray-400">Both emails will be sent to: toddfishman@gmail.com</p>
          <ul className="list-disc list-inside text-gray-400 ml-4 mt-2">
            <li>Meeting creation confirmation (as creator)</li>
            <li>Branded meeting notification (as participant)</li>
          </ul>
        </div>
      </div>
      
      <button 
        onClick={sendTestEmail}
        className="bg-[#22c55e] text-white px-4 py-2 rounded hover:bg-[#22c55e]/80 transition-colors"
      >
        Send Test Emails
      </button>

      {status && (
        <p className={`mt-4 ${error ? 'text-red-400' : 'text-[#22c55e]'}`}>
          {status}
        </p>
      )}
      
      {error && (
        <p className="mt-2 text-red-400">
          Error: {error}
        </p>
      )}

      {emailDetails.creator && (
        <div className="mt-6 space-y-4">
          <div className="p-4 bg-gray-900 rounded">
            <h2 className="text-lg font-semibold mb-2">Email Details</h2>
            <p className="text-gray-400">Sent both emails to: {emailDetails.creator}</p>
          </div>
        </div>
      )}
    </div>
  );
}
