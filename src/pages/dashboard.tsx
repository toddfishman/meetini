import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Navbar from '../components/Navbar';
import ConfirmationDialog from '../components/ConfirmationDialog';
import CreateMeetiniForm from '../components/CreateMeetiniForm';
import Link from 'next/link';
import Toast from '../components/Toast';

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

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
  const [meetiniInvites, setMeetiniInvites] = useState<MeetiniInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    type: 'danger' | 'success' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
    type: 'warning'
  });

  const [isListening, setIsListening] = useState(false);
  const [prompt, setPrompt] = useState('');
  const previousPrompt = useRef(prompt);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [meetingType, setMeetingType] = useState<{ type: string | undefined; confidence: number }>({ type: undefined, confidence: 0 });
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummary | null>(null);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error';
    message: string;
  }>({
    show: false,
    type: 'success',
    message: '',
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: 'success', message: '' }), 5000);
  };

  const stopListening = () => {
    if (window.currentRecognition) {
      window.currentRecognition.stop();
      window.currentRecognition = null;
    }
    setIsListening(false);
  };

  const startListening = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    try {
      if (isListening) {
        stopListening();
        return;
      }

      setIsListening(true);
      setError(null);

      const recognition = new window.webkitSpeechRecognition();
      window.currentRecognition = recognition;
      
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        setPrompt(transcript);
      };

      recognition.onerror = (event: any) => {
        setError('Error occurred in recognition: ' + event.error);
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      recognition.start();
    } catch (error) {
      setError('Failed to start voice recognition. Please try again.');
      setIsListening(false);
    }
  };

  function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function (...args: any[]) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(this, args);
      }, wait);
    };
  }

  const processSearchResults = async (query: string) => {
    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search contacts');
      }

      if (data.contacts) {
        // Flatten all contact results while maintaining uniqueness by email
        const allContacts = Object.values(data.contacts)
          .flat()
          .filter((contact: any, index: number, self: any[]) => 
            index === self.findIndex((c: any) => c.email === contact.email)
          );

        const detectedType = detectMeetingType(query);
        
        // Update meeting summary with all found contacts
        setMeetingSummary(prev => ({
          ...prev,
          contacts: allContacts,
          type: detectedType.type,
          confidence: detectedType.confidence
        }));

        // Update selected contacts
        const newSelectedContacts = new Set(selectedContacts);
        allContacts.forEach((contact: any) => {
          if (contact.confidence >= 0.9) { // Auto-select high confidence matches
            newSelectedContacts.add(contact.email);
          }
        });
        setSelectedContacts(newSelectedContacts);
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
      setError(error instanceof Error ? error.message : 'Failed to search contacts');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleContactSelection = (email: string) => {
    const newSelectedContacts = new Set(selectedContacts);
    if (newSelectedContacts.has(email)) {
      newSelectedContacts.delete(email);
    } else {
      newSelectedContacts.add(email);
    }
    setSelectedContacts(newSelectedContacts);
  };

  const debouncedSearchContacts = useCallback(
    debounce(async (text: string) => {
      if (!text?.trim() || text === previousPrompt.current) {
        return;
      }
      previousPrompt.current = text;

      await processSearchResults(text);
    }, 500),
    []
  );

  useEffect(() => {
    console.log('Suggested contacts updated:', selectedContacts);
    console.log('Meeting summary updated:', meetingSummary);
  }, [selectedContacts, meetingSummary]);

  useEffect(() => {
    if (prompt) {
      debouncedSearchContacts(prompt);
    } else {
      setMeetingSummary(null);
      setSelectedContacts(new Set());
    }
  }, [prompt, debouncedSearchContacts]);

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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await fetch('/api/calendar');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setEvents(data);
      } catch (error) {
        console.error('Failed to fetch calendar events:', error);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchEvents();
      fetchInvites();
    }
  }, [session, fetchInvites]);

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

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  // Group events by month
  const groupedEvents = events.reduce((groups: { [key: string]: CalendarEvent[] }, event) => {
    const date = new Date(event.start.dateTime || event.start.date || Date.now());
    const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groups[monthYear]) {
      groups[monthYear] = [];
    }
    groups[monthYear].push(event);
    return groups;
  }, {});

  const filteredInvites = meetiniInvites.filter(invite => invite.type === activeTab);

  const getStatusColor = (status: MeetiniInvite['status']) => {
    switch (status) {
      case 'accepted':
        return 'text-green-500';
      case 'declined':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const handleInviteAction = async (id: string, action: 'accept' | 'decline' | 'cancel') => {
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
      action: async () => {
        try {
          // First update the invitation status
          const response = await fetch('/api/meetini', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id, action }),
          });

          const data = await response.json();
          
          if (!response.ok) throw new Error(data.error);
          
          // If accepting, create calendar invitation
          if (action === 'accept') {
            const calendarResponse = await fetch('/api/calendar/invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ invitationId: id }),
            });

            if (!calendarResponse.ok) {
              const calendarError = await calendarResponse.json();
              throw new Error(calendarError.error || 'Failed to create calendar invitation');
            }
          }

          // Update local state based on the action
          if (action === 'cancel') {
            setMeetiniInvites(prev => prev.filter(invite => invite.id !== id));
          } else {
            setMeetiniInvites(prev => 
              prev.map(invite => 
                invite.id === id 
                  ? { ...invite, status: action === 'accept' ? 'accepted' : 'declined' }
                  : invite
              )
            );
          }
        } catch (error) {
          console.error('Failed to update invitation:', error);
          setError(error instanceof Error ? error.message : 'Failed to update invitation');
        }
      }
    });
  };

  function detectMeetingType(prompt: string): { type: string; confidence: number } {
    const prompt_lower = prompt.toLowerCase();
  
    // Meeting type patterns
    const patterns = {
      'in-person': ['in person', 'in-person', 'coffee', 'lunch', 'dinner', 'meet up', 'office'],
      'virtual': ['virtual', 'zoom', 'teams', 'google meet', 'online', 'call', 'video'],
    };

    // Check each type
    for (const [type, keywords] of Object.entries(patterns)) {
      for (const keyword of keywords) {
        if (prompt_lower.includes(keyword)) {
          return { type, confidence: 0.9 };
        }
      }
    }

    // Default to in-person with lower confidence
    return { type: 'in-person', confidence: 0.6 };
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-36">
        <div className="bg-gray-900 p-8 rounded-lg mb-16">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xl font-semibold text-white mb-4">Schedule a Meeting</h3>
            <p className="text-gray-400 mb-6">Tell me what kind of meeting you want to schedule or set it up manually.</p>
            
            <div className="relative mb-6">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Schedule a coffee meeting with John tomorrow morning"
                className="w-full p-4 bg-gray-800 text-white rounded-lg mb-2 min-h-[100px] resize-none"
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

            {meetingSummary && (
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <h4 className="text-sm font-medium text-gray-400 mb-3">Meeting Summary</h4>
                <div className="space-y-4">
                  {/* Participants */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-500">PARTICIPANTS</h5>
                    <div className="space-y-2">
                      {meetingSummary.contacts.map((contact) => (
                        <div 
                          key={contact.email} 
                          className={`flex items-center justify-between text-sm p-2 rounded cursor-pointer transition-colors ${
                            selectedContacts.has(contact.email) 
                              ? 'bg-teal-500/20 hover:bg-teal-500/30' 
                              : 'hover:bg-gray-700'
                          }`}
                          onClick={() => toggleContactSelection(contact.email)}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${
                              selectedContacts.has(contact.email) ? 'bg-teal-500' : 'bg-gray-500'
                            }`}></div>
                            <span className="text-white">{contact.name}</span>
                            {contact.matchedName && (
                              <span className="text-gray-500 text-xs">
                                (matched: {contact.matchedName})
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 text-xs">{contact.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meeting Type */}
                  {meetingSummary.type && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-1">TYPE</h5>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="text-white capitalize">
                          {meetingSummary.type}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-center space-x-4">
              <Link href="/settings">
                <button className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors whitespace-nowrap flex items-center justify-center space-x-2">
                  <span>Customize Your Meetini's 🍸 Settings</span>
                </button>
              </Link>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                disabled={isProcessing}
              >
                Create Meetini
              </button>
              <button
                onClick={() => setShowManualSetup(true)}
                className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Manual Setup
              </button>
            </div>
          </div>
        </div>

        {/* Embed Google Calendar */}
        <div className="mb-16">
          <iframe
            src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(session?.user?.email || '')}&showTitle=0&showNav=1&showPrint=0&showTabs=1&showCalendars=1&height=600&mode=WEEK`}
            style={{ border: 0 }}
            width="100%"
            height="600"
            frameBorder="0"
            scrolling="no"
            className="rounded-lg"
          ></iframe>
        </div>

        {/* Calendar Events Section - Single Row Expandable */}
        <div className="border border-gray-800 rounded-lg overflow-hidden mb-16">
          <button
            className="w-full p-4 bg-gray-900 text-left font-medium text-teal-500 hover:bg-gray-800 transition-colors flex justify-between items-center"
            onClick={() => setExpandedEvents(prev => 
              prev.length === Object.keys(groupedEvents).length ? [] : Object.keys(groupedEvents)
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">Calendar Events</span>
              {loading && <span className="text-sm text-gray-400">(Loading...)</span>}
            </div>
            <span className="text-sm text-gray-400">
              {events.length} total event{events.length !== 1 ? 's' : ''}
            </span>
          </button>
          
          {expandedEvents.length > 0 && (
            <div className="bg-black/30">
              {Object.entries(groupedEvents).map(([monthYear, monthEvents]) => (
                <div key={monthYear} className="border-t border-gray-800">
                  <div className="p-4">
                    <div className="font-medium text-teal-500 mb-2">{monthYear}</div>
                    <div className="space-y-3">
                      {monthEvents.map((event) => (
                        <div key={event.id} className="pl-4 border-l-2 border-gray-800">
                          <h3 className="font-medium text-white">{event.summary}</h3>
                          <p className="text-sm text-gray-400">
                            {new Date(event.start.dateTime || event.start.date || Date.now()).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meetini Invitations Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Meetini Invitations</h2>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex space-x-4 mb-4">
            <button
              onClick={() => setActiveTab('received')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'received'
                  ? 'bg-teal-500 text-white'
                  : 'text-teal-500 border border-teal-500 hover:bg-teal-500/10'
              }`}
            >
              Received
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'sent'
                  ? 'bg-teal-500 text-white'
                  : 'text-teal-500 border border-teal-500 hover:bg-teal-500/10'
              }`}
            >
              Sent
            </button>
          </div>
          
          <div className="space-y-4">
            {inviteLoading ? (
              <p>Loading invitations...</p>
            ) : filteredInvites.length > 0 ? (
              filteredInvites.map((invite) => (
                <div key={invite.id} className="border border-gray-800 rounded-lg p-4 hover:border-teal-500 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-medium text-teal-500">{invite.title}</h3>
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(invite.status)}`}>
                      {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>
                      <span className="font-medium">Participants: </span>
                      {invite.participants.join(', ')}
                    </p>
                    <p>
                      <span className="font-medium">Location: </span>
                      {invite.location || 'To be determined'}
                    </p>
                    <p>
                      <span className="font-medium">Proposed Times: </span>
                      {invite.proposedTimes.map(time => 
                        new Date(time).toLocaleString()
                      ).join(', ')}
                    </p>
                    <p className="text-xs">
                      Created {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      {invite.type === 'received' && invite.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleInviteAction(invite.id, 'accept')}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleInviteAction(invite.id, 'decline')}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {invite.type === 'sent' && invite.status === 'pending' && (
                        <button
                          onClick={() => handleInviteAction(invite.id, 'cancel')}
                          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No {activeTab} invitations found</p>
            )}
          </div>
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateMeetiniForm
          onClose={() => {
            setIsCreateModalOpen(false);
            setInitialPrompt(null);
          }}
          initialPrompt={initialPrompt}
        />
      )}

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.action();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        type={confirmDialog.type}
      />

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  );
}