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
  role: 'assistant' | 'user';
  content: string[];
}

interface MeetiniChatProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPrompt?: string;
}

export default function MeetiniChat({ isOpen, onClose, onSuccess, initialPrompt }: MeetiniChatProps) {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: ['Hi! I can help you schedule a meeting. Just tell me who you want to meet with and any other details you\'d like to include.'],
    id: 'initial'
  }]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [suggestedContacts, setSuggestedContacts] = useState<Contact[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    console.log('Sending message:', userMessage);
    
    // Add user message immediately
    setMessages(prev => [...prev, {
      role: 'user',
      content: [userMessage],
      id: Date.now().toString()
    }]);
    
    setInputValue('');
    setIsProcessing(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          threadId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      console.log('Assistant response:', data);
      
      setThreadId(data.threadId);

      // Convert OpenAI messages to our format
      const newMessages = data.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content.map((c: any) => c.text.value),
        id: msg.id
      }));

      setMessages(newMessages.reverse()); // OpenAI returns newest first

    } catch (error) {
      console.error('Failed to process message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Sorry, I encountered an error. Please try again.'],
        id: 'error-' + Date.now()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMeetini = async () => {
    if (selectedContacts.length === 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Please mention who you\'d like to meet with first.'],
        id: 'error-' + Date.now()
      }]);
      return;
    }

    setIsProcessing(true);
    try {
      // Send to AI-create endpoint
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Please schedule this meeting with ${selectedContacts.map(c => c.name).join(', ')}`,
          participants: selectedContacts.map(c => c.email)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create Meetini');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Use the suggested times from the Assistant
      if (!data.suggestedTimes?.length) {
        throw new Error('No suggested times available. Please try again.');
      }

      // Create the calendar event with the suggested time
      const createResponse = await fetch('/api/meetini/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite: {
            type: `Please schedule this meeting with ${selectedContacts.map(c => c.name).join(', ')}`,
            participants: selectedContacts.map(c => ({ email: c.email })),
            suggestedTimes: data.suggestedTimes,
            createdBy: 'user' // Replace with actual user email
          }
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create calendar event');
      }

      // Add success message
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: ['✨ Success! Calendar invites have been sent.'] }
      ]);

      // Clear input and reset state
      setInputValue('');
      setSelectedContacts([]);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Failed to create Meetini:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Sorry, something went wrong. Please try again.'],
        id: 'error-' + Date.now()
      }]);
    } finally {
      setIsProcessing(false);
    }
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
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-[#22c55e] text-white'
                        : message.role === 'assistant'
                        ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    }`}
                  >
                    {message.content.map((text, i) => (
                      <div key={i} className="whitespace-pre-wrap">{text}</div>
                    ))}
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
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
                placeholder="Type your message..."
                className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                disabled={isProcessing}
              />
              <button
                onClick={handleSendMeetini}
                disabled={isProcessing || selectedContacts.length === 0}
                className="px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#22c55e]/80 disabled:opacity-50 whitespace-nowrap"
              >
                {isProcessing ? 'Sending...' : 'Send Meetini'}
              </button>
            </div>
            {selectedContacts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedContacts.map(contact => (
                  <div
                    key={contact.email}
                    className="inline-flex items-center space-x-1 bg-[#22c55e]/10 text-[#22c55e] dark:text-[#22c55e] px-2 py-1 rounded-full text-sm"
                  >
                    <span>{contact.name}</span>
                    <button
                      onClick={() => setSelectedContacts(prev => prev.filter(c => c.email !== contact.email))}
                      className="hover:text-[#22c55e]/80 dark:hover:text-[#22c55e]/80"
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
