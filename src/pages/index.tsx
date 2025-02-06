import { Geist, Geist_Mono } from "next/font/google";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Navbar from '../components/Navbar';
import RotatingTagline from '../components/RotatingTagline';
import { isBiometricsAvailable, handleBiometricAuth } from '@/lib/biometrics';
import Image from 'next/image';
import HamburgerMenu from '@/components/HamburgerMenu';
import Link from 'next/link';
import { parseMeetingRequest } from '@/lib/openai';

// Add these interfaces at the top of the file, after the imports
interface Window {
  webkitSpeechRecognition: any;
  currentRecognition: any;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    currentRecognition: any;
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface ParsedRequest {
  participants: any[];
  preferences: {
    timePreference?: string;
    durationType?: string;
    locationType?: string;
  };
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [voiceState, setVoiceState] = useState<{
    isProcessing: boolean;
    currentQuestion: string | null;
    requiredInfo: {
      who: boolean;
      what: boolean;
      when: boolean;
      where: boolean;
      priority: boolean;
    };
    parsedRequest: ParsedRequest | null;
    recordingStatus: 'idle' | 'recording' | 'transcribing' | 'processing';
  }>({
    isProcessing: false,
    currentQuestion: null,
    requiredInfo: {
      who: false,
      what: false,
      when: false,
      where: false,
      priority: false,
    },
    parsedRequest: null,
    recordingStatus: 'idle',
  });
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  useEffect(() => {
    const checkBiometrics = async () => {
      const available = await isBiometricsAvailable();
      setIsBiometricsSupported(available);
    };
    checkBiometrics();
  }, []);

  // Add recording timeout
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (isListening) {
      // Stop recording after 30 seconds
      timeoutId = setTimeout(() => {
        console.log('Recording timeout reached');
        stopRecording();
      }, 30000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isListening]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  if (session) {
    router.push("/dashboard");
    return null;
  }

  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    
    try {
      setIsLoading(true);
      setError(null);

      if (!session) {
        // If not logged in, redirect to Google sign in
        await signIn("google", {
          callbackUrl: `/dashboard?prompt=${encodeURIComponent(prompt)}`,
          scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/contacts.readonly email profile'
        });
        return;
      }

      // If we have parsed request data, create the calendar event
      if (voiceState.parsedRequest) {
        const response = await fetch('/api/calendar/create-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(voiceState.parsedRequest),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create calendar event');
        }

        const result = await response.json();
        
        // Show success message and reset form
        setPrompt('');
        setVoiceState(prev => ({
          ...prev,
          parsedRequest: null,
          currentQuestion: null,
        }));
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        // If no parsed request, try to parse the prompt first
        const parsedRequest = await parseMeetingRequest(prompt);
        setVoiceState(prev => ({
          ...prev,
          parsedRequest,
        }));
        
        // Create calendar event with parsed data
        const response = await fetch('/api/calendar/create-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(parsedRequest),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create calendar event');
        }

        // Show success and redirect
        setPrompt('');
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = () => {
    // @ts-ignore - accessing from window
    if (window.currentRecognition) {
      // @ts-ignore - accessing from window
      window.currentRecognition.stop();
      // @ts-ignore - cleanup
      window.currentRecognition = null;
    }
    setIsListening(false);
    setVoiceState(prev => ({ ...prev, recordingStatus: 'idle' }));
  };

  const startVoiceRecording = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    try {
      if (isListening) {
        stopRecording();
        return;
      }

      setIsListening(true);
      setError(null);
      setVoiceState(prev => ({ ...prev, recordingStatus: 'recording' }));

      // @ts-ignore - webkitSpeechRecognition is not in TypeScript types
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true; // Allow continuous recording
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Update the prompt with both final and interim results
        setPrompt(finalTranscript + interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          setError('No speech detected. Please try again and speak clearly.');
        } else if (event.error === 'audio-capture') {
          setError('No microphone detected. Please check your microphone settings.');
        } else if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access and try again.');
        } else {
          setError('Failed to recognize speech. Please try again.');
        }
        stopRecording();
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setVoiceState(prev => ({ ...prev, recordingStatus: 'idle' }));
        setIsListening(false);
        // Only set final transcript if we have content
        if (finalTranscript.trim()) {
          setPrompt(finalTranscript.trim());
        }
      };

      recognition.start();
      // Store the recognition instance
      // @ts-ignore - adding to window for cleanup
      window.currentRecognition = recognition;

      // Automatically stop after 15 seconds
      setTimeout(() => {
        if (window.currentRecognition) {
          window.currentRecognition.stop();
        }
      }, 15000);

    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError('Failed to start speech recognition. Please try again.');
      setVoiceState(prev => ({ ...prev, recordingStatus: 'idle' }));
    }
  };

  const getNextQuestion = (parsedRequest: ParsedRequest): string | null => {
    if (!parsedRequest.participants.length) {
      return "Who would you like to meet with?";
    }
    if (!parsedRequest.preferences.timePreference) {
      return "When would you prefer to meet? Morning, afternoon, or evening?";
    }
    if (!parsedRequest.preferences.durationType) {
      return "How long should the meeting be? 30 minutes, 1 hour, or 2 hours?";
    }
    if (!parsedRequest.preferences.locationType) {
      return "Where would you like to meet? Coffee shop, restaurant, office, or virtual?";
    }
    return null;
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handlePromptSubmit();
    }
  };

  const handleBiometricLogin = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);
      
      // Bypass biometric auth and go straight to Google
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (err) {
      setError('Failed to authenticate. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation Area */}
      <nav className="fixed top-0 left-0 right-0 bg-black shadow-lg z-50">
        <div className="w-full px-2">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 -ml-2">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logos/beta-logo.png"
                  alt="Meetini"
                  width={150}
                  height={150}
                  className="w-auto h-auto"
                  priority
                />
              </Link>
            </div>
            <div className="flex items-center -mr-2">
              <HamburgerMenu />
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-20">
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
          {/* Motto Logo */}
          <div className="w-full flex justify-center mt-8">
            <Image
              src="/logos/motto2.png"
              alt="Meetini Motto"
              width={3600}
              height={900}
              className="w-auto h-auto max-w-[80%]"
              priority
            />
          </div>

          {/* Voice Assistant Area */}
          <div className="w-full -mt-16 space-y-3">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Simply tell us what to schedule and with whom. Talk/Type and we'll eliminate the back and forth of setting meetings, events or get togethers. We call it a meetini."
                className="w-full p-3 pr-12 rounded-lg bg-gray-900 border border-gray-800 text-white focus:outline-none focus:border-teal-500 resize-none text-sm sm:text-base"
                rows={3}
              />
              <button
                onClick={startVoiceRecording}
                disabled={isLoading}
                className={`absolute right-2 top-2 p-2 rounded-full hover:bg-gray-800 transition-colors ${
                  isListening ? 'text-red-500 animate-pulse' : 'text-teal-500'
                }`}
                title={isListening ? 'Stop Recording' : 'Start Recording'}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isListening ? (
                    // Stop icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15 9l-6 6M9 9l6 6" />
                  ) : (
                    // Microphone icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
              </button>
            </div>

            {/* Voice Assistant Status */}
            {voiceState.recordingStatus !== 'idle' && (
              <div className="p-3 bg-teal-500/10 border border-teal-500 rounded text-teal-500 animate-pulse">
                {voiceState.recordingStatus === 'recording' && '🎤 Recording... (speak now)'}
                {voiceState.recordingStatus === 'transcribing' && '📝 Transcribing your message...'}
                {voiceState.recordingStatus === 'processing' && '🤖 Processing your request...'}
              </div>
            )}

            {isListening && voiceState.currentQuestion && (
              <div className="p-3 bg-teal-500/10 border border-teal-500 rounded text-teal-500">
                {voiceState.currentQuestion}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500 rounded text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handlePromptSubmit}
                disabled={isLoading || !prompt.trim() || isListening}
                className="w-full bg-teal-500 text-white p-3 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </>
                ) : session ? (
                  'Invite People to Meet Using Your Voice'
                ) : (
                  'Send Your Meetini'
                )}
              </button>

              {!session && (
                <button
                  onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                  className="w-full bg-white text-black p-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              )}
            </div>
          </div>

          {/* Rotating Tagline */}
          <div className="mt-4 text-center">
            <RotatingTagline />
          </div>

          {/* Footer */}
          <div className="mt-4 mb-4 text-gray-400 text-sm flex items-center justify-center space-x-4">
            <a href="/privacypolicy" className="hover:text-white transition-colors">Privacy Policy</a>
            <span className="text-gray-600">•</span>
            <a href="mailto:support@meetini.app" className="hover:text-white transition-colors">Contact Us</a>
          </div>
        </div>
      </main>
    </div>
  );
}
