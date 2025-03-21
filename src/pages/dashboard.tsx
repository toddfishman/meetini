import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Navbar from '../components/Navbar';
import ConfirmationDialog from '../components/ConfirmationDialog';
import Link from 'next/link';
import Toast from '../components/Toast';
import { FaCalendarAlt, FaChevronDown, FaChevronUp, FaCog, FaMicrophone, FaCalendarPlus, FaTimes } from 'react-icons/fa';
import UserPreferencesWrapper from '../components/UserPreferencesWrapper';
import { Box, Button } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import { UserPreferencesData } from '../types/preferences';

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

interface Participant {
  email: string | null;
  phoneNumber: string | null;
  name: string | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

interface MeetiniInvite {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'declined';
  type: 'sent' | 'received';
  participants: Participant[];
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
  query: string;
  type?: string;
  confidence?: number;
  suggestedTimes?: string[];
  message?: string;
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
  message?: string;
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

interface ErrorState {
  message: string;
  type?: string;
}

// Augment the window interface
declare global {
  var webkitSpeechRecognition: { new(): SpeechRecognition };
  var currentRecognition: SpeechRecognition | null;
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/');
    },
  });

  console.log('Dashboard Session:', {
    status,
    hasSession: !!session,
    hasAccessToken: !!session?.accessToken,
    hasUser: !!session?.user,
    user: session?.user,
  });

  const [meetiniInvites, setMeetiniInvites] = useState<MeetiniInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
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
  const [toastState, setToastState] = useState<ToastProps>({
    show: false,
    message: '',
    type: 'success',
    onClose: () => setToastState(prev => ({ ...prev, show: false }))
  });
  const [meetingType, setMeetingType] = useState<{ type: string | undefined; confidence: number }>({ type: undefined, confidence: 0 });
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferencesData>({
    workingHours: {
      start: '09:00',
      end: '17:00',
    },
    workDays: [1, 2, 3, 4, 5],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    meetingTypes: ['Virtual', 'In Person'],
    virtualPlatforms: ['Zoom', 'Google Meet', 'Microsoft Teams'],
    emailNotifications: true,
    smsNotifications: false,
    defaultDuration: 30,
    defaultMeetingType: 'virtual',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const MAX_PARTICIPANTS = 30;
  const PARTICIPANT_WARNING_THRESHOLD = 20;

  const [meetingDetails, setMeetingDetails] = useState({
    title: '',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    duration: 30,
    location: '',
    priority: 5,
    preferences: {
      virtual: false,
      inPerson: false,
      flexible: false
    },
    notes: ''
  });

  // Add state for manual setup
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<Contact[]>([]);
  const [manualMeetingDetails, setManualMeetingDetails] = useState({
    title: '',
    location: '',
    proposedTimes: [] as string[],
    preferences: {
      timePreference: '',
      durationType: '',
      locationType: ''
    }
  });

  const fetchInvites = useCallback(async () => {
    if (!session?.accessToken) {
      console.log('No access token available');
      return;
    }
    
    try {
      console.log('Fetching invites...');
      setInviteLoading(true);
      const response = await fetch('/api/meetini');
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to fetch invites:', error);
        throw new Error('Failed to fetch invites');
      }
      
      const data = await response.json();
      console.log('Received invites:', data);
      setMeetiniInvites(data);
    } catch (err) {
      console.error('Error fetching invites:', err);
      setError({ message: 'Failed to load invites' });
    } finally {
      setInviteLoading(false);
    }
  }, [session]);

  // Type guard for session status
  const isUnauthenticated = (status: string): status is 'unauthenticated' => status === 'unauthenticated';
  const isAuthenticated = (status: string): status is 'authenticated' => status === 'authenticated';

  useEffect(() => {
    if (status === 'loading') {
      console.log('Session loading...');
      return;
    }
    
    if (isAuthenticated(status) && session?.accessToken) {
      console.log('Session authenticated, fetching invites...');
      fetchInvites();
    } else if (isUnauthenticated(status)) {
      router.push('/');
    }
  }, [status, session, fetchInvites, router]);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.accessToken) {
      router.push('/');
      return;
    }
  }, [session, router, status]);

  useEffect(() => {
    if (status === 'loading') return;

    if (session?.accessToken) {
      fetchInvites().catch(console.error);
    }
  }, [status, session, fetchInvites]);

  useEffect(() => {
    if (isUnauthenticated(status)) {
      router.replace('/');
    } else if (isAuthenticated(status) && !session?.error) {
      // Only fetch data if we have a valid session
      fetchInvites().catch(console.error);
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

  useEffect(() => {
    const fetchPreferences = async () => {
      if (status !== 'authenticated') {
        console.log('Not authenticated yet, skipping preferences fetch');
        return;
      }
      
      try {
        console.log('Fetching preferences...');
        const response = await fetch('/api/preferences');
        console.log('Preferences response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          
          // If not authenticated, redirect to login
          if (response.status === 401) {
            console.log('Not authenticated, redirecting to login');
            router.push('/');
            return;
          }
          
          throw new Error(`Failed to fetch preferences: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Preferences data:', data);
        setPreferences(data);
      } catch (error) {
        console.error('Error fetching preferences:', error);
      }
    };

    fetchPreferences();
  }, [status, router]);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.accessToken) {
      router.push('/');
      return;
    }
  }, [session, router, status]);

  useEffect(() => {
    if (status === 'loading') return;

    if (session?.accessToken) {
      fetchInvites().catch(console.error);
    }
  }, [status, session, fetchInvites]);

  useEffect(() => {
    if (isUnauthenticated(status)) {
      router.replace('/');
    } else if (isAuthenticated(status) && !session?.error) {
      // Only fetch data if we have a valid session
      fetchInvites().catch(console.error);
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

  // Handle manual contact search
  const handleManualContactSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setManualSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search contacts');
      }

      const contacts = Object.values(data.contacts)
        .flat()
        .filter((contact): contact is Contact => 
          contact !== null &&
          typeof contact === 'object' &&
          'email' in contact &&
          'name' in contact
        );

      setManualSearchResults(contacts);
    } catch (error) {
      console.error('Manual contact search error:', error);
      setError({
        message: error instanceof Error ? error.message : 'Failed to search contacts',
        type: 'error'
      });
    }
  }, []);

  // Handle adding a contact to the manual list
  const handleAddContact = useCallback((contact: Contact) => {
    setManualContacts(prev => {
      // Don't add if already exists
      if (prev.some(c => c.email === contact.email)) {
        return prev;
      }
      return [...prev, contact];
    });
  }, []);

  // Handle removing a contact from the manual list
  const handleRemoveContact = useCallback((email: string) => {
    setManualContacts(prev => prev.filter(c => c.email !== email));
  }, []);

  // Handle manual setup submission
  const handleManualSetup = useCallback(async () => {
    if (manualContacts.length === 0) {
      setError({
        message: 'Please add at least one contact',
        type: 'error'
      });
      return;
    }

    if (!meetingDetails.title) {
      setError({
        message: 'Please enter a title for the meeting',
        type: 'error'
      });
      return;
    }

    try {
      const response = await fetch('/api/meetini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: meetingDetails.title,
          location: meetingDetails.location,
          contacts: manualContacts.map(contact => ({
            email: contact.email,
            name: contact.name,
            type: 'email'
          })),
          proposedTimes: [{
            date: meetingDetails.startDate,
            time: meetingDetails.startTime,
            duration: meetingDetails.duration
          }],
          preferences: {
            priority: meetingDetails.priority,
            ...meetingDetails.preferences
          },
          notes: meetingDetails.notes
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      // Reset state and show success message
      setManualContacts([]);
      setMeetingDetails({
        title: '',
        startDate: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        duration: 30,
        location: '',
        priority: 5,
        preferences: {
          virtual: false,
          inPerson: false,
          flexible: false
        },
        notes: ''
      });
      setIsCreateModalOpen(false);
      setToastState({
        show: true,
        message: 'Meetini created successfully',
        type: 'success',
        onClose: () => setToastState(prev => ({ ...prev, show: false }))
      });
      
      // Refresh invitations list
      fetchInvites();
    } catch (error) {
      console.error('Manual setup error:', error);
      setError({
        message: error instanceof Error ? error.message : 'Failed to create invitation',
        type: 'error'
      });
    }
  }, [manualContacts, meetingDetails, fetchInvites]);

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
    setToastState({
      show: true,
      message,
      type,
      onClose: () => setToastState(prev => ({ ...prev, show: false }))
    });

    // Auto-hide after 5 seconds
    setTimeout(() => setToastState(prev => ({ ...prev, show: false })), 5000);
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

      console.log('Searching contacts with query:', query);
      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      
      // Handle non-JSON responses first
      let data: SearchResponse;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse response:', e);
        throw new Error('Invalid response from server');
      }

      // Handle API errors
      if (!response.ok) {
        console.error('API error:', { 
          status: response.status, 
          statusText: response.statusText,
          data 
        });
        throw new Error(data.error || data.message || `Server error: ${response.status}`);
      }

      // Handle application errors
      if (data.error) {
        console.error('Application error:', data);
        throw new Error(data.error);
      }

      // Validate response structure
      if (!data.contacts || typeof data.contacts !== 'object') {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from contact search');
      }

      // Process contacts according to our confidence scoring system
      const allContacts = Object.values(data.contacts)
        .flat()
        .filter((contact): contact is Contact => 
          contact !== null &&
          typeof contact === 'object' &&
          'email' in contact &&
          typeof contact.email === 'string' &&
          'name' in contact &&
          typeof contact.name === 'string' &&
          'confidence' in contact &&
          typeof contact.confidence === 'number'
        )
        .sort((a, b) => b.confidence - a.confidence)
        .filter((contact, index, self) => 
          index === self.findIndex(c => c.email === contact.email)
        );

      if (allContacts.length === 0) {
        console.log('No contacts found for query:', query);
        setMeetingSummary(null);
        return;
      }

      console.log('Found contacts:', {
        total: allContacts.length,
        highConfidence: allContacts.filter(c => c.confidence >= 0.9).length,
        mediumConfidence: allContacts.filter(c => c.confidence >= 0.85 && c.confidence < 0.9).length,
        lowConfidence: allContacts.filter(c => c.confidence >= 0.7 && c.confidence < 0.85).length
      });

      const detectedType = detectMeetingType(query);
      
      setMeetingSummary(prev => {
        if (prev && 
            prev.contacts.length === allContacts.length && 
            prev.contacts.every((c, i) => c.email === allContacts[i].email)) {
          return prev;
        }
        return {
          contacts: allContacts,
          query: query,
          type: detectedType.type,
          confidence: detectedType.confidence,
          suggestedTimes: prev?.suggestedTimes || []
        };
      });

      // Auto-select high confidence matches (90% or higher)
      const highConfidenceContacts = allContacts.filter(contact => contact.confidence >= 0.9);
      if (highConfidenceContacts.length > 0) {
        setSelectedContacts(prev => {
          const newSet = new Set(prev);
          highConfidenceContacts.forEach(contact => newSet.add(contact.email));
          return newSet;
        });
      }
    } catch (error) {
      console.error('Contact search error:', error);
      setError({
        message: error instanceof Error ? error.message : 'Failed to search contacts',
        type: 'error'
      });
      setMeetingSummary(null);
      setSelectedContacts(new Set());
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, detectMeetingType]);

  // Memoize the debounced search function
  const debouncedSearchContacts = useMemo(() => 
    debounce((query: string) => {
      // Only clear everything if the field is completely empty
      if (!query.trim()) {
        setMeetingSummary(null);
        setSelectedContacts(new Set());
        setIsProcessing(false);
        setIsPendingSearch(false);
        return;
      }

      // Don't trigger search until we have at least 2 characters
      // But don't clear the previous results either
      if (query.length < 2) {
        setIsProcessing(false);
        setIsPendingSearch(false);
        return;
      }

      // Now we're actually searching
      setIsProcessing(true);
      setIsPendingSearch(false);
      searchContacts(query);
    }, 3000), // 3s debounce
    [searchContacts]
  );

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    if (newValue.length >= 2) {
      setIsPendingSearch(true);
    } else {
      setIsPendingSearch(false);
    }
    debouncedSearchContacts(newValue);
  }, [debouncedSearchContacts]);

  const handleSearch = useCallback(async () => {
    if (prompt.length < 2 || isProcessing) return;
    
    setIsProcessing(true);
    setError(null);
    setMeetingSummary(null);

    try {
      console.log('Manual search triggered for query:', prompt);
      const response = await fetch(`/api/contacts/search?q=${encodeURIComponent(prompt)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      // Handle non-JSON responses first
      let data: SearchResponse;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse response:', e);
        throw new Error('Invalid response from server');
      }

      // Handle API errors
      if (!response.ok) {
        console.error('API error:', { 
          status: response.status, 
          statusText: response.statusText,
          data 
        });
        throw new Error(data.error || data.message || `Server error: ${response.status}`);
      }

      // Handle application errors
      if (data.error) {
        console.error('Application error:', data);
        throw new Error(data.error);
      }

      // Validate response structure
      if (!data.contacts || typeof data.contacts !== 'object') {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from contact search');
      }

      // Process contacts according to our confidence scoring system
      const allContacts = Object.values(data.contacts)
        .flat()
        .filter((contact): contact is Contact => 
          contact !== null &&
          typeof contact === 'object' &&
          'email' in contact &&
          typeof contact.email === 'string' &&
          'name' in contact &&
          typeof contact.name === 'string' &&
          'confidence' in contact &&
          typeof contact.confidence === 'number'
        )
        .sort((a, b) => b.confidence - a.confidence)
        .filter((contact, index, self) => 
          index === self.findIndex(c => c.email === contact.email)
        );

      if (allContacts.length === 0) {
        console.log('No contacts found for query:', prompt);
        setMeetingSummary(null);
        return;
      }

      console.log('Found contacts:', {
        total: allContacts.length,
        highConfidence: allContacts.filter(c => c.confidence >= 0.9).length,
        mediumConfidence: allContacts.filter(c => c.confidence >= 0.85 && c.confidence < 0.9).length,
        lowConfidence: allContacts.filter(c => c.confidence >= 0.7 && c.confidence < 0.85).length
      });

      const detectedType = detectMeetingType(prompt);
      
      setMeetingSummary({
        contacts: allContacts,
        query: prompt,
        type: detectedType.type,
        confidence: detectedType.confidence,
        suggestedTimes: [],
        message: data.message
      });

      // Auto-select high confidence matches (90% or higher)
      const highConfidenceContacts = allContacts.filter(contact => contact.confidence >= 0.9);
      if (highConfidenceContacts.length > 0) {
        setSelectedContacts(prev => {
          const newSet = new Set(prev);
          highConfidenceContacts.forEach(contact => newSet.add(contact.email));
          return newSet;
        });
      }
    } catch (err) {
      console.error('Search error:', err);
      
      // Extract most useful error message
      let errorMessage = 'Failed to process request';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError({
        message: errorMessage,
        type: 'error'
      });
      setMeetingSummary(null);
      setSelectedContacts(new Set());
    } finally {
      setIsProcessing(false);
    }
  }, [prompt, isProcessing, detectMeetingType]);

  const startListening = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError({
        message: 'Speech recognition is not supported in your browser. Please use Chrome.',
        type: 'error'
      });
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
          setTranscript(transcript);
          debouncedSearchContacts(transcript);
        }
      };

      recognition.onerror = (event: Event) => {
        // Only show error if it's not a "no-speech" error when stopping
        const error = event as unknown as { error: string };
        if (error.error !== 'no-speech') {
          console.error('Speech recognition error:', event);
          setError({
            message: 'Failed to recognize speech. Please try again.',
            type: 'error'
          });
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
      setError({
        message: 'Failed to start voice recognition. Please try again.',
        type: 'error'
      });
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

  const createMeetini = useCallback(async () => {
    try {
      if (!session) {
        console.error('No session available');
        throw new Error('Not authenticated');
      }

      if (!session.accessToken) {
        console.error('No access token available', { session });
        throw new Error('Missing access token');
      }

      if (!session.user?.email) {
        console.error('No user email available');
        throw new Error('User email not available');
      }

      setIsProcessing(true);

      // Format participants
      const participants = [
        {
          email: session.user.email,
          name: session.user.name || session.user.email.split('@')[0],
          notifyByEmail: true
        },
        ...Array.from(selectedContacts).map(email => ({
          email,
          name: meetingSummary?.contacts.find(c => c.email === email)?.name,
          notifyByEmail: true
        }))
      ];

      // Format date and time
      const startDateTime = new Date(`${meetingDetails.startDate}T${meetingDetails.startTime}`);
      const endDateTime = new Date(startDateTime.getTime() + meetingDetails.duration * 60000);

      // Make the API request
      const response = await fetch('/api/meetini/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({
          invite: {
            title: prompt || `${meetingDetails.preferences.virtual ? 'Virtual ' : ''}${meetingDetails.preferences.inPerson ? 'In-Person ' : ''}Meeting`,
            type: meetingSummary?.type || 'meeting',
            description: meetingDetails.notes 
              ? `${meetingDetails.notes}\n\nCreated via Meetini${prompt ? `\nOriginal prompt: ${prompt}` : ''}`
              : `Created via Meetini${prompt ? `\nOriginal prompt: ${prompt}` : ''}`,
            participants,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            duration: meetingDetails.duration,
            location: meetingDetails.location || (meetingDetails.preferences.virtual ? 'Virtual' : undefined),
            priority: meetingDetails.priority,
            preferences: {
              virtual: meetingDetails.preferences.virtual,
              inPerson: meetingDetails.preferences.inPerson,
              flexible: meetingDetails.preferences.flexible
            },
            createdBy: session.user.email
          }
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to create meeting (${response.status})`);
      }

      // Show success message
      const successMessage = data.unregisteredParticipants > 0
        ? `✨ Success! Sent ${data.registeredParticipants} invites and ${data.unregisteredParticipants} signup prompts`
        : '✨ Success! Sending invitations...';

      setToastState({
        show: true,
        message: successMessage,
        type: 'success',
        onClose: () => setToastState(prev => ({ ...prev, show: false }))
      });
      
      // Clear form
      setPrompt('');
      setSelectedContacts(new Set());
      setMeetingSummary(null);
      setMeetingDetails({
        startDate: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        duration: 30,
        location: '',
        priority: 5,
        preferences: {
          virtual: false,
          inPerson: false,
          flexible: true
        },
        notes: ''
      });
      setIsCreateModalOpen(false);

      // Refresh invites
      fetchInvites();
    } catch (error) {
      console.error('Failed to create meeting:', error);
      setToastState({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to create meeting',
        type: 'error',
        onClose: () => setToastState(prev => ({ ...prev, show: false }))
      });
    } finally {
      setIsProcessing(false);
    }
  }, [session, prompt, selectedContacts, meetingSummary, meetingDetails, fetchInvites]);

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
            throw new Error(data.error || `Failed to ${action} invitation`);
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

          setToastState({
            show: true,
            message: `Successfully ${action}ed the invitation`,
            type: 'success',
            onClose: () => setToastState(prev => ({ ...prev, show: false }))
          });
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));

        } catch (error) {
          console.error('Failed to update invitation:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to update invitation';
          setError({
            message: errorMessage,
            type: 'error'
          });
          setToastState({
            show: true,
            message: errorMessage,
            type: 'error',
            onClose: () => setToastState(prev => ({ ...prev, show: false }))
          });
        }
      }
    });
  }, [setToastState]);

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
    if (status === 'loading') return;

    if (!session?.accessToken) {
      router.push('/');
      return;
    }
  }, [session, router, status]);

  useEffect(() => {
    if (status === 'loading') return;

    if (session?.accessToken) {
      fetchInvites().catch(console.error);
    }
  }, [status, session, fetchInvites]);

  useEffect(() => {
    if (isUnauthenticated(status)) {
      router.replace('/');
    } else if (isAuthenticated(status) && !session?.error) {
      // Only fetch data if we have a valid session
      fetchInvites().catch(console.error);
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

  // Move filteredInvites definition before the return statement
  const filteredInvites = meetiniInvites.filter(invite => invite.type === activeTab);
  console.log('Filtering invites:', { activeTab, invites: meetiniInvites, filtered: filteredInvites });

  const handlePreferenceChange = useCallback((key: keyof UserPreferencesData, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleWorkDayToggle = useCallback((day: number) => {
    setPreferences(prev => {
      const newWorkDays = prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day].sort();
      return { ...prev, workDays: newWorkDays };
    });
  }, []);

  const handleMeetingTypeToggle = useCallback((type: string) => {
    setPreferences(prev => {
      const newTypes = prev.meetingTypes.includes(type)
        ? prev.meetingTypes.filter(t => t !== type)
        : [...prev.meetingTypes, type];
      return { ...prev, meetingTypes: newTypes };
    });
  }, []);

  const handlePlatformToggle = useCallback((platform: string) => {
    setPreferences(prev => {
      const newPlatforms = prev.virtualPlatforms.includes(platform)
        ? prev.virtualPlatforms.filter(p => p !== platform)
        : [...prev.virtualPlatforms, platform];
      return { ...prev, virtualPlatforms: newPlatforms };
    });
  }, []);

  const handleSavePreferences = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      setToastState({
        show: true,
        message: 'Preferences saved successfully',
        type: 'success',
        onClose: () => setToastState(prev => ({ ...prev, show: false }))
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setToastState({
        show: true,
        message: 'Failed to save preferences',
        type: 'error',
        onClose: () => setToastState(prev => ({ ...prev, show: false }))
      });
    } finally {
      setIsSaving(false);
    }
  }, [preferences]);

  const resetMeetingDetails = () => {
    setMeetingDetails({
      title: '',
      startDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      duration: 30,
      location: '',
      priority: 5,
      preferences: {
        virtual: false,
        inPerson: false,
        flexible: false
      },
      notes: ''
    });
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#1a1d1e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22c55e]"></div>
      </div>
    );
  }

  // Handle session errors
  if (session?.error === 'RefreshAccessTokenError') {
    return (
      <div className="min-h-screen bg-[#1a1d23] text-white">
        <div className="text-red-500">
          Session expired. Please sign in again.
        </div>
      </div>
    );
  }

  // Protect the route
  if (isUnauthenticated(status)) {
    return null; // Return null while redirecting
  }

  const renderInvitations = (invites: MeetiniInvite[]) => {
    if (invites.length === 0) {
      return (
        <div className="text-center text-gray-400 py-8">
          No {activeTab} invitations found
        </div>
      );
    }

    return invites.map(invite => (
      <div key={invite.id} className="bg-[#2f3336] p-6 rounded-lg mb-4">
        {/* ... rest of the invitation rendering code ... */}
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-[#1a1d23] text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Meeting Creation */}
          <div className="lg:col-span-2">
            <div className="bg-[#2f3336] p-8 rounded-lg mb-8">
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-3xl font-bold text-[#22c55e] tracking-tight">Make A Meetini Happen Here! 🍸</h1>
                </div>

                <div className="mb-6">
                  <div className="relative ring-1 ring-[#22c55e]/20 rounded-lg bg-[#1a1d23] shadow-lg hover:shadow-[#22c55e]/5 transition-shadow">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                      <button
                        onClick={isListening ? stopListening : startListening}
                        className={`p-2 rounded-full transition-colors ${
                          isListening ? 'text-red-500 animate-pulse' : 'text-[#22c55e] hover:text-[#22c55e]/80'
                        }`}
                      >
                        <FaMicrophone className="w-5 h-5" />
                      </button>
                    </div>
                    <textarea
                      value={prompt}
                      onChange={handlePromptChange}
                      placeholder="Talk or Text: e.g. Schedule a coffee with Joe tomorrow morning"
                      className={`w-full pl-14 pr-24 py-4 bg-transparent text-gray-100 rounded-lg focus:ring-2 focus:ring-[#22c55e] focus:border-transparent placeholder-gray-500 transition-all duration-200 ${
                        isProcessing ? 'opacity-50' : 'opacity-100'
                      } focus:shadow-[0_0_15px_rgba(34,197,94,0.1)]`}
                      rows={3}
                      disabled={isProcessing}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                      <button
                        onClick={() => setPrompt('')}
                        className={`p-2 text-gray-400 hover:text-white transition-colors ${
                          !prompt ? 'opacity-0' : 'opacity-100'
                        }`}
                        disabled={!prompt || isProcessing}
                      >
                        Clear
                      </button>
                      <button
                        onClick={handleSearch}
                        disabled={!prompt || isProcessing}
                        className={`px-4 py-2 bg-[#22c55e] text-white rounded-lg transition-colors ${
                          !prompt || isProcessing
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-[#22c55e]/80'
                        }`}
                      >
                        {isProcessing ? 'Processing...' : 'Search'}
                      </button>
                    </div>
                  </div>
                  {transcript && (
                    <p className="mt-2 text-sm text-gray-400">
                      Heard: {transcript}
                    </p>
                  )}
                  {error && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="flex items-center text-red-400">
                        <span className="text-sm">
                          {error.message}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual Setup Section */}
                <div className="mb-8 p-6 bg-[#1a1d23] rounded-lg border border-[#2f3336]">
                  <h3 className="text-xl font-semibold text-[#22c55e] mb-4">Manual Setup for Meetini</h3>
                  <div className="relative flex items-center">
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="absolute left-4 text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
                      aria-label="Open manual setup"
                    >
                      <FaCalendarPlus className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      placeholder="Click the calendar icon to manually set up a Meetini"
                      className="w-full pl-12 pr-4 py-3 bg-[#2f3336] border border-[#2f3336] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent cursor-pointer"
                      readOnly
                      onClick={() => setIsCreateModalOpen(true)}
                    />
                  </div>
                </div>

                {/* Meeting Summary */}
                {meetingSummary && (
                  <div className="mt-6 space-y-4">
                    {meetingSummary.message && (
                      <div className="text-sm text-gray-400">
                        {meetingSummary.message}
                      </div>
                    )}
                    <div className="bg-[#2f3336] rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-400 mb-3">Meeting Summary</h4>
                      <div className="space-y-4">
                        {/* Organizer */}
                        <div className="space-y-2">
                          <h5 className="text-xs font-medium text-gray-500">ORGANIZER</h5>
                          <div className="p-4 bg-[#2f3336]/50 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-full bg-[#22c55e] flex items-center justify-center text-white font-semibold">
                                {session?.user?.name?.[0] || session?.user?.email?.[0] || '?'}
                              </div>
                              <div className="ml-3">
                                <div className="font-medium">{session?.user?.name || 'You'}</div>
                                <div className="text-sm text-gray-400">{session?.user?.email}</div>
                              </div>
                              <div className="ml-auto">
                                <span className="px-2 py-1 text-xs bg-[#22c55e]/20 text-[#22c55e] rounded-full">
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
                            <span className="text-xs text-gray-400">
                              {selectedContacts.size}/{MAX_PARTICIPANTS - 1} max
                            </span>
                          </div>
                          <div className="space-y-2">
                            {selectedContacts.size > 0 ? (
                              Array.from(selectedContacts).map(email => {
                                const contact = meetingSummary.contacts.find(c => c.email === email);
                                return (
                                  <div key={email} className="p-4 bg-[#2f3336]/50 rounded-lg">
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
                                        className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-center p-4 bg-[#2f3336]/50 rounded-lg text-gray-400">
                                No participants selected
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Suggested Participants */}
                        <div className="space-y-2">
                          <h5 className="text-xs font-medium text-gray-500">SUGGESTED PARTICIPANTS</h5>
                          <div className="space-y-2">
                            {meetingSummary.contacts
                              .filter(contact => !selectedContacts.has(contact.email))
                              .sort((a, b) => b.confidence - a.confidence) // Sort by confidence
                              .map((contact, index) => (
                                <button
                                  key={`${contact.email}-${index}`}
                                  onClick={() => toggleContactSelection(contact.email)}
                                  disabled={selectedContacts.size >= MAX_PARTICIPANTS - 1}
                                  className={`w-full p-3 flex items-center justify-between bg-[#1a1d23] rounded hover:bg-[#1a1d23]/80 transition-colors ${
                                    selectedContacts.size >= MAX_PARTICIPANTS - 1
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 rounded-full bg-[#22c55e] flex items-center justify-center">
                                      <span className="text-white text-sm font-medium">
                                        {contact.name.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="text-left">
                                      <div className="text-sm font-medium text-white">{contact.name}</div>
                                      <div className="text-xs text-gray-400">{contact.email}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <div className="text-xs text-gray-400">
                                      Confidence: {Math.round(contact.confidence * 100)}%
                                    </div>
                                    {contact.confidence >= 0.9 && (
                                      <span className="px-2 py-1 text-xs bg-[#22c55e]/20 text-[#22c55e] rounded-full">
                                        Best Match
                                      </span>
                                    )}
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
                                : 'bg-[#22c55e] hover:bg-[#22c55e]/80 text-white'
                            }`}
                          >
                            {isProcessing ? 'Creating...' : 'Create Meeting'}
                          </button>
                        </div>
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
            <div className="bg-[#2f3336] p-6 rounded-lg sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#22c55e] tracking-tight">Your Calendar</h2>
                <button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
                >
                  {showCalendar ? 'Hide Calendar' : 'Show Calendar'}
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

            {/* Preferences Section */}
            <div className="bg-[#2f3336] p-6 rounded-lg sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#22c55e] tracking-tight">Your Preferences</h2>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setPreferencesOpen(true)}
                    startIcon={<SettingsIcon />}
                  >
                    Manage Preferences
                  </Button>
                </Box>
              </div>
            </div>

            {/* Invitations Section */}
            <div className="bg-[#2f3336] p-6 rounded-lg">
              <h2 className="text-2xl font-bold text-[#22c55e] tracking-tight mb-4">Your Meetini's</h2>
              
              <div className="flex space-x-4 mb-6">
                <button
                  onClick={() => setActiveTab('received')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'received'
                      ? 'bg-[#22c55e] text-white'
                      : 'bg-[#2f3336] text-gray-400 hover:bg-[#2f3336]/80'
                  }`}
                >
                  Received
                </button>
                <button
                  onClick={() => setActiveTab('sent')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'sent'
                      ? 'bg-[#22c55e] text-white'
                      : 'bg-[#2f3336] text-gray-400 hover:bg-[#2f3336]/80'
                  }`}
                >
                  Sent
                </button>
              </div>

              {inviteLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#22c55e] mx-auto"></div>
                </div>
              ) : filteredInvites.length > 0 ? (
                <div className="space-y-4">
                  {renderInvitations(filteredInvites)}
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
      {/* Modals */}
      <ConfirmationDialog {...confirmDialog} />
      <Toast {...toastState} />
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#2f3336] p-6 rounded-lg w-full max-w-6xl mx-4">
            <h2 className="text-2xl font-bold text-[#22c55e] mb-6">Create New Meetini</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Participants */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Participants
                  </label>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {manualContacts.length > 0 ? (
                      manualContacts.map(contact => (
                        <div key={contact.email} className="flex items-center justify-between p-3 bg-[#1a1d23] rounded-lg">
                          <div>
                            <div className="text-white">{contact.name}</div>
                            <div className="text-sm text-gray-400">{contact.email}</div>
                          </div>
                          <button
                            onClick={() => handleRemoveContact(contact.email)}
                            className="text-red-500 hover:text-red-400"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-500 text-center p-4">
                        No participants selected
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Participant */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Add Participant
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={manualSearchQuery}
                      onChange={(e) => {
                        setManualSearchQuery(e.target.value);
                        handleManualContactSearch(e.target.value);
                      }}
                      placeholder="Search contacts..."
                      className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    />
                    {manualSearchResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-[#1a1d23] rounded-lg border border-[#2f3336] z-10">
                        {manualSearchResults.map(contact => (
                          <div
                            key={contact.email}
                            className="flex items-center justify-between p-2 hover:bg-[#2f3336] cursor-pointer"
                            onClick={() => handleAddContact(contact)}
                          >
                            <div>
                              <div className="font-medium text-white">{contact.name}</div>
                              <div className="text-sm text-gray-400">{contact.email}</div>
                            </div>
                            <button className="px-2 py-1 text-sm bg-[#22c55e] text-white rounded hover:bg-[#22c55e]/80">
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Meeting Title */}
                <div>
                  <label htmlFor="meetingTitle" className="block text-sm font-medium text-gray-400 mb-2">
                    Meeting Title
                  </label>
                  <input
                    type="text"
                    id="meetingTitle"
                    placeholder="Enter meeting title"
                    className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    value={meetingDetails.title}
                    onChange={(e) => setMeetingDetails(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-400 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                      value={meetingDetails.startDate}
                      onChange={(e) => setMeetingDetails(prev => ({ ...prev, startDate: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label htmlFor="startTime" className="block text-sm font-medium text-gray-400 mb-2">
                      Time
                    </label>
                    <input
                      type="time"
                      id="startTime"
                      className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                      value={meetingDetails.startTime}
                      onChange={(e) => setMeetingDetails(prev => ({ ...prev, startTime: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label htmlFor="duration" className="block text-sm font-medium text-gray-400 mb-2">
                    Duration (minutes)
                  </label>
                  <select
                    id="duration"
                    className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    value={meetingDetails.duration}
                    onChange={(e) => setMeetingDetails(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-5">
                {/* Priority */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-400 mb-2">
                    Priority (1-10, higher is more urgent)
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      id="priority"
                      min="1"
                      max="10"
                      step="1"
                      className="w-full h-2 bg-[#1a1d23] rounded-lg appearance-none cursor-pointer accent-[#22c55e]"
                      value={meetingDetails.priority}
                      onChange={(e) => setMeetingDetails(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                    />
                    <span className="text-white font-medium w-8 text-center">
                      {meetingDetails.priority}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>Low Priority</span>
                    <span>ASAP</span>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-400 mb-2">
                    Location (optional)
                  </label>
                  <input
                    type="text"
                    id="location"
                    placeholder="Enter location or leave blank for virtual"
                    className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    value={meetingDetails.location}
                    onChange={(e) => setMeetingDetails(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>

                {/* Meeting Preferences */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Meeting Preferences
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setMeetingDetails(prev => ({
                        ...prev,
                        preferences: { ...prev.preferences, virtual: !prev.preferences.virtual }
                      }))}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        meetingDetails.preferences.virtual
                          ? 'bg-[#22c55e] text-white'
                          : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                      }`}
                    >
                      Virtual
                    </button>
                    <button
                      onClick={() => setMeetingDetails(prev => ({
                        ...prev,
                        preferences: { ...prev.preferences, inPerson: !prev.preferences.inPerson }
                      }))}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        meetingDetails.preferences.inPerson
                          ? 'bg-[#22c55e] text-white'
                          : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                      }`}
                    >
                      In Person
                    </button>
                    <button
                      onClick={() => setMeetingDetails(prev => ({
                        ...prev,
                        preferences: { ...prev.preferences, flexible: !prev.preferences.flexible }
                      }))}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        meetingDetails.preferences.flexible
                          ? 'bg-[#22c55e] text-white'
                          : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                      }`}
                    >
                      Flexible
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-400 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    id="notes"
                    placeholder="Add any additional notes or context"
                    className="w-full px-4 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    rows={4}
                    value={meetingDetails.notes}
                    onChange={(e) => setMeetingDetails(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4 pt-6 mt-6 border-t border-[#1a1d23]">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSetup}
                disabled={isProcessing || manualContacts.length === 0 || !meetingDetails.title}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  isProcessing || manualContacts.length === 0 || !meetingDetails.title
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-[#22c55e] hover:bg-[#22c55e]/80 text-white'
                }`}
              >
                {isProcessing ? 'Creating...' : 'Create Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
      {preferencesOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#2f3336] p-6 rounded-lg w-full max-w-4xl mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#22c55e]">Meeting Preferences</h2>
              <button
                onClick={() => setPreferencesOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-8">
              {/* Calendar Preferences */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Calendar Preferences</h3>
                <div className="space-y-4">
                  {/* Working Hours */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Working Hours
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={preferences.workingHours.start}
                          onChange={(e) => handlePreferenceChange('workingHours', { ...preferences.workingHours, start: e.target.value })}
                          className="w-full px-3 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End Time</label>
                        <input
                          type="time"
                          value={preferences.workingHours.end}
                          onChange={(e) => handlePreferenceChange('workingHours', { ...preferences.workingHours, end: e.target.value })}
                          className="w-full px-3 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Working Days */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Working Days
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                        <button
                          key={day}
                          onClick={() => handleWorkDayToggle(index)}
                          className={`px-3 py-1 rounded-lg transition-colors ${
                            preferences.workDays.includes(index)
                              ? 'bg-[#22c55e] text-white'
                              : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Timezone
                    </label>
                    <select
                      value={preferences.timezone}
                      onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
                      className="w-full px-3 py-2 bg-[#1a1d23] border border-[#2f3336] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                    >
                      {Intl.supportedValuesOf('timeZone').map(timezone => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Meeting Preferences */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Meeting Preferences</h3>
                <div className="space-y-4">
                  {/* Location Preferences */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Preferred Meeting Types
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Virtual', 'In Person', 'Flexible'].map(type => (
                        <button
                          key={type}
                          onClick={() => handleMeetingTypeToggle(type)}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            preferences.meetingTypes.includes(type)
                              ? 'bg-[#22c55e] text-white'
                              : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Virtual Meeting Platforms */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Preferred Virtual Platforms
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Zoom', 'Google Meet', 'Microsoft Teams'].map(platform => (
                        <button
                          key={platform}
                          onClick={() => handlePlatformToggle(platform)}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            preferences.virtualPlatforms.includes(platform)
                              ? 'bg-[#22c55e] text-white'
                              : 'bg-[#1a1d23] text-gray-400 hover:bg-[#1a1d23]/80'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end mt-8 pt-6 border-t border-[#1a1d23]">
              <button
                onClick={handleSavePreferences}
                disabled={isSaving}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  isSaving
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-[#22c55e] hover:bg-[#22c55e]/80 text-white'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      )}
      <UserPreferencesWrapper
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        preferences={preferences}
        onPreferenceChange={handlePreferenceChange}
        onWorkDayToggle={handleWorkDayToggle}
      />
    </div>
  );
}