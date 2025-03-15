import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Navbar from '../components/Navbar';
import ConfirmationDialog from '../components/ConfirmationDialog';
import Link from 'next/link';
import Toast from '../components/Toast';
import { FaCalendarAlt, FaChevronDown, FaChevronUp, FaCog } from 'react-icons/fa';

interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime: string;
    date?: string;
  };
  end: {
    dateTime: string;
    date?: string;
  };
}

interface MeetiniInvite {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'declined';
  type: 'sent' | 'received';
  participants: string[];
  createdAt: string;
  proposedTimes: string[];
  location?: string;
  createdBy: string;
}

interface Contact {
  name: string;
  email: string;
  frequency: number;
  lastContact?: Date;
  confidence: number;
  matchedName?: string;
}

interface MeetingSummary {
  contacts: Contact[];
  type?: string;
  confidence: number;
  suggestedTimes?: string[];
}

interface ToastProps {
  show: boolean;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  type: 'danger' | 'success' | 'warning';
}

interface SearchResponse {
  contacts: {
    [key: string]: Contact[];
  };
  error?: string;
}

interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult[];
  length: number;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

// Augment the window interface
declare global {
  var webkitSpeechRecognition: { new(): SpeechRecognition };
  var currentRecognition: SpeechRecognition | null;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [meetiniInvites, setMeetiniInvites] = useState<MeetiniInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmationDialogProps>({
    isOpen: false,
    title: '',
    message: '',
    onClose: () => {},
    onConfirm: () => {},
    type: 'warning'
  });
  const [toast, setToast] = useState<ToastProps>({
    show: false,
    message: '',
    type: 'success',
    onClose: () => setToast(prev => ({ ...prev, show: false }))
  });
  const [meetingType, setMeetingType] = useState<{ type: string | undefined; confidence: number }>({ type: undefined, confidence: 0 });
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');

  const MAX_PARTICIPANTS = 30;
  const PARTICIPANT_WARNING_THRESHOLD = 20;

  // Meeting type detection based on prompt keywords
  const detectMeetingType = useCallback((prompt: string): { type: string; confidence: number } => {
    const promptLower = prompt.toLowerCase();
    
    // Meeting type patterns based on our memories
    const patterns = {
      'coffee-chat': ['coffee', 'coffee chat', 'grab coffee', 'get coffee'],
      'happy-hour': ['happy hour', 'drinks', 'beer', 'wine'],
      'virtual': ['virtual', 'zoom', 'teams', 'google meet', 'online', 'call', 'video'],
      'in-person': ['in person', 'in-person', 'lunch', 'dinner', 'meet up', 'office']
    };

    // Check each type with exact phrase matching
    for (const [type, keywords] of Object.entries(patterns)) {
      for (const keyword of keywords) {
        if (promptLower.includes(keyword)) {
          // Higher confidence for exact phrase matches
          return { type, confidence: keyword.includes(' ') ? 0.95 : 0.9 };
        }
      }
    }

    // Default to in-person with lower confidence
    return { type: 'in-person', confidence: 0.6 };
  }, []);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const onClose = () => setToast(prev => ({ ...prev, show: false, onClose: () => {} }));
    setToast({
      show: true,
      message,
      type,
      onClose
    });

    // Auto-hide after 5 seconds
    setTimeout(onClose, 5000);
  }, []);

  const stopListening = useCallback(() => {
    if (window.currentRecognition) {
      window.currentRecognition.stop();
      window.currentRecognition = null;
    }
    setIsListening(false);
  }, []);

  // Generic debounce function with proper typing
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | undefined;
    return function (this: any, ...args: Parameters<T>) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Memoize the search contacts function with proper dependencies
  const searchContacts = useCallback(async (query: string) => {
    try {
      if (isProcessing) return;
      setIsProcessing(true);
      setError(null);

      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      const data = await response.json() as SearchResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search contacts');
      }

      if (data.contacts) {
        const allContacts = Object.values(data.contacts)
          .flat()
          .filter((contact): contact is Contact => 
            contact !== null &&
            typeof contact === 'object' &&
            'email' in contact &&
            typeof contact.email === 'string' &&
            'name' in contact &&
            typeof contact.name === 'string' &&
            'frequency' in contact &&
            typeof contact.frequency === 'number'
          )
          .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
          .filter((contact, index, self) => 
            index === self.findIndex(c => c.email === contact.email)
          );

        const detectedType = detectMeetingType(query);
        
        setMeetingSummary(prev => {
          if (prev && 
              prev.contacts.length === allContacts.length && 
              prev.contacts.every((c, i) => c.email === allContacts[i].email)) {
            return prev;
          }
          return {
            contacts: allContacts,
            type: detectedType.type,
            confidence: detectedType.confidence,
            suggestedTimes: prev?.suggestedTimes || []
          };
        });

        const highConfidenceContacts = allContacts.filter(contact => contact.confidence >= 0.9);
        if (highConfidenceContacts.length > 0) {
          setSelectedContacts(prev => {
            const newSet = new Set(prev);
            highConfidenceContacts.forEach(contact => newSet.add(contact.email));
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error('Failed to search contacts:', error);
      setError(error instanceof Error ? error.message : 'Failed to search contacts');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Memoize the debounced search function
  const debouncedSearchContacts = useMemo(() => 
    debounce((query: string) => {
      if (!query.trim()) {
        setMeetingSummary(null);
        setSelectedContacts(new Set());
        setIsProcessing(false);
        return;
      }

      if (query.length < 2) {
        setMeetingSummary(prev => {
          if (!prev || prev.contacts.length > 0) {
            return {
              contacts: [],
              type: undefined,
              confidence: 0,
              suggestedTimes: prev?.suggestedTimes || []
            };
          }
          return prev;
        });
        setIsProcessing(false);
        return;
      }

      searchContacts(query);
    }, 500),
    [searchContacts]
  );

  // Handle prompt changes with proper dependencies
  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    debouncedSearchContacts(newValue);
  }, [debouncedSearchContacts]);

  // Start listening with proper dependencies
  const startListening = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    try {
      const recognition = new window.webkitSpeechRecognition();
      window.currentRecognition = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const results = Array.from(event.results);
        const transcripts = results.map(result => {
          const firstAlternative = result[0];
          return firstAlternative?.transcript || '';
        });
        const transcript = transcripts.join(' ').trim();
        
        if (transcript) {
          setPrompt(transcript);
          debouncedSearchContacts(transcript);
        }
      };

      recognition.onerror = (event: Event) => {
        // Only show error if it's not a "no-speech" error when stopping
        const error = event as unknown as { error: string };
        if (error.error !== 'no-speech') {
          console.error('Speech recognition error:', event);
          setError('Failed to recognize speech. Please try again.');
        }
        stopListening();
      };

      recognition.onend = () => {
        // Don't show any error when intentionally stopping
        setError(null);
        stopListening();
      };

      setIsListening(true);
      recognition.start();
    } catch (error) {
      setError('Failed to start voice recognition. Please try again.');
      setIsListening(false);
    }
  }, [debouncedSearchContacts, stopListening]);

  const toggleContactSelection = useCallback((email: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(email)) {
        newSet.delete(email);
      } else {
        newSet.add(email);
      }
      return newSet;
    });
  }, []);

  const fetchInvites = useCallback(async () => {
    try {
      setInviteLoading(true);
      const response = await fetch('/api/meetini');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMeetiniInvites(data);
    } catch (error) {
      console.error('Failed to fetch invites:', error);
      setError('Failed to load invitations');
    } finally {
      setInviteLoading(false);
    }
  }, []);

  const createMeetini = useCallback(async () => {
    try {
      setIsProcessing(true);
      setError(null);

      if (selectedContacts.size === 0) {
        throw new Error('Please select at least one participant');
      }

      if (selectedContacts.size > MAX_PARTICIPANTS - 1) { // -1 to account for organizer
        throw new Error(`Maximum ${MAX_PARTICIPANTS} participants allowed (including you as organizer)`);
      }

      if (!prompt.trim()) {
        throw new Error('Please provide a meeting description');
      }

      // Get meeting type from prompt
      const { type: detectedType } = detectMeetingType(prompt);

      // Add the current user as organizer
      const organizer = {
        email: session?.user?.email!,
        name: session?.user?.name || session?.user?.email!.split('@')[0],
        notifyByEmail: false, // Don't notify organizer
        isOrganizer: true
      };

      // Format other participants
      const participants = Array.from(selectedContacts).map(email => ({
        email,
        name: meetingSummary?.contacts.find(c => c.email === email)?.name || email.split('@')[0],
        notifyByEmail: true
      }));

      // Make the API request to our create endpoint
      const response = await fetch('/api/meetini/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite: {
            type: prompt,
            description: `Created via Meetini\n\nOriginal prompt: ${prompt}`,
            participants: [organizer, ...participants],
            suggestedTimes: meetingSummary?.suggestedTimes,
            location: detectedType === 'virtual' ? 'Virtual' : undefined
          }
        }),
      });

      // Try to parse response as JSON
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Server returned an invalid response');
      }

      // Check for specific error cases
      if (!response.ok) {
        // Handle known error cases
        if (response.status === 401) {
          throw new Error('Please sign in to create meetings');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to create meetings');
        }
        if (response.status === 429) {
          throw new Error('Too many requests. Please try again later');
        }
        
        // Use server error message if available, otherwise fallback
        throw new Error(data?.error || `Server error: ${response.status}`);
      }

      // Show success message with registration stats
      const successMessage = data.unregisteredParticipants > 0
        ? `✨ Success! Sent ${data.registeredParticipants} invites and ${data.unregisteredParticipants} signup prompts`
        : '✨ Success! Sending invitations...';

      showToast('success', successMessage);
      
      // Clear form
      setPrompt('');
      setSelectedContacts(new Set());
      setMeetingSummary(null);
      await fetchInvites();

    } catch (err) {
      console.error('Failed to create Meetini:', err);
      
      // Extract most useful error message
      let errorMessage = 'Failed to create meeting';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
      showToast('error', `${errorMessage}. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  }, [prompt, selectedContacts, meetingSummary, session, showToast, detectMeetingType]);

  const handleInviteAction = useCallback(async (id: string, action: 'accept' | 'decline' | 'cancel') => {
    const confirmActions = {
      accept: {
        title: 'Accept Invitation',
        message: 'Are you sure you want to accept this invitation? This will create a calendar event.',
        type: 'success' as const
      },
      decline: {
        title: 'Decline Invitation',
        message: 'Are you sure you want to decline this invitation?',
        type: 'danger' as const
      },
      cancel: {
        title: 'Cancel Invitation',
        message: 'Are you sure you want to cancel this invitation? This cannot be undone.',
        type: 'warning' as const
      }
    };

    const { title, message, type } = confirmActions[action];

    setConfirmDialog({
      isOpen: true,
      title,
      message,
      type,
      onClose: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
      onConfirm: async () => {
        try {
          // Update invitation status
          const response = await fetch('/api/meetini', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action })
          });

          let data;
          try {
            data = await response.json();
          } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            throw new Error('Server returned an invalid response');
          }

          if (!response.ok) {
            throw new Error(data?.error || `Failed to ${action} invitation`);
          }

          // If accepting, create calendar event
          if (action === 'accept') {
            const calendarResponse = await fetch('/api/calendar/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invitationId: id })
            });

            let calendarData;
            try {
              calendarData = await calendarResponse.json();
            } catch (parseError) {
              console.error('Failed to parse calendar response:', parseError);
              throw new Error('Failed to create calendar event');
            }

            if (!calendarResponse.ok) {
              throw new Error(calendarData?.error || 'Failed to create calendar event');
            }
          }

          // Update local state
          setMeetiniInvites(prev => {
            if (action === 'cancel') {
              return prev.filter(invite => invite.id !== id);
            }
            return prev.map(invite => 
              invite.id === id 
                ? { ...invite, status: action === 'accept' ? 'accepted' : 'declined' }
                : invite
            );
          });

          showToast('success', `Successfully ${action}ed the invitation`);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));

        } catch (error) {
          console.error('Failed to update invitation:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to update invitation';
          setError(errorMessage);
          showToast('error', errorMessage);
        }
      }
    });
  }, [showToast]);

  const getStatusColor = useCallback((status: MeetiniInvite['status']) => {
    switch (status) {
      case 'accepted':
        return 'text-green-500';
      case 'declined':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    } else if (status === 'authenticated' && !session?.error) {
      // Only fetch data if we have a valid session
      fetchInvites();
    }
  }, [status, session, router, fetchInvites]);

  useEffect(() => {
    // Check for prompt or openCreateModal in URL when component mounts
    const prompt = router.query.prompt as string;
    const shouldOpenModal = router.query.openCreateModal === 'true';
    
    if (prompt && !initialPrompt) {
      setInitialPrompt(prompt);
      setIsCreateModalOpen(true);
    } else if (shouldOpenModal) {
      setIsCreateModalOpen(true);
      // Remove the query parameter without page reload
      const { openCreateModal, ...query } = router.query;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    }
  }, [router.query, initialPrompt]);

  const filteredInvites = useMemo(() => 
    meetiniInvites.filter(invite => invite.type === activeTab),
    [meetiniInvites, activeTab]
  );

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  // Handle session errors
  if (session?.error === 'RefreshAccessTokenError') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-red-500">
          Session expired. Please sign in again.
        </div>
      </div>
    );
  }

  // Protect the route
  if (status === 'unauthenticated') {
    return null; // Return null while redirecting
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Meeting Creation */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 p-8 rounded-lg mb-8">
              <div className="max-w-3xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Schedule a Meeting</h3>
                  <Link href="/settings">
                    <button className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-teal-500">
                      <FaCog className="w-4 h-4" />
                      <span>Customize Preferences</span>
                    </button>
                  </Link>
                </div>
                <p className="text-gray-400 mb-6">Tell me what kind of meeting you want to schedule and with whom.</p>
                
                <div className="relative mb-6">
                  <textarea
                    value={prompt}
                    onChange={handlePromptChange}
                    placeholder="e.g. Schedule a coffee meeting with John tomorrow morning"
                    className={`w-full p-4 bg-gray-800 text-white rounded-lg mb-2 min-h-[100px] resize-none transition-opacity ${
                      isProcessing ? 'opacity-50' : 'opacity-100'
                    }`}
                    disabled={isProcessing}
                  />
                  
                  <button
                    onClick={startListening}
                    className={`absolute top-2 right-2 p-2 rounded-full ${
                      isListening ? 'bg-red-500' : 'bg-teal-500'
                    } hover:opacity-80 transition-colors`}
                    disabled={isProcessing}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-500">
                    {error}
                  </div>
                )}

                {meetingSummary && (
                  <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-400 mb-3">Meeting Summary</h4>
                    <div className="space-y-4">
                      {/* Organizer */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-medium text-gray-500">ORGANIZER</h5>
                        <div className="p-4 bg-gray-700/50 rounded-lg">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-semibold">
                              {session?.user?.name?.[0] || session?.user?.email?.[0] || '?'}
                            </div>
                            <div className="ml-3">
                              <div className="font-medium">{session?.user?.name || 'You'}</div>
                              <div className="text-sm text-gray-400">{session?.user?.email}</div>
                            </div>
                            <div className="ml-auto">
                              <span className="px-2 py-1 text-xs bg-teal-500/20 text-teal-500 rounded-full">
                                Organizer
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Selected Participants */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h5 className="text-xs font-medium text-gray-500">SELECTED PARTICIPANTS</h5>
                          <span className="text-xs text-gray-500">
                            {selectedContacts.size}/{MAX_PARTICIPANTS - 1} max
                          </span>
                        </div>
                        {selectedContacts.size > 0 ? (
                          <div className="space-y-2">
                            {Array.from(selectedContacts).map(email => {
                              const contact = meetingSummary.contacts.find(c => c.email === email);
                              return (
                                <div key={email} className="p-4 bg-gray-700/50 rounded-lg">
                                  <div className="flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold">
                                      {contact?.name?.[0] || email[0]}
                                    </div>
                                    <div className="ml-3">
                                      <div className="font-medium">{contact?.name || email}</div>
                                      <div className="text-sm text-gray-400">{email}</div>
                                    </div>
                                    <button
                                      onClick={() => toggleContactSelection(email)}
                                      className="ml-auto text-gray-400 hover:text-red-500"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center p-4 bg-gray-700/50 rounded-lg text-gray-400">
                            No participants selected
                          </div>
                        )}
                      </div>

                      {/* Suggested Participants */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-medium text-gray-500">SUGGESTED PARTICIPANTS</h5>
                        <div className="space-y-2">
                          {meetingSummary.contacts
                            .filter(contact => !selectedContacts.has(contact.email))
                            .map(contact => (
                              <button
                                key={contact.email}
                                onClick={() => toggleContactSelection(contact.email)}
                                disabled={selectedContacts.size >= MAX_PARTICIPANTS - 1}
                                className={`w-full p-4 bg-gray-700/50 rounded-lg transition-colors ${
                                  selectedContacts.size >= MAX_PARTICIPANTS - 1
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'hover:bg-gray-600/50'
                                }`}
                              >
                                <div className="flex items-center">
                                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold">
                                    {contact.name[0]}
                                  </div>
                                  <div className="ml-3 text-left">
                                    <div className="font-medium">{contact.name}</div>
                                    <div className="text-sm text-gray-400">{contact.email}</div>
                                  </div>
                                  <div className="ml-auto">
                                    <span className="px-2 py-1 text-xs bg-gray-600 rounded-full">
                                      {Math.round(contact.confidence * 100)}% match
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>

                      {/* Create Meeting Button */}
                      <div className="pt-4">
                        <button
                          onClick={createMeetini}
                          disabled={isProcessing || selectedContacts.size === 0}
                          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                            isProcessing || selectedContacts.size === 0
                              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-teal-500 hover:bg-teal-600 text-white'
                          }`}
                        >
                          {isProcessing ? 'Creating...' : 'Create Meeting'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column - Calendar and Invitations */}
          <div className="lg:col-span-1 space-y-8">
            {/* Calendar Section */}
            <div className="bg-gray-900 p-6 rounded-lg sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Your Calendar</h3>
                <button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="flex items-center space-x-2 text-teal-500 hover:text-teal-400 transition-colors"
                >
                  <FaCalendarAlt className="w-4 h-4" />
                  {showCalendar ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                </button>
              </div>
              
              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  showCalendar ? 'max-h-[600px]' : 'max-h-0'
                }`}
              >
                <div className="bg-white rounded-lg">
                  <iframe
                    src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(session?.user?.email || '')}&showPrint=0&showTabs=0&showCalendars=0&mode=WEEK&height=400`}
                    className="w-full h-[400px] border-0"
                    frameBorder="0"
                    scrolling="no"
                  />
                </div>
              </div>
            </div>

            {/* Invitations Section */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h3 className="text-lg font-medium text-white mb-6">Your Invitations</h3>
              
              <div className="flex space-x-4 mb-6">
                <button
                  onClick={() => setActiveTab('received')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'received'
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Received
                </button>
                <button
                  onClick={() => setActiveTab('sent')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'sent'
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Sent
                </button>
              </div>

              {inviteLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mx-auto"></div>
                </div>
              ) : filteredInvites.length > 0 ? (
                <div className="space-y-4">
                  {filteredInvites.map((invite) => (
                    <div key={invite.id} className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-white">{invite.title}</h4>
                          <p className="text-sm text-gray-400 mt-1">
                            {new Date(invite.createdAt).toLocaleDateString()}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {invite.participants.map((participant, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-700 text-gray-300"
                              >
                                {participant}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm ${getStatusColor(invite.status)}`}>
                            {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      {activeTab === 'received' && invite.status === 'pending' && (
                        <div className="mt-4 flex space-x-2">
                          <button
                            onClick={() => handleInviteAction(invite.id, 'accept')}
                            className="px-3 py-1 bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleInviteAction(invite.id, 'decline')}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {activeTab === 'sent' && invite.status === 'pending' && (
                        <div className="mt-4">
                          <button
                            onClick={() => handleInviteAction(invite.id, 'cancel')}
                            className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  No {activeTab} invitations
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog {...confirmDialog} />
      <Toast {...toast} />
    </div>
  );
}