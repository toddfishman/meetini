import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { MicrophoneIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface TextContent {
  text: {
    value: string;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: TextContent[];
  contactSuggestions?: any[];
  quickReplies?: string[];
}

interface ContactSuggestion {
  name: string;
  email: string;
  selected?: boolean;
}

export default function TestChat() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: [{
      text: {
        value: "Hi! I can help you schedule a meeting. Just tell me what you'd like to do, and I'll ask questions if I need more information. For example, you could say 'Schedule a meeting with Sarah next week' or 'Set up coffee with Jason tomorrow morning.'"
      }
    }]
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Temporarily disable authentication redirect for testing
  // useEffect(() => {
  //   if (status === 'unauthenticated') {
  //     router.push('/auth/signin');
  //   }
  // }, [status, router]);

  // Simulate typing indicator
  useEffect(() => {
    if (isLoading) {
      setIsTyping(true);
    } else {
      const timeout = setTimeout(() => setIsTyping(false), 500);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  const startRecording = async () => {
    try {
      setRecordingError(null);
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing audio...');
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob);

        try {
          const response = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to transcribe audio');
          }
          
          const data = await response.json();
          if (data.text) {
            setInput(data.text);
          }
        } catch (error) {
          console.error('Transcription error:', error);
          setRecordingError(error instanceof Error ? error.message : 'Failed to transcribe audio');
        }

        // Clean up
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingError(error instanceof Error ? error.message : 'Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped');
    }
  };

  const handleContactSelection = (messageIndex: number, contactIndex: number) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const message = newMessages[messageIndex];
      if (message.contactSuggestions) {
        message.contactSuggestions = message.contactSuggestions.map((c, i) => ({
          ...c,
          selected: i === contactIndex
        }));
      }
      return newMessages;
    });
  };

  const handleQuickReply = (reply: string) => {
    setInput(reply);
    handleSubmit(new Event('submit') as any);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    
    if (!trimmedInput && !isRecording) return;
    
    setIsLoading(true);
    
    const userMessage: Message = {
      role: 'user',
      content: [{ text: { value: trimmedInput } }]
    };
    
    setMessages((prevMessages: Message[]) => {
      const newMessages = [...prevMessages];
      newMessages.push(userMessage);
      return newMessages;
    });
    
    setInput('');
    
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedInput })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: [{ text: { value: data.message } }],
        contactSuggestions: data.contactSuggestions,
        quickReplies: data.quickReplies
      };
      
      setMessages((prevMessages: Message[]) => {
        const newMessages = [...prevMessages];
        newMessages.push(assistantMessage);
        return newMessages;
      });
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: [{ text: { value: 'Sorry, I encountered an error. Please try again.' } }]
      };
      setMessages((prevMessages: Message[]) => {
        const newMessages = [...prevMessages];
        newMessages.push(errorMessage);
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto w-full px-4">
        <div className="bg-white shadow-lg rounded-lg">
          {recordingError && (
            <div className="p-2 bg-red-100 text-red-700 text-sm rounded-t-lg">
              {recordingError}
            </div>
          )}
          <div className="px-4 py-5 sm:p-6">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  } mb-4`}
                >
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[70%] ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {message.content[0].text.value}
                    {message.contactSuggestions && message.contactSuggestions.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold">Suggested Contacts:</p>
                        <ul>
                          {message.contactSuggestions.map((contact, i) => (
                            <li key={i}>{contact}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {message.quickReplies && message.quickReplies.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.quickReplies.map((reply, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setInput(reply);
                              handleSubmit(new Event('submit') as any);
                            }}
                            className="bg-white text-blue-500 px-3 py-1 rounded-full text-sm hover:bg-blue-50"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-200 rounded-lg px-4 py-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="mt-4">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-2 rounded-lg transition-colors ${
                    isRecording
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {isRecording ? (
                    <XMarkIcon className="w-6 h-6" />
                  ) : (
                    <MicrophoneIcon className="w-6 h-6" />
                  )}
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || (!input.trim() && !isRecording)}
                  className={`p-2 rounded-lg bg-blue-600 text-white ${
                    isLoading || (!input.trim() && !isRecording) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  <PaperAirplaneIcon className="w-6 h-6" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 