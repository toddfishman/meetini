import React, { useState, useEffect } from 'react';
import { isContactPickerSupported, selectContacts } from '@/lib/contacts';

declare global {
  interface Window {
    recognition: any;
    webkitSpeechRecognition: any;
  }
}

interface CreateMeetiniFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPrompt?: string | null;
  mode?: 'ai' | 'manual';
}

interface Contact {
  type: 'email' | 'phone';
  value: string;
  name?: string;
}

interface PickedContact {
  email?: string;
  phoneNumber?: string;
  name?: string;
}

type ContactResult = { type: 'email'; value: string; name?: string } | { type: 'phone'; value: string; name?: string };

interface FormData {
  title: string;
  contacts: Contact[];
  location: string;
  proposedTimes: string[];
  preferences?: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours' | 'custom';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual' | 'custom';
  };
}

interface ContactSearchResult {
  name: string;
  email: string;
  frequency: number;
  lastContact: Date;
  confidence: number;
  matchedName: string;
}

export default function CreateMeetiniForm({ isOpen, onClose, onSuccess, initialPrompt }: CreateMeetiniFormProps) {
  const [searchResults, setSearchResults] = useState<{ [key: string]: ContactSearchResult[] }>({});
  const [selectedContacts, setSelectedContacts] = useState<ContactSearchResult[]>([]);
  const [aiPrompt, setAiPrompt] = useState(initialPrompt || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle contact search when prompt changes
  useEffect(() => {
    const searchContacts = async () => {
      if (!aiPrompt) return;
      
      try {
        const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(aiPrompt)}`);
        const data = await response.json();
        setSearchResults(data);
      } catch (err) {
        console.error('Failed to search contacts:', err);
      }
    };

    const debounceTimer = setTimeout(searchContacts, 300);
    return () => clearTimeout(debounceTimer);
  }, [aiPrompt]);

  const handleContactToggle = (contact: ContactSearchResult) => {
    setSelectedContacts(prev => {
      const exists = prev.find(c => c.email === contact.email);
      if (exists) {
        return prev.filter(c => c.email !== contact.email);
      } else {
        return [...prev, contact];
      }
    });
  };

  const handleCreateMeetini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || selectedContacts.length === 0) return;

    setIsSubmitting(true);
    setProcessingStatus('🤖 Creating your Meetini...');
    setError(null);

    try {
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          participants: selectedContacts.map(c => c.email)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Meetini');
      }

      setProcessingStatus('✨ Success! Sending invitations...');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to create Meetini:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContactResult = (contact: ContactSearchResult) => {
    const isSelected = selectedContacts.some(c => c.email === contact.email);
    const lastContactDate = new Date(contact.lastContact).toLocaleDateString();
    
    return (
      <div 
        key={contact.email}
        className={`flex items-center p-3 rounded-lg cursor-pointer transition-all ${
          isSelected ? 'bg-[#22c55e]/50 dark:bg-[#22c55e]/50' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        onClick={() => handleContactToggle(contact)}
      >
        <div className="flex items-center justify-center w-6 h-6 mr-3">
          {isSelected ? (
            <svg className="w-5 h-5 text-[#22c55e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400 hover:text-[#22c55e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          )}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">{contact.name}</h4>
              <p className="text-sm text-gray-500">{contact.email}</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <div>{contact.frequency} interactions</div>
              <div>Last: {lastContactDate}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        
        <div className="relative bg-white dark:bg-gray-900 rounded-lg p-6 max-w-2xl w-full">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Schedule a Meeting</h2>
          
          <div className="space-y-6">
            <div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Tell me what kind of meeting you want to schedule..."
                className="w-full p-3 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                rows={3}
              />
            </div>

            {Object.entries(searchResults).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Suggested Contacts</h3>
                {Object.entries(searchResults).map(([name, contacts]) => (
                  <div key={name} className="space-y-2">
                    {contacts.map(contact => renderContactResult(contact))}
                  </div>
                ))}
              </div>
            )}

            {selectedContacts.length > 0 && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">Selected Contacts</h3>
                <div className="space-y-2">
                  {selectedContacts.map(contact => (
                    <div key={contact.email} 
                      className="flex items-center justify-between bg-[#22c55e]/50 dark:bg-[#22c55e]/50 p-3 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{contact.name}</div>
                        <div className="text-sm text-gray-500">{contact.email}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContactToggle(contact);
                        }}
                        className="p-1 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMeetini}
                disabled={isSubmitting || !aiPrompt.trim() || selectedContacts.length === 0}
                className="px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#22c55e]/80 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Meetini'}
              </button>
            </div>

            {error && (
              <div className="text-red-500 text-sm mt-2">
                {error}
              </div>
            )}

            {processingStatus && (
              <div className="text-[#22c55e] text-sm mt-2">
                {processingStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}