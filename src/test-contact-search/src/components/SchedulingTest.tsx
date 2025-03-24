import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { SmartScheduler } from '../../../lib/smartScheduling/smartScheduler';
import { calendar_v3 } from 'googleapis';
import { MeetingType, TimePreference } from '../../../lib/types/preferences';

export function SchedulingTest() {
  const { data: session } = useSession();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testScheduling = async () => {
    try {
      setLoading(true);
      setError(null);

      // Create a test request
      const request = {
        userId: session?.user?.email || '',
        userPrefs: {
          userId: session?.user?.email || '',
          workingHours: {
            start: '09:00',
            end: '17:00',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          focusTime: {
            start: '14:00',
            end: '16:00'
          },
          meetingPreferences: {
            [MeetingType.OneOnOne]: {
              preferredTimes: [
                {
                  start: '10:00',
                  end: '12:00'
                }
              ]
            }
          }
        },
        meetingType: MeetingType.OneOnOne,
        preferredDuration: 30,
        earliestTime: new Date().toISOString(),
        latestTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week from now
      };

      // Make API call to test scheduling
      const response = await fetch('/api/test-scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to test scheduling');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Smart Scheduling Test</h2>
      <button 
        onClick={testScheduling}
        disabled={loading || !session}
        style={{
          padding: '10px 20px',
          margin: '10px 0',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Testing...' : 'Test Smart Scheduling'}
      </button>

      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          Error: {error}
        </div>
      )}

      {results && (
        <div style={{ margin: '20px 0' }}>
          <h3>Results:</h3>
          <pre style={{ 
            backgroundColor: '#f5f5f5',
            padding: '15px',
            borderRadius: '4px',
            overflow: 'auto'
          }}>
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
