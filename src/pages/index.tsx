import { Geist, Geist_Mono } from "next/font/google";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Navbar from '../components/Navbar';
import RotatingTagline from '../components/RotatingTagline';
import { isBiometricsAvailable, handleBiometricAuth } from '@/lib/biometrics';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  });
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const checkBiometrics = async () => {
      const available = await isBiometricsAvailable();
      setIsBiometricsSupported(available);
    };
    checkBiometrics();
  }, []);

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
      
      const result = await signIn("google", {
        callbackUrl: `/dashboard?prompt=${encodeURIComponent(prompt)}`,
        scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/contacts.readonly email profile'
      });

      if (result?.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to start the process. Please try again.');
      setIsLoading(false);
    }
  };

  const processVoiceInput = (transcript: string) => {
    const newRequiredInfo = { ...voiceState.requiredInfo };
    
    // Check for participants (who)
    if (transcript.match(/with\s+([^,]+(?:,\s*[^,]+)*)/i)) {
      newRequiredInfo.who = true;
    }
    
    // Check for meeting type (what)
    if (transcript.match(/(coffee|lunch|dinner|meeting|call|zoom|virtual)/i)) {
      newRequiredInfo.what = true;
    }
    
    // Check for timing (when)
    if (transcript.match(/(today|tomorrow|next|this|coming|week|month|morning|afternoon|evening)/i)) {
      newRequiredInfo.when = true;
    }
    
    // Check for location (where)
    if (transcript.match(/(at|in|near|around|downtown|office|restaurant|cafe)/i)) {
      newRequiredInfo.where = true;
    }
    
    // Check for priority
    if (transcript.match(/priority\s*(\d+)/i)) {
      newRequiredInfo.priority = true;
    }

    setVoiceState(prev => ({
      ...prev,
      requiredInfo: newRequiredInfo,
      currentQuestion: getNextQuestion(newRequiredInfo),
    }));

    setPrompt(prev => prev ? `${prev} ${transcript}` : transcript);
  };

  const getNextQuestion = (info: typeof voiceState.requiredInfo) => {
    if (!info.who) return "Who would you like to meet with?";
    if (!info.what) return "What type of meeting would you like to schedule?";
    if (!info.when) return "When would you prefer to meet?";
    if (!info.where) return "Where would you like to meet?";
    if (!info.priority) return "On a scale of 1-10, how important is this meeting?";
    return null;
  };

  const startVoiceRecording = () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError('Voice recognition is not supported in your browser');
      return;
    }

    setIsListening(true);
    setError(null);
    setVoiceState(prev => ({ ...prev, isProcessing: true }));

    // @ts-ignore - WebkitSpeechRecognition is not in the types
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      processVoiceInput(transcript);
    };

    recognition.onerror = () => {
      setError('Failed to recognize voice. Please try again.');
      setIsListening(false);
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
    };

    recognition.onend = () => {
      if (voiceState.currentQuestion) {
        recognition.start(); // Continue listening if we still have questions
      } else {
        setIsListening(false);
        setVoiceState(prev => ({ ...prev, isProcessing: false }));
      }
    };

    recognition.start();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  const handleBiometricLogin = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);
      
      const response = await handleBiometricAuth();
      if ('verified' in response && response.verified) {
        router.push('/dashboard');
      } else {
        setError('Biometric authentication failed');
      }
    } catch (err) {
      setError('Failed to authenticate. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-8">
      <Navbar />
      <div className="w-full max-w-3xl flex flex-col items-center space-y-4 mt-36">
        <div className="w-full max-w-xl space-y-4">
          {/* Voice Input Section */}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type or Talk: Tell us about the meeting you want to schedule. For example: 'Set up a coffee meeting with Sarah next Tuesday afternoon at Blue Bottle Coffee' or 'Schedule a virtual meeting with the team next week'"
              className="w-full p-4 pr-12 rounded-lg bg-gray-900 border border-gray-800 text-white focus:outline-none focus:border-teal-500 resize-none"
              rows={4}
            />
            <button
              onClick={startVoiceRecording}
              disabled={isLoading || isListening}
              className={`absolute right-2 top-2 p-2 rounded-full hover:bg-gray-800 transition-colors ${
                isListening ? 'text-red-500 animate-pulse' : 'text-teal-500'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>

          {/* Instructions Toggle */}
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-sm text-teal-500 hover:text-teal-400 transition-colors flex items-center gap-1"
          >
            <svg
              className={`w-4 h-4 transform transition-transform ${showInstructions ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {showInstructions ? 'Hide Instructions' : 'Show Instructions'}
          </button>

          {/* Instructions Panel */}
          {showInstructions && (
            <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 text-sm text-gray-300 space-y-3">
              <h3 className="font-medium text-teal-500">How to Use Voice Commands:</h3>
              <p>Include the following information in your request:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Who you want to meet with (names or email addresses)</li>
                <li>What type of meeting (coffee, lunch, virtual call, etc.)</li>
                <li>When you prefer (next week, this month, etc.)</li>
                <li>Where you'd like to meet (if applicable)</li>
                <li>Priority level (1-10, optional)</li>
              </ul>
              <p className="text-gray-400 italic">Example: "Schedule a coffee meeting with John and Sarah next week, priority 8"</p>
            </div>
          )}

          {/* Voice Assistant Status */}
          {isListening && voiceState.currentQuestion && (
            <div className="p-3 bg-teal-500/10 border border-teal-500 rounded text-teal-500 animate-pulse">
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

            {isBiometricsSupported && !session && (
              <button
                onClick={handleBiometricLogin}
                disabled={isAuthenticating}
                className="w-full bg-gray-800 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAuthenticating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    Sign in with Face ID
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Rotating Tagline moved below */}
        <div className="mt-8 text-center">
          <RotatingTagline />
        </div>

        {/* Footer */}
        <div className="mt-8 text-gray-400 text-sm flex items-center justify-center space-x-4">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <span className="text-gray-600">•</span>
          <a href="mailto:support@meetini.app" className="hover:text-white transition-colors">Contact Us</a>
        </div>
      </div>
    </div>
  );
}
