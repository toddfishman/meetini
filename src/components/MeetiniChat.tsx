import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Contact {
  email: string;
  name: string;
  confidence: number;
  frequency?: number;
  lastContact?: Date;
  matchedName?: string;
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'confirmation';
  content: string;
  participants?: Contact[];
  timestamp: Date;
}

interface MeetiniChatProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPrompt?: string;
}

export default function MeetiniChat({ isOpen, onClose, onSuccess, initialPrompt }: MeetiniChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [suggestedContacts, setSuggestedContacts] = useState<Contact[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Initial greeting when the chat opens
  useEffect(() => {
    if (isOpen) {
      setMessages([{
        id: '1',
        type: 'assistant',
        content: 'Hi! I can help you schedule a meeting. Just tell me who you want to meet with and any other details you\'d like to include.',
        timestamp: new Date()
      }]);
    }
  }, [isOpen]);

  // Scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMeetini = async () => {
    if (selectedContacts.length === 0) {
      addMessage({
        type: 'assistant',
        content: 'Please mention who you\'d like to meet with first.'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: messages.filter(m => m.type === 'user').map(m => m.content).join(' '),
          participants: selectedContacts.map(c => c.email)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create Meetini');
      }

      addMessage({
        type: 'confirmation',
        content: '✨ Perfect! I\'ve sent the calendar invites to everyone. You\'ll receive a confirmation email shortly.'
      });

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      addMessage({
        type: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserInput = async () => {
    if (!inputValue.trim()) return;

    // Add user message
    addMessage({
      type: 'user',
      content: inputValue
    });

    setInputValue('');
    setIsProcessing(true);

    try {
      // Extract potential participants from the message
      const response = await fetch('/api/contacts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputValue }),
      });

      const data = await response.json();
      const contacts: Contact[] = data.contacts || [];

      if (contacts.length > 0) {
        setSuggestedContacts(contacts);

        // If this is the first message with contacts
        if (selectedContacts.length === 0) {
          addMessage({
            type: 'assistant',
            content: `Great! I've found ${contacts.length} contact${contacts.length > 1 ? 's' : ''}. Would you like me to:
1. Send a Meetini now (I'll use AI to figure out the best time and type of meeting)
2. Provide more details about the meeting`,
            participants: contacts
          });
        }
      } else if (inputValue.toLowerCase().includes('send') || inputValue.toLowerCase().includes('now')) {
        // User wants to send the Meetini
        await handleSendMeetini();
      } else {
        // Process the input for meeting details
        addMessage({
          type: 'assistant',
          content: 'Got it! You can keep adding details, or click "Send Meetini" when you\'re ready. I\'ll figure out the best time and format based on everything you\'ve told me.'
        });
      }
    } catch (error) {
      addMessage({
        type: 'assistant',
        content: 'Sorry, I had trouble processing that. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...message,
      id: Math.random().toString(),
      timestamp: new Date()
    }]);
  };

  const toggleContact = (contact: Contact) => {
    setSelectedContacts(prev => {
      const isSelected = prev.some(c => c.email === contact.email);
      if (isSelected) {
        return prev.filter(c => c.email !== contact.email);
      } else {
        return [...prev, contact];
      }
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        
        <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Schedule a Meeting</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chat Messages */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.type === 'user'
                        ? 'bg-teal-500 text-white'
                        : message.type === 'confirmation'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                        : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    {message.participants && (
                      <div className="mt-4 space-y-2">
                        <div className="text-sm font-medium opacity-80">Suggested Contacts:</div>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                          {message.participants.map((contact) => (
                            <div
                              key={contact.email}
                              onClick={() => toggleContact(contact)}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                selectedContacts.some(c => c.email === contact.email)
                                  ? 'bg-teal-500/20 hover:bg-teal-500/30'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                  selectedContacts.some(c => c.email === contact.email)
                                    ? 'bg-teal-500 text-white'
                                    : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}>
                                  {getInitials(contact.name)}
                                </div>
                                <div>
                                  <div className="font-medium">{contact.name}</div>
                                  <div className="text-xs text-gray-500">{contact.email}</div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {contact.frequency && (
                                  <span className="text-xs text-gray-500">
                                    {contact.frequency} meetings
                                  </span>
                                )}
                                {selectedContacts.some(c => c.email === contact.email) ? (
                                  <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t dark:border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleUserInput()}
                placeholder="Type your message..."
                className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                disabled={isProcessing}
              />
              <button
                onClick={handleSendMeetini}
                disabled={isProcessing || selectedContacts.length === 0}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 whitespace-nowrap"
              >
                {isProcessing ? 'Sending...' : 'Send Meetini'}
              </button>
            </div>
            {selectedContacts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedContacts.map(contact => (
                  <div
                    key={contact.email}
                    className="inline-flex items-center space-x-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2 py-1 rounded-full text-sm"
                  >
                    <span>{contact.name}</span>
                    <button
                      onClick={() => toggleContact(contact)}
                      className="hover:text-teal-800 dark:hover:text-teal-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
