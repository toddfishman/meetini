import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaMicrophone, FaMicrophoneSlash, FaUserPlus, FaTimes, FaSearch, FaCheck, FaStar } from 'react-icons/fa';

interface Contact {
  email: string;
  name: string;
  displayName?: string;
  confidence?: number;
  primary?: boolean;
  source?: string;
  matchScore?: number;
  isTodd?: boolean;
}

interface ContentItem {
  text: {
    value: string;
  };
}

interface MessageContent {
  content: string | ContentItem[] | ContentItem;
}

interface ChatResponse {
  messages: (string | MessageContent)[] | string;
  threadId: string;
  contactSuggestions?: Array<{
    name: string;
    email: string;
  }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string[];
  id: string;
}

interface MeetiniChatProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPrompt?: string;
  embedded?: boolean;
}

interface APIContact {
  name: string;
  email: string;
  confidence?: number;
  source?: string;
  primary?: boolean;
}

export default function MeetiniChat({ isOpen, onClose, onSuccess, initialPrompt, embedded = false }: MeetiniChatProps) {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: ['Hi! I can help you schedule a meeting. Just tell me who you want to meet with and any other details you\'d like to include.'],
    id: 'initial'
  }]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [suggestedContacts, setSuggestedContacts] = useState<Contact[]>([]);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactSearchInput, setContactSearchInput] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<Contact[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add new useEffect for initial scroll position
  useEffect(() => {
    if (isOpen) {
      window.scrollTo(0, 0);
    }
  }, [isOpen]);

  const startListening = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      setRecordingError('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    try {
      const recognition = new window.webkitSpeechRecognition();
      window.currentRecognition = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        
        if (transcript) {
          setInputValue(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.error('Speech recognition error:', event);
          setRecordingError('Failed to recognize speech. Please try again.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setIsListening(true);
      recognition.start();
    } catch (error) {
      console.error('Speech recognition error:', error);
      setRecordingError('Failed to start voice recognition. Please try again.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (window.currentRecognition) {
      window.currentRecognition.stop();
      window.currentRecognition = null;
    }
    setIsListening(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    setIsProcessing(true);
    const userMessage: Message = {
      role: 'user',
      content: [inputValue.trim()],
      id: `user-${Date.now()}`
    };

    // Add the user's message to our local state
    setMessages((prevMessages: Message[]) => [...prevMessages, userMessage]);
    setInputValue('');

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputValue.trim(),
          threadId,
          selectedContacts: selectedContacts.map(c => ({ email: c.email, name: c.name }))
        }),
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const data: ChatResponse = await response.json();
      setThreadId(data.threadId);

      // Extract ONLY the assistant's response, not all messages
      if (Array.isArray(data.messages)) {
        // Find only the most recent assistant message in the response
        const assistantMessages = data.messages.filter(msg => 
          (typeof msg === 'object' && 'role' in msg && msg.role === 'assistant')
        );
        
        if (assistantMessages.length > 0) {
          // Get the most recent assistant message
          const latestAssistantMsg = assistantMessages[0];
          
          // Extract the content from this message
          let messageContent: string[] = [];
          
          if (typeof latestAssistantMsg === 'object' && latestAssistantMsg.content) {
            // Handle array of content items
            if (Array.isArray(latestAssistantMsg.content)) {
              messageContent = latestAssistantMsg.content.map(item => {
                if (typeof item === 'string') return item;
                if (item.text) return item.text.value || '';
                return '';
              }).filter(Boolean);
            }
            // Handle single content item
            else if (typeof latestAssistantMsg.content === 'string') {
              messageContent = [latestAssistantMsg.content];
            }
            else if (latestAssistantMsg.content.text) {
              messageContent = [latestAssistantMsg.content.text.value || ''];
            }
          }
          
          // Only add the assistant message if we extracted content
          if (messageContent.length > 0) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: messageContent,
              id: `assistant-${Date.now()}`
            };
            
            setMessages((prevMessages: Message[]) => [...prevMessages, assistantMessage]);
          }
        }
      }

      if (data.contactSuggestions) {
        setSuggestedContacts(data.contactSuggestions.map(contact => ({
          ...contact,
          confidence: 1,
        })));
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: ['Sorry, I encountered an error. Please try again.'],
        id: `error-${Date.now()}`
      };
      setMessages((prevMessages: Message[]) => [...prevMessages, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContactSearchInput(value);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Show loading state immediately for better UX, but only if we have a value
    if (value.trim()) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
      setContactSearchResults([]);
      return;
    }

    // Debounce the search with a 300ms delay
    searchTimeoutRef.current = setTimeout(() => {
      handleContactSearch(value);
    }, 300);
  };

  const handleContactSearch = useCallback(
    async (query: string) => {
      console.log(`Searching for contacts with query: "${query}"`);
      if (!query.trim() || query.length < 2) {
        setContactSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      
      try {
        // Make the API call to get real contacts
        console.log(`Using POST /api/contacts/search for query: "${query}"`);
        
        const response = await fetch('/api/contacts/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          credentials: 'include'
        });
        
        console.log(`API Response status: ${response.status}`);
        
        if (!response.ok) {
          console.error(`Search request failed with status: ${response.status}`);
          setContactSearchResults([]);
          setIsSearching(false);
          return;
        }
        
        const data = await response.json();
        console.log(`API response received for "${query}":`, data);
        
        // Extract contacts from all possible response structures
        let contactsList: any[] = [];
        
        // Extract from contacts object (key-value pairs)
        if (data.contacts && typeof data.contacts === 'object') {
          // Handle array format
          if (Array.isArray(data.contacts)) {
            console.log(`Found ${data.contacts.length} contacts in array format`);
            contactsList = [...contactsList, ...data.contacts];
          } else {
            // Handle object format from the backend
            console.log('Found contacts in object format, extracting...');
            Object.keys(data.contacts).forEach(key => {
              const contactsForKey = data.contacts[key];
              if (Array.isArray(contactsForKey)) {
                console.log(`Found ${contactsForKey.length} contacts for key "${key}"`);
                contactsList = [...contactsList, ...contactsForKey];
              } else if (contactsForKey && typeof contactsForKey === 'object') {
                console.log(`Found single contact for key "${key}"`);
                contactsList.push(contactsForKey);
              }
            });
          }
        }
        
        // Handle sources structure if present
        if (data.sources) {
          Object.keys(data.sources).forEach(source => {
            if (Array.isArray(data.sources[source])) {
              console.log(`Found ${data.sources[source].length} contacts in source "${source}"`);
              contactsList = [...contactsList, ...data.sources[source]];
            }
          });
        }
        
        // Handle array at the root level
        if (Array.isArray(data)) {
          console.log(`Found ${data.length} contacts at root level`);
          contactsList = [...contactsList, ...data];
        }
        
        console.log(`Total unique contacts extracted from API: ${contactsList.length}`);
        
        // If we still don't have any contacts, try the direct API endpoint as backup
        if (contactsList.length === 0 && query.length >= 3) {
          console.log(`No contacts found, trying direct search API for "${query}"...`);
          try {
            const directResponse = await fetch(`/api/contacts/unified-search?query=${encodeURIComponent(query)}`, {
              credentials: 'include'
            });
            
            if (directResponse.ok) {
              const directData = await directResponse.json();
              console.log(`Direct search API response:`, directData);
              
              if (directData.contacts && Array.isArray(directData.contacts)) {
                console.log(`Found ${directData.contacts.length} contacts from direct search`);
                contactsList = [...contactsList, ...directData.contacts];
              }
            }
          } catch (directError) {
            console.error('Error with direct search:', directError);
          }
        }
        
        // If still no results and query looks like an email, suggest it as a contact
        if (contactsList.length === 0 && query.includes('@') && query.includes('.')) {
          const suggestedContact = {
            name: query.split('@')[0],
            email: query,
            displayName: query.split('@')[0],
            confidence: 1,
            source: 'manual',
            matchScore: 500
          };
          setContactSearchResults([suggestedContact]);
          console.log("Using email suggestion for empty results");
          setIsSearching(false);
          return;
        }
        
        // Process and deduplicate the contacts
        const dedupMap = new Map<string, Contact>();
        
        contactsList.forEach((contact: any) => {
          // Skip invalid contacts
          if (!contact || !contact.email) {
            return;
          }
          
          const email = contact.email.toLowerCase();
          const existingContact = dedupMap.get(email);
          
          // Calculate match score
          const matchScore = calculateMatchScore(contact, query);
          
          // Skip duplicates with lower scores
          if (existingContact && (existingContact.matchScore || 0) >= matchScore) {
            return;
          }
          
          // Create standardized contact object
          const processedContact: Contact = {
            name: contact.name || email.split('@')[0],
            email: contact.email,
            displayName: contact.primary ? `${contact.name || email.split('@')[0]} ⭐` : (contact.name || email.split('@')[0]),
            confidence: contact.confidence || 0.5,
            source: contact.source || 'search',
            primary: contact.primary || false,
            matchScore: matchScore,
            isTodd: (contact.name || '').toLowerCase().includes('todd') || email.toLowerCase().includes('todd')
          };
          
          dedupMap.set(email, processedContact);
        });
        
        // Convert to array and sort by match score
        let processedContacts = Array.from(dedupMap.values());
        
        // Sort by match score and primary status
        processedContacts.sort((a, b) => {
          // Primary contacts first
          if (a.primary && !b.primary) return -1;
          if (!a.primary && b.primary) return 1;
          
          // Then by match score
          return (b.matchScore || 0) - (a.matchScore || 0);
        });
        
        // Display at most 10 results
        const resultsToShow = processedContacts.slice(0, 10);
        
        console.log(`Displaying ${resultsToShow.length} contacts:`, 
          resultsToShow.map(c => `${c.name} <${c.email}>`).join(', '));
        
        setContactSearchResults(resultsToShow);
      } catch (error) {
        console.error('Error searching contacts:', error);
        setContactSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );
  
  // Helper function to calculate match score for sorting
  const calculateMatchScore = (contact: any, query: string) => {
    const lowerQuery = query.toLowerCase();
    const lowerName = (contact.name || '').toLowerCase();
    const lowerEmail = contact.email.toLowerCase();
    
    let score = 0;
    
    // Exact matches
    if (lowerName === lowerQuery) score += 100;
    else if (lowerEmail === lowerQuery) score += 90;
    
    // First name matches
    const firstNameMatch = lowerName.split(' ')[0] === lowerQuery;
    if (firstNameMatch) score += 80;
    
    // Name contains query
    if (lowerName.includes(lowerQuery)) score += 60;
    
    // Email contains query
    if (lowerEmail.includes(lowerQuery)) score += 40;
    
    // Primary contact bonus
    if (contact.primary) score += 30;
    
    // Confidence score bonus (0-20 points)
    score += (contact.confidence || 0) * 20;
    
    return score;
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const addContact = (contact: Contact) => {
    // Validate email format
    if (!contact.email || !contact.email.includes('@')) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Please provide a valid email address for the contact.'],
        id: `error-${Date.now()}`
      }]);
      return;
    }
    
    // Check if contact already exists
    if (selectedContacts.some(c => c.email.toLowerCase() === contact.email.toLowerCase())) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: [`${contact.name} is already added to the meeting.`],
        id: `info-${Date.now()}`
      }]);
    } else {
      setSelectedContacts(prev => [...prev, contact]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: [`Added ${contact.name} to the meeting.`],
        id: `system-${Date.now()}`
      }]);
    }
    
    // Reset search state
    setContactSearchInput('');
    setContactSearchResults([]);
    setIsSearching(false);
  };

  const removeContact = (email: string) => {
    const contact = selectedContacts.find(c => c.email.toLowerCase() === email.toLowerCase());
    
    if (contact) {
      setSelectedContacts(prev => prev.filter(c => c.email.toLowerCase() !== email.toLowerCase()));
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: [`Removed ${contact.name} from the meeting.`],
        id: `system-${Date.now()}`
      }]);
    }
  };

  const handleSendMeetini = async () => {
    if (selectedContacts.length === 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Please select contacts for the meeting first.'],
        id: 'error-' + Date.now()
      }]);
      return;
    }

    setIsProcessing(true);
    try {
      // First get the session token to ensure we're authenticated
      const session = await fetch('/api/auth/session');
      if (!session.ok) {
        throw new Error('Authentication session not available - please try refreshing the page');
      }
      
      // Extract message context from all user messages
      const messageContext = messages
        .filter(m => m.role === 'user')
        .map(m => m.content.join(' '))
        .join('\n');
      
      console.log('Creating Meetini with message context:', messageContext);
      console.log('Selected participants:', selectedContacts);
      
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageContext,
          participants: selectedContacts.map(c => c.email)
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('AI create response error:', response.status, errorData);
        throw new Error(errorData.error || `Failed to create Meetini (${response.status})`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (!data.suggestedTimes?.length) {
        throw new Error('No suggested times available. Please try again.');
      }
      
      console.log('AI create response successful with suggested times:', data.suggestedTimes);

      const createResponse = await fetch('/api/meetini/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invite: {
            title: data.title || 'Meetini',
            description: data.description,
            type: messageContext,
            participants: selectedContacts.map(c => ({ email: c.email, name: c.name })),
            suggestedTimes: data.suggestedTimes,
            createdBy: 'user'
          }
        }),
        credentials: 'include'
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Create Meetini response error:', createResponse.status, errorData);
        throw new Error(errorData.error || `Failed to create calendar event (${createResponse.status})`);
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: ['✨ Success! Calendar invites have been sent.'],
          id: `success-${Date.now()}`
        }
      ]);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Failed to create Meetini:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: [error instanceof Error ? error.message : 'Sorry, something went wrong. Please try again.'],
        id: 'error-' + Date.now()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const containerClass = embedded
    ? "w-full bg-[#1a1d23] rounded-lg overflow-hidden"
    : "fixed inset-0 z-50 overflow-hidden flex min-h-screen items-center justify-center p-4";

  const chatContainerClass = embedded
    ? "w-full"
    : "relative bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl overflow-hidden";

  if (!isOpen) return null;

  return (
    <div className={containerClass}>
      {!embedded && (
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      )}
      
      <div className={chatContainerClass}>
        {/* Messages Area */}
        <div className="h-[400px] overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-[#22c55e] text-white'
                      : 'bg-[#2f3336] text-white'
                  }`}
                >
                  {message.content.map((text, i) => (
                    <div key={i} className="whitespace-pre-wrap">{text}</div>
                  ))}
                </div>
              </motion.div>
            ))}
            
            {/* Typing indicator with animated dots when processing */}
            {isProcessing && (
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="max-w-[80%] rounded-lg p-3 bg-[#2f3336] text-white">
                  <div className="flex space-x-1 items-center">
                    <div className="w-2 h-2 bg-[#22c55e] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-[#22c55e] rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                    <div className="w-2 h-2 bg-[#22c55e] rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* Selected Contacts */}
        {selectedContacts.length > 0 && (
          <div className="px-4 py-2 border-t border-[#2f3336]">
            <div className="flex flex-wrap gap-2">
              {selectedContacts.map(contact => (
                <div
                  key={contact.email}
                  className="inline-flex items-center space-x-1 bg-[#22c55e]/10 text-[#22c55e] px-2 py-1 rounded-full text-sm"
                >
                  <span>{contact.name}</span>
                  <button
                    onClick={() => removeContact(contact.email)}
                    className="hover:text-[#22c55e]/80"
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Contact Search */}
        {showContactSearch && (
          <div className="px-4 py-2 border-t border-[#2f3336]">
            <div className="flex space-x-2 items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={contactSearchInput}
                  onChange={handleSearchInputChange}
                  placeholder="Search contacts by name or email..."
                  className="w-full p-2 pl-8 bg-[#2f3336] border border-[#2f3336] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                  autoFocus
                />
                <FaSearch className="absolute left-2.5 top-3 text-gray-400" size={14} />
              </div>
              <button
                onClick={() => {
                  setShowContactSearch(false);
                  setContactSearchInput('');
                  setContactSearchResults([]);
                  setIsSearching(false);
                }}
                className="p-2 text-gray-400 hover:text-white"
              >
                <FaTimes size={20} />
              </button>
            </div>
            
            {/* Loading state */}
            {isSearching && (
              <div className="mt-2 text-gray-400 text-sm flex items-center space-x-2">
                <div className="animate-spin h-4 w-4 border-2 border-[#22c55e] border-t-transparent rounded-full"></div>
                <span>Searching contacts...</span>
              </div>
            )}
            
            {/* Contact Search Results */}
            {!isSearching && contactSearchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-[300px] overflow-y-auto p-1">
                <div className="text-xs text-gray-400 mb-2 flex justify-between items-center sticky top-0 bg-gray-900 p-1 z-10">
                  <span className="font-semibold">
                    <span className="text-[#22c55e]">{contactSearchResults.length}</span> contact{contactSearchResults.length !== 1 ? 's' : ''} found 
                    {contactSearchInput && (
                      <span> matching "<span className="text-white">{contactSearchInput}</span>"</span>
                    )}
                  </span>
                  {contactSearchResults.some(c => c.primary) && (
                    <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-1.5 py-0.5 rounded-full">
                      {contactSearchResults.filter(c => c.primary).length} primary contact{contactSearchResults.filter(c => c.primary).length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                <div className="space-y-1 pb-1">
                  {/* Group contacts by type of match */}
                  {contactSearchResults.map((contact, index) => {
                    const searchQuery = contactSearchInput.trim().toLowerCase();
                    const isExactEmailMatch = contact.email.toLowerCase() === searchQuery;
                    const isExactNameMatch = contact.name.toLowerCase() === searchQuery;
                    const emailContainsQuery = contact.email.toLowerCase().includes(searchQuery);
                    const nameContainsQuery = contact.name.toLowerCase().includes(searchQuery);
                    
                    // Determine match category for styling
                    let matchCategory = "other";
                    if (isExactEmailMatch) matchCategory = "exactEmail";
                    else if (isExactNameMatch) matchCategory = "exactName";
                    else if (contact.primary) matchCategory = "primary";
                    
                    // Highlight for top results
                    const isTopResult = index < 5;
                    const isHighlighted = matchCategory !== "other" || isTopResult;
                    
                    return (
                      <button
                        key={`${contact.email}-${index}`} // Using index to avoid rare duplicate email issues
                        onClick={() => {
                          addContact(contact);
                          setShowContactSearch(false);
                        }}
                        className={`w-full text-left p-2 rounded-lg text-white text-sm flex justify-between items-center group transition-colors ${
                          contact.primary
                            ? 'bg-[#22c55e]/25 hover:bg-[#22c55e]/35 border border-[#22c55e]/40' 
                            : isHighlighted
                              ? 'bg-[#22c55e]/15 hover:bg-[#22c55e]/25' 
                              : 'hover:bg-[#22c55e]/10'
                        }`}
                      >
                        <div className="flex flex-col w-5/6">
                          <div className="font-medium flex items-center flex-wrap">
                            <span className={nameContainsQuery ? 'text-[#22c55e]' : ''}>{contact.name}</span>
                            {isExactNameMatch && (
                              <span className="ml-2 bg-[#22c55e]/30 text-[#22c55e] text-xs px-1.5 py-0.5 rounded-full">exact name</span>
                            )}
                            {isExactEmailMatch && (
                              <span className="ml-2 bg-[#22c55e]/30 text-[#22c55e] text-xs px-1.5 py-0.5 rounded-full">exact email</span>
                            )}
                            {contact.primary && (
                              <span className="ml-2 bg-[#22c55e]/30 text-[#22c55e] text-xs px-1.5 py-0.5 rounded-full flex items-center">
                                <FaStar className="mr-1" size={10} />primary
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-gray-400 text-xs group-hover:text-[#22c55e] truncate">
                            <span className={emailContainsQuery ? 'text-[#22c55e]' : ''}>{contact.email}</span>
                            {contact.source && (
                              <span className="ml-2 text-gray-500 hidden sm:inline">{contact.source}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[#22c55e] opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                          <FaCheck className="mr-1" size={12} /> Add
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* No contacts found message */}
            {!isSearching && contactSearchInput !== '' && contactSearchResults.length === 0 && (
              <div className="mt-2 p-3 text-center rounded-lg bg-gray-800/50 border border-gray-700">
                <div className="text-gray-400 text-sm mb-2">
                  No contacts found matching "<span className="text-white">{contactSearchInput}</span>"
                </div>
                {isValidEmail(contactSearchInput) ? (
                  <button
                    onClick={() => {
                      const newContact = {
                        name: contactSearchInput.split('@')[0],
                        email: contactSearchInput,
                        confidence: 1,
                        primary: false,
                        source: 'manual',
                      };
                      addContact(newContact);
                      setShowContactSearch(false);
                    }}
                    className="text-sm bg-[#22c55e]/20 hover:bg-[#22c55e]/30 text-[#22c55e] py-2 px-3 rounded-md transition-colors"
                  >
                    <FaUserPlus className="inline mr-2" size={12} />
                    Add <span className="text-white">{contactSearchInput}</span> as new contact
                  </button>
                ) : (
                  <div className="text-xs text-gray-500">
                    <p>Try:</p>
                    <ul className="mt-1 space-y-1 text-left list-disc pl-5">
                      <li>Checking the spelling of the name or email</li>
                      <li>Using the person's full name</li>
                      <li>Searching by email address instead</li>
                      <li>Using fewer or different keywords</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-[#2f3336]">
          {recordingError && (
            <div className="mb-2 text-red-500 text-sm">{recordingError}</div>
          )}
          <div className="flex space-x-2">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-2 rounded-lg transition-colors ${
                isListening
                  ? 'bg-red-500 text-white'
                  : 'bg-[#2f3336] text-[#22c55e] hover:bg-[#2f3336]/80'
              }`}
            >
              {isListening ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
            </button>
            <button
              onClick={() => setShowContactSearch(prev => !prev)}
              className="p-2 rounded-lg bg-[#2f3336] text-[#22c55e] hover:bg-[#2f3336]/80"
              title="Add contacts manually"
            >
              <FaUserPlus size={20} />
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
              placeholder="Type your message..."
              className="flex-1 p-2 bg-[#2f3336] border border-[#2f3336] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
              disabled={isProcessing}
            />
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !inputValue.trim()}
              className="px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#22c55e]/80 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isProcessing ? 'Sending...' : 'Submit'}
            </button>
            <button
              onClick={handleSendMeetini}
              disabled={isProcessing || selectedContacts.length === 0}
              className="px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#22c55e]/80 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Send Meetini
            </button>
          </div>

          {/* Suggested Contacts */}
          {suggestedContacts.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-gray-400 mb-2">Found contacts:</div>
              <div className="flex flex-wrap gap-2">
                {suggestedContacts.map(contact => (
                  <button
                    key={contact.email}
                    onClick={() => addContact(contact)}
                    className="inline-flex items-center space-x-1 bg-[#2f3336] text-white px-2 py-1 rounded-lg text-sm hover:bg-[#2f3336]/80"
                  >
                    <span>{contact.name}</span>
                    <span className="text-xs text-gray-400">({contact.email})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

