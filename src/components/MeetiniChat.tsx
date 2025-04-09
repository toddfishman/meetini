import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';

interface Contact {
  email: string;
  name: string;
  confidence: number;
  frequency?: number;
  lastContact?: Date;
  matchedName?: string;
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
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const data: ChatResponse = await response.json();
      setThreadId(data.threadId);

      // Extract message content from the API response
      const messageContent = Array.isArray(data.messages) 
        ? data.messages.map(msg => {
            if (typeof msg === 'string') return msg;
            if (typeof msg === 'object' && msg.content) {
              // Handle array of content items
              if (Array.isArray(msg.content)) {
                return msg.content.map(item => {
                  if (typeof item === 'string') return item;
                  if (item.text) return item.text.value || '';
                  return '';
                }).join('\n');
              }
              // Handle single content item
              if (typeof msg.content === 'string') return msg.content;
              if (msg.content.text) return msg.content.text.value || '';
            }
            return 'Message format not supported';
          })
        : [typeof data.messages === 'string' ? data.messages : 'I received your message but encountered an error processing it.'];

      const assistantMessage: Message = {
        role: 'assistant',
        content: messageContent,
        id: `assistant-${Date.now()}`
      };

      setMessages((prevMessages: Message[]) => [...prevMessages, assistantMessage]);

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

      // Add success message with proper Message type
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: ['✨ Success! Calendar invites have been sent.'],
          id: `success-${Date.now()}`
        }
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
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

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
          </div>
          {suggestedContacts.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-gray-400 mb-2">Found contacts:</div>
              <div className="flex flex-wrap gap-2">
                {suggestedContacts.map(contact => (
                  <div
                    key={contact.email}
                    className="inline-flex items-center space-x-1 bg-[#2f3336] text-white px-2 py-1 rounded-lg text-sm"
                  >
                    <span>{contact.name}</span>
                    <span className="text-xs text-gray-400">({contact.email})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
