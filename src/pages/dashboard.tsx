import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Navbar from '../components/Navbar';
import ConfirmationDialog from '../components/ConfirmationDialog';
import CreateMeetiniForm from '../components/CreateMeetiniForm';
import Link from 'next/link';
import Toast from '../components/Toast';
import { createMeetiniInvite } from '@/lib/meetiniService';
import { checkUserStatuses } from '@/lib/userService';

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
  type: string;
  participants: Array<{ email: string; name?: string; status: string }>;
  createdAt: string;
  proposedTimes: Array<{ dateTime: string; status: string }>;
  location?: string;
  description?: string;
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
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    show: false,
    message: '',
    type: 'success'
  });
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
  const [manualForm, setManualForm] = useState({
    participants: '',
    title: '',
    location: '',
    description: '',
    date: '',
    time: ''
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

  const handleCreateMeetini = async () => {
    if (!session?.user?.email) {
      setToast({
        message: 'You must be signed in to create a Meetini',
        type: 'error'
      });
      return;
    }

    if (!meetingSummary) {
      setToast({
        message: 'Please select contacts before creating a Meetini',
        type: 'error'
      });
      return;
    }

    try {
      setIsProcessing(true);
      console.log('Selected contacts:', selectedContacts);
      console.log('Meeting summary:', meetingSummary);

      // Get the full contact info for each selected email
      const participants = meetingSummary.contacts
        .filter(contact => selectedContacts.has(contact.email))
        .map(contact => ({
          email: contact.email,
          name: contact.name
        }));

      // Check user status
      const userStatuses = await checkUserStatuses(participants.map(p => p.email));
      console.log('User statuses:', userStatuses);

      // Create the Meetini invite
      const invite = {
        title: meetingSummary.type ? `${meetingSummary.type} Meeting` : 'New Meeting',
        type: meetingSummary.type || 'meeting',
        participants,
        suggestedTimes: meetingSummary.suggestedTimes || [],
        createdBy: session.user.email,
      };
      console.log('Creating invite:', invite);

      const newInvite = await createMeetiniInvite(invite, userStatuses, session);
      console.log('Created invite:', newInvite);

      setToast({
        show: true,
        message: 'Meetini created successfully!',
        type: 'success'
      });

      // Reset state
      setMeetingSummary(null);
      setSelectedContacts(new Set());
      setIsProcessing(false);

    } catch (error) {
      console.error('Error creating Meetini:', error);
      setToast({
        show: true,
        message: 'Failed to create Meetini',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualCreate = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      // Parse form data
      const participants = manualForm.participants
        .split('\n')
        .map(email => email.trim())
        .filter(email => email);

      if (!participants.length) {
        throw new Error('Please add at least one participant');
      }

      if (!manualForm.title) {
        throw new Error('Please add a meeting title');
      }

      if (!manualForm.date || !manualForm.time) {
        throw new Error('Please select a date and time');
      }

      // Format the time slot into a proper ISO date string
      const [hours, minutes] = manualForm.time.match(/(\d+):(\d+)/)?.slice(1).map(Number) || [];
      const isPM = manualForm.time.toLowerCase().includes('pm');
      const adjustedHours = isPM && hours !== 12 ? hours + 12 : hours;
      
      const dateObj = new Date(manualForm.date);
      dateObj.setHours(adjustedHours, minutes, 0, 0);
      const dateTimeISO = dateObj.toISOString();

      console.log('Formatted datetime:', {
        original: { date: manualForm.date, time: manualForm.time },
        parsed: { hours, minutes, isPM, adjustedHours },
        result: dateTimeISO
      });

      // Check user statuses first
      const userStatusesResult = await checkUserStatuses(participants);
      console.log('User statuses:', userStatusesResult);

      // Create the invite
      const invite = {
        type: 'meetini',
        participants: participants.map(email => ({ email })),
        suggestedTimes: [dateTimeISO],
        title: manualForm.title,
        location: manualForm.location || undefined,
        description: manualForm.description || undefined,
        createdBy: session?.user?.email || ''
      };

      try {
        const result = await createMeetiniInvite(invite, userStatusesResult, session);
        console.log('Created invite:', result);
        
        showToast('success', 'Meeting invitation created successfully!');
        setShowManualSetup(false);
        setManualForm({
          participants: '',
          title: '',
          location: '',
          description: '',
          date: '',
          time: ''
        });
        
        // Refresh the invites list
        fetchInvites();
      } catch (error) {
        console.error('Failed to create Meetini invite:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create meeting';
        showToast('error', errorMessage);
        setError(errorMessage);
      }
    } catch (error) {
      console.error('Failed to create meeting:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create meeting';
      showToast('error', errorMessage);
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualFormChange = (field: string, value: string) => {
    setManualForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddTimeSlot = () => {
    // Removed this function as it is not needed anymore
  };

  const handleRemoveTimeSlot = (index: number) => {
    // Removed this function as it is not needed anymore
  };

  if (status === "unauthenticated") {
    router.push("/auth/signin");
    return null;
  }

  if (loading || inviteLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
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
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="container mx-auto px-12 py-32 max-w-6xl">
        <div className="bg-gray-800 p-12 rounded-xl mb-12 shadow-xl">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-2xl font-semibold text-white mb-4">Schedule a Meeting</h3>
            <p className="text-gray-300 mb-6">Tell me what kind of meeting you want to schedule or set it up manually.</p>
            
            <div className="relative mb-6">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Schedule a coffee meeting with John tomorrow morning"
                className="w-full p-4 bg-gray-700 text-white rounded-lg mb-2 min-h-[100px] resize-none border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                disabled={isProcessing}
              />
              
              <button
                onClick={startListening}
                className={`absolute top-4 right-4 p-2 rounded-full ${
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
              <div className="mb-6 p-6 bg-gray-700 rounded-lg border border-gray-600">
                <h4 className="text-sm font-medium text-gray-300 mb-4">Meeting Summary</h4>
                <div className="space-y-6">
                  {/* Participants */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-400">PARTICIPANTS</h5>
                    <div className="space-y-2">
                      {meetingSummary.contacts.map((contact) => (
                        <div 
                          key={contact.email} 
                          className={`flex items-center justify-between text-sm p-3 rounded cursor-pointer transition-colors ${
                            selectedContacts.has(contact.email) 
                              ? 'bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30' 
                              : 'hover:bg-gray-600 border border-gray-600'
                          }`}
                          onClick={() => toggleContactSelection(contact.email)}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${
                              selectedContacts.has(contact.email) ? 'bg-teal-500' : 'bg-gray-400'
                            }`}></div>
                            <span className="text-white">{contact.name}</span>
                            {contact.matchedName && (
                              <span className="text-gray-400 text-xs">
                                (matched: {contact.matchedName})
                              </span>
                            )}
                          </div>
                          <span className="text-gray-300 text-xs">{contact.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meeting Type */}
                  {meetingSummary.type && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-400 mb-2">TYPE</h5>
                      <div className="flex items-center space-x-3 p-3 bg-gray-600/30 rounded-lg border border-gray-600">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="text-white capitalize">
                          {meetingSummary.type || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowSettings(true)}
                className="flex-1 py-3 px-6 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors border border-gray-600"
              >
                Customize Your Meetini's
              </button>
              <button
                onClick={handleCreateMeetini}
                className="flex-1 py-3 px-6 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                disabled={isProcessing}
              >
                Create Meetini
              </button>
              <button
                onClick={() => setShowManualSetup(true)}
                className="flex-1 py-3 px-6 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors border border-gray-600"
              >
                Manual Setup
              </button>
            </div>
          </div>
        </div>

        {/* Manual Setup Modal */}
        {showManualSetup && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-4xl mx-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-white">Manual Meeting Setup</h2>
                <button 
                  onClick={() => setShowManualSetup(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Participant Emails (one per line)
                  </label>
                  <textarea
                    value={manualForm.participants}
                    onChange={(e) => handleManualFormChange('participants', e.target.value)}
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    rows={3}
                    placeholder="john@example.com&#13;&#10;jane@example.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Meeting Title
                  </label>
                  <input
                    type="text"
                    value={manualForm.title}
                    onChange={(e) => handleManualFormChange('title', e.target.value)}
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    placeholder="Quick sync"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Meeting Time
                  </label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <input
                        type="date"
                        value={manualForm.date}
                        onChange={(e) => handleManualFormChange('date', e.target.value)}
                        className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="time"
                        value={manualForm.time}
                        onChange={(e) => handleManualFormChange('time', e.target.value)}
                        className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Location (optional)
                  </label>
                  <input
                    type="text"
                    value={manualForm.location}
                    onChange={(e) => handleManualFormChange('location', e.target.value)}
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    placeholder="Coffee shop, Zoom link, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={manualForm.description}
                    onChange={(e) => handleManualFormChange('description', e.target.value)}
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    rows={3}
                    placeholder="Brief meeting description..."
                  />
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() => setShowManualSetup(false)}
                    className="flex-1 py-3 px-6 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManualCreate}
                    className="flex-1 py-3 px-6 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    Create Meeting
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                      {invite.participants.map(participant => participant.email).join(', ')}
                    </p>
                    <p>
                      <span className="font-medium">Location: </span>
                      {invite.location || 'To be determined'}
                    </p>
                    <p>
                      <span className="font-medium">Proposed Times: </span>
                      {invite.proposedTimes.map(time => 
                        new Date(time.dateTime).toLocaleString()
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

        {isCreateModalOpen && (
          <CreateMeetiniForm
            onClose={() => {
              setIsCreateModalOpen(false);
              setInitialPrompt(null);
            }}
            initialPrompt={initialPrompt}
          />
        )}
      </main>
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
          show={toast.show}
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  );
}