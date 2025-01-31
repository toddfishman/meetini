import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

interface CalendarAccount {
  id: string;
  provider: string;
  accountId: string;
}

interface WorkingHours {
  start: string;
  end: string;
}

interface CalendarPreferences {
  workDays: number[];
  workingHours: WorkingHours | null;
  timezone: string | null;
}

export default function CalendarSettings() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences>({
    workDays: [1, 2, 3, 4, 5], // Initialize with Monday-Friday
    workingHours: {
      start: '09:00',
      end: '17:00'
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      loadCalendarSettings();
    }
  }, [session]);

  const loadCalendarSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [accountsRes, preferencesRes] = await Promise.all([
        fetch('/api/calendar/accounts'),
        fetch('/api/calendar/preferences'),
      ]);

      if (!accountsRes.ok || !preferencesRes.ok) {
        throw new Error('Failed to load calendar settings');
      }

      const [accountsData, preferencesData] = await Promise.all([
        accountsRes.json(),
        preferencesRes.json(),
      ]);

      setAccounts(accountsData);
      setPreferences(preferencesData);
    } catch (err) {
      setError('Failed to load calendar settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectCalendar = async (provider: string) => {
    try {
      setError(null);
      // Implement OAuth flow for each provider
      switch (provider) {
        case 'google':
          window.location.href = '/api/auth/google?scope=https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar';
          break;
        case 'outlook':
          window.location.href = '/api/auth/outlook?scope=Calendars.Read';
          break;
        case 'apple':
          // Implement Apple Calendar OAuth
          break;
        default:
          throw new Error('Unsupported calendar provider');
      }
    } catch (err) {
      setError('Failed to connect calendar. Please try again.');
    }
  };

  const handleDisconnectCalendar = async (provider: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/calendar/accounts?provider=${provider}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to disconnect calendar');
      }

      setAccounts(accounts.filter(account => account.provider !== provider));
    } catch (err) {
      setError('Failed to disconnect calendar. Please try again.');
    }
  };

  const handleUpdatePreferences = async (newPreferences: Partial<CalendarPreferences>) => {
    try {
      setError(null);
      const res = await fetch('/api/calendar/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preferences, ...newPreferences }),
      });

      if (!res.ok) {
        throw new Error('Failed to update preferences');
      }

      const updatedPreferences = await res.json();
      setPreferences(updatedPreferences);
    } catch (err) {
      setError('Failed to update preferences. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse text-teal-500">Loading calendar settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded text-red-500">
          {error}
        </div>
      )}

      {/* Calendar Connections */}
      <div>
        <h3 className="text-lg font-medium text-teal-500 mb-4">Connected Calendars</h3>
        <div className="space-y-3">
          {['google', 'outlook', 'apple'].map(provider => {
            const isConnected = accounts.some(account => account.provider === provider);
            return (
              <div key={provider} className="flex items-center justify-between p-3 bg-gray-800 rounded">
                <div className="flex items-center gap-3">
                  <Image
                    src={`/icons/${provider}.svg`}
                    alt={`${provider} calendar`}
                    width={24}
                    height={24}
                  />
                  <span className="capitalize">{provider} Calendar</span>
                </div>
                <button
                  onClick={() => isConnected ? handleDisconnectCalendar(provider) : handleConnectCalendar(provider)}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    isConnected
                      ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  } transition-colors`}
                >
                  {isConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Working Hours */}
      <div>
        <h3 className="text-lg font-medium text-teal-500 mb-4">Working Hours</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={preferences.workingHours?.start || '09:00'}
              onChange={e => handleUpdatePreferences({
                workingHours: {
                  start: e.target.value,
                  end: preferences.workingHours?.end || '17:00',
                },
              })}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              End Time
            </label>
            <input
              type="time"
              value={preferences.workingHours?.end || '17:00'}
              onChange={e => handleUpdatePreferences({
                workingHours: {
                  start: preferences.workingHours?.start || '09:00',
                  end: e.target.value,
                },
              })}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Work Days */}
      <div>
        <h3 className="text-lg font-medium text-teal-500 mb-4">Work Days</h3>
        <div className="flex flex-wrap gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
            <button
              key={day}
              onClick={() => {
                const newWorkDays = preferences.workDays.includes(index)
                  ? preferences.workDays.filter(d => d !== index)
                  : [...preferences.workDays, index];
                handleUpdatePreferences({ workDays: newWorkDays });
              }}
              className={`px-4 py-2 rounded text-sm font-medium ${
                preferences.workDays.includes(index)
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              } transition-colors`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div>
        <h3 className="text-lg font-medium text-teal-500 mb-4">Timezone</h3>
        <select
          value={preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          onChange={e => handleUpdatePreferences({ timezone: e.target.value })}
          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
        >
          {Intl.supportedValuesOf('timeZone').map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
    </div>
  );
} 