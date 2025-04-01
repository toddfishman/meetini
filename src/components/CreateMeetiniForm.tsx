import React, { useState, useEffect } from 'react';
import { isContactPickerSupported, selectContacts } from '@/lib/contacts';
import { CircularProgress, Alert } from '@mui/material';

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

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string[];
}

export default function CreateMeetiniForm({ isOpen, onClose, onSuccess, initialPrompt }: CreateMeetiniFormProps) {
  const [searchResults, setSearchResults] = useState<{ [key: string]: ContactSearchResult[] }>({});
  const [selectedContacts, setSelectedContacts] = useState<ContactSearchResult[]>([]);
  const [aiPrompt, setAiPrompt] = useState(initialPrompt || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);

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
    setProcessingStatus('🤖 Starting conversation with AI...');
    setError(null);

    try {
      console.log('=== FRONTEND REQUEST ===');
      console.log('Sending to Assistant API:', {
        prompt: aiPrompt,
        participants: selectedContacts.map(c => c.email)
      });

      // First, create a new thread and send the initial message
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Please help me schedule: ${aiPrompt}. The participants are: ${selectedContacts.map(c => c.email).join(', ')}`,
          threadId: null // Start a new thread
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Assistant API error:', error);
        throw new Error(error.error || 'Failed to start scheduling conversation');
      }

      const data = await response.json();
      console.log('=== FRONTEND RESPONSE ===');
      console.log('Assistant API response:', data);

      setThreadId(data.threadId);
      setMessages(data.messages);
      
      // Keep the form open and show the conversation
      setProcessingStatus(null);

      // Only show success and close if we have confirmation
      if (data.messages.some(msg => 
        msg.role === 'assistant' && 
        msg.content.some((c: any) => c.text?.value?.includes('calendar event has been created'))
      )) {
        setProcessingStatus('✨ Success! Sending invitations...');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to create Meetini:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateMeetini} className="space-y-4">
        <div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="What kind of meeting would you like to schedule?"
            className="w-full p-3 border rounded-lg dark:bg-gray-800"
            rows={3}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Selected Participants:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedContacts.map((contact) => (
              <div
                key={contact.email}
                className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full"
                onClick={() => handleContactToggle(contact)}
              >
                <span>{contact.name || contact.email}</span>
                <button type="button" className="text-sm">&times;</button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Suggested Participants:</h3>
          <div className="space-y-2">
            {Object.entries(searchResults).map(([query, results]) => (
              <div key={query}>
                {results.map(contact => (
                  <div key={contact.email} onClick={() => handleContactToggle(contact)}
                       className={`p-2 rounded cursor-pointer ${
                         selectedContacts.some(c => c.email === contact.email)
                           ? 'bg-green-100 dark:bg-green-900'
                           : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                       }`}>
                    {contact.name} ({contact.email})
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <Alert severity="error" className="mt-4">
            {error}
          </Alert>
        )}

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50"
            disabled={isSubmitting || !aiPrompt.trim() || selectedContacts.length === 0}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <CircularProgress size={20} color="inherit" />
                <span>{processingStatus}</span>
              </div>
            ) : (
              'Create Meetini'
            )}
          </button>
        </div>
      </form>

      {messages.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          {messages.map((msg, i) => (
            <div key={i} className={`mb-2 ${msg.role === 'assistant' ? 'text-blue-600' : ''}`}>
              {msg.content.map((c, j) => (
                <p key={j}>{c}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}