import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface MeetingPreferences {
  locationPreferences: {
    preferredTypes: string[];
    customLocations: string[];
    maxTravelTime?: number;
  };
  virtualMeetings: {
    preferredPlatforms: string[];
    defaultLinks: {
      zoom?: string;
      meet?: string;
      teams?: string;
      custom?: string;
    };
  };
  schedulingRules: {
    preferredTimes: {
      morning?: boolean;
      afternoon?: boolean;
      evening?: boolean;
    };
    bufferTime: number; // minutes before/after meetings
    minMeetingLength: number; // minutes
    maxMeetingLength: number; // minutes
    keywords: {
      [key: string]: {
        durationType: '30min' | '1hour' | '2hours';
        locationType: 'coffee' | 'restaurant' | 'office' | 'virtual';
      };
    };
  };
}

export default function MeetingPreferencesForm() {
  const { data: session } = useSession();
  const [preferences, setPreferences] = useState<MeetingPreferences>({
    locationPreferences: {
      preferredTypes: [],
      customLocations: [],
    },
    virtualMeetings: {
      preferredPlatforms: [],
      defaultLinks: {},
    },
    schedulingRules: {
      preferredTimes: {},
      bufferTime: 15,
      minMeetingLength: 30,
      maxMeetingLength: 120,
      keywords: {},
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCustomLocation, setNewCustomLocation] = useState('');

  useEffect(() => {
    if (session) {
      loadPreferences();
    }
  }, [session]);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/preferences');
      if (!response.ok) throw new Error('Failed to load preferences');
      const data = await response.json();
      setPreferences(data);
    } catch (err) {
      setError('Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    try {
      setError(null);
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error('Failed to save preferences');
    } catch (err) {
      setError('Failed to save preferences');
    }
  };

  const locationTypes = [
    { id: 'coffee', label: 'Coffee Shop' },
    { id: 'restaurant', label: 'Restaurant' },
    { id: 'office', label: 'Office' },
    { id: 'coworking', label: 'Coworking Space' },
    { id: 'outdoor', label: 'Outdoor Space' },
  ];

  const virtualPlatforms = [
    { id: 'zoom', label: 'Zoom' },
    { id: 'meet', label: 'Google Meet' },
    { id: 'teams', label: 'Microsoft Teams' },
    { id: 'custom', label: 'Custom Platform' },
  ];

  if (isLoading) {
    return <div className="text-gray-400">Loading preferences...</div>;
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded text-red-500">
          {error}
        </div>
      )}

      {/* Location Preferences */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-[#22c55e]">Location Preferences</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Preferred Meeting Locations
          </label>
          <div className="flex flex-wrap gap-2">
            {locationTypes.map(type => (
              <button
                key={type.id}
                onClick={() => {
                  const types = preferences.locationPreferences.preferredTypes;
                  setPreferences(prev => ({
                    ...prev,
                    locationPreferences: {
                      ...prev.locationPreferences,
                      preferredTypes: types.includes(type.id)
                        ? types.filter(t => t !== type.id)
                        : [...types, type.id],
                    },
                  }));
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  preferences.locationPreferences.preferredTypes.includes(type.id)
                    ? 'bg-[#22c55e] text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Custom Locations
          </label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCustomLocation}
                onChange={e => setNewCustomLocation(e.target.value)}
                placeholder="Add a custom location"
                className="flex-1 p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
              />
              <button
                onClick={() => {
                  if (newCustomLocation.trim()) {
                    setPreferences(prev => ({
                      ...prev,
                      locationPreferences: {
                        ...prev.locationPreferences,
                        customLocations: [...prev.locationPreferences.customLocations, newCustomLocation.trim()],
                      },
                    }));
                    setNewCustomLocation('');
                  }
                }}
                className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#34d67f] transition-colors"
              >
                Add
              </button>
            </div>
            {preferences.locationPreferences.customLocations.map((location, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded bg-gray-800 border border-gray-700"
              >
                <span className="text-gray-300">{location}</span>
                <button
                  onClick={() => {
                    setPreferences(prev => ({
                      ...prev,
                      locationPreferences: {
                        ...prev.locationPreferences,
                        customLocations: prev.locationPreferences.customLocations.filter((_, i) => i !== index),
                      },
                    }));
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Maximum Travel Time (minutes)
          </label>
          <input
            type="number"
            min="0"
            max="120"
            value={preferences.locationPreferences.maxTravelTime || 30}
            onChange={e => {
              setPreferences(prev => ({
                ...prev,
                locationPreferences: {
                  ...prev.locationPreferences,
                  maxTravelTime: parseInt(e.target.value) || 0,
                },
              }));
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
          />
        </div>
      </div>

      {/* Virtual Meeting Preferences */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-[#22c55e]">Virtual Meeting Preferences</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Preferred Platforms
          </label>
          <div className="flex flex-wrap gap-2">
            {virtualPlatforms.map(platform => (
              <button
                key={platform.id}
                onClick={() => {
                  const platforms = preferences.virtualMeetings.preferredPlatforms;
                  setPreferences(prev => ({
                    ...prev,
                    virtualMeetings: {
                      ...prev.virtualMeetings,
                      preferredPlatforms: platforms.includes(platform.id)
                        ? platforms.filter(p => p !== platform.id)
                        : [...platforms, platform.id],
                    },
                  }));
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  preferences.virtualMeetings.preferredPlatforms.includes(platform.id)
                    ? 'bg-[#22c55e] text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {platform.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">
            Default Meeting Links
          </label>
          {virtualPlatforms.map(platform => (
            <div key={platform.id}>
              <label className="block text-xs text-gray-400 mb-1">
                {platform.label} Link
              </label>
              <input
                type="text"
                value={preferences.virtualMeetings.defaultLinks[platform.id as keyof typeof preferences.virtualMeetings.defaultLinks] || ''}
                onChange={e => {
                  setPreferences(prev => ({
                    ...prev,
                    virtualMeetings: {
                      ...prev.virtualMeetings,
                      defaultLinks: {
                        ...prev.virtualMeetings.defaultLinks,
                        [platform.id]: e.target.value,
                      },
                    },
                  }));
                }}
                placeholder={`Your ${platform.label} meeting link`}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Scheduling Rules */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-[#22c55e]">Scheduling Rules</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Preferred Meeting Times
          </label>
          <div className="flex flex-wrap gap-2">
            {['morning', 'afternoon', 'evening'].map(time => (
              <button
                key={time}
                onClick={() => {
                  setPreferences(prev => ({
                    ...prev,
                    schedulingRules: {
                      ...prev.schedulingRules,
                      preferredTimes: {
                        ...prev.schedulingRules.preferredTimes,
                        [time]: !prev.schedulingRules.preferredTimes[time as keyof typeof prev.schedulingRules.preferredTimes],
                      },
                    },
                  }));
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  preferences.schedulingRules.preferredTimes[time as keyof typeof preferences.schedulingRules.preferredTimes]
                    ? 'bg-[#22c55e] text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {time.charAt(0).toUpperCase() + time.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Buffer Time (minutes)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={preferences.schedulingRules.bufferTime}
              onChange={e => {
                setPreferences(prev => ({
                  ...prev,
                  schedulingRules: {
                    ...prev.schedulingRules,
                    bufferTime: parseInt(e.target.value) || 0,
                  },
                }));
              }}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Meeting Length Range (minutes)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="15"
                max="480"
                value={preferences.schedulingRules.minMeetingLength}
                onChange={e => {
                  setPreferences(prev => ({
                    ...prev,
                    schedulingRules: {
                      ...prev.schedulingRules,
                      minMeetingLength: parseInt(e.target.value) || 30,
                    },
                  }));
                }}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
              />
              <span className="text-gray-400">to</span>
              <input
                type="number"
                min="15"
                max="480"
                value={preferences.schedulingRules.maxMeetingLength}
                onChange={e => {
                  setPreferences(prev => ({
                    ...prev,
                    schedulingRules: {
                      ...prev.schedulingRules,
                      maxMeetingLength: parseInt(e.target.value) || 120,
                    },
                  }));
                }}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Scheduling Keywords
          </label>
          <p className="text-sm text-gray-400 mb-4">
            Define keywords that Meetini will recognize to automatically set meeting preferences.
          </p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                placeholder="Add a keyword (e.g., 'quick sync', 'team lunch')"
                className="flex-1 p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-[#22c55e]"
              />
              <button
                onClick={() => {
                  if (newKeyword.trim()) {
                    setPreferences(prev => ({
                      ...prev,
                      schedulingRules: {
                        ...prev.schedulingRules,
                        keywords: {
                          ...prev.schedulingRules.keywords,
                          [newKeyword.trim()]: {
                            durationType: '30min',
                            locationType: 'virtual',
                          },
                        },
                      },
                    }));
                    setNewKeyword('');
                  }
                }}
                className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#34d67f] transition-colors"
              >
                Add
              </button>
            </div>
            {Object.entries(preferences.schedulingRules.keywords).map(([keyword, rules]) => (
              <div
                key={keyword}
                className="p-3 rounded bg-gray-800 border border-gray-700 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#22c55e] font-medium">{keyword}</span>
                  <button
                    onClick={() => {
                      setPreferences(prev => {
                        const newKeywords = { ...prev.schedulingRules.keywords };
                        delete newKeywords[keyword];
                        return {
                          ...prev,
                          schedulingRules: {
                            ...prev.schedulingRules,
                            keywords: newKeywords,
                          },
                        };
                      });
                    }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={rules.durationType}
                    onChange={e => {
                      setPreferences(prev => ({
                        ...prev,
                        schedulingRules: {
                          ...prev.schedulingRules,
                          keywords: {
                            ...prev.schedulingRules.keywords,
                            [keyword]: {
                              ...rules,
                              durationType: e.target.value as '30min' | '1hour' | '2hours',
                            },
                          },
                        },
                      }));
                    }}
                    className="p-1.5 rounded bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:border-[#22c55e]"
                  >
                    <option value="30min">30 minutes</option>
                    <option value="1hour">1 hour</option>
                    <option value="2hours">2 hours</option>
                  </select>
                  <select
                    value={rules.locationType}
                    onChange={e => {
                      setPreferences(prev => ({
                        ...prev,
                        schedulingRules: {
                          ...prev.schedulingRules,
                          keywords: {
                            ...prev.schedulingRules.keywords,
                            [keyword]: {
                              ...rules,
                              locationType: e.target.value as 'coffee' | 'restaurant' | 'office' | 'virtual',
                            },
                          },
                        },
                      }));
                    }}
                    className="p-1.5 rounded bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:border-[#22c55e]"
                  >
                    <option value="coffee">Coffee Shop</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="office">Office</option>
                    <option value="virtual">Virtual</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={savePreferences}
          className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#34d67f] transition-colors"
        >
          Save Preferences
        </button>
      </div>
    </div>
  );
} 