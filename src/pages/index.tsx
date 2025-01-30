import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import RotatingTagline from '../components/RotatingTagline';
import { isBiometricsAvailable } from '@/lib/biometrics';
import Layout from '@/components/Layout';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
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

  // Only redirect if there's a specific query parameter or stored state
  useEffect(() => {
    if (session && status === 'authenticated' && router.query.redirect === 'dashboard') {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    
    if (!session) {
      // Store the current prompt in localStorage before redirecting to sign in
      localStorage.setItem('pendingInvitation', prompt);
      signIn('google', { callbackUrl: '/dashboard?newInvitation=true' });
      return;
    }

    try {
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invitation');
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to create invitation:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
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
    recognition.interimResults = true;
    recognition.lang = 'en-US';  // Set language explicitly
    recognition.maxAlternatives = 3;  // Get multiple alternatives

    let finalTranscript = '';
    let interimTranscript = '';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          processVoiceInput(finalTranscript.trim());
        } else {
          interimTranscript = transcript;
          // Show interim results in the textarea
          setPrompt(finalTranscript + interimTranscript);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = 'Failed to recognize voice. ';
      switch (event.error) {
        case 'network':
          errorMessage += 'Please check your internet connection.';
          break;
        case 'not-allowed':
          errorMessage += 'Please enable microphone access.';
          break;
        case 'aborted':
          errorMessage += 'Listening was stopped.';
          break;
        default:
          errorMessage += 'Please try again.';
      }
      setError(errorMessage);
      setIsListening(false);
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
    };

    recognition.onend = () => {
      const missingInfo = getMissingInformation();
      if (missingInfo) {
        // If we have missing information, ask the next question
        setVoiceState(prev => ({
          ...prev,
          currentQuestion: missingInfo.question,
          isProcessing: true
        }));
        recognition.start(); // Continue listening for the answer
      } else {
        setIsListening(false);
        setVoiceState(prev => ({ ...prev, isProcessing: false }));
      }
    };

    recognition.start();
  };

  const getMissingInformation = () => {
    const info = voiceState.requiredInfo;
    
    // Check what's missing
    const missing = {
      who: !info.who,
      what: !info.what,
      when: !info.when,
      where: (!info.where && (prompt.toLowerCase().includes('coffee') || prompt.toLowerCase().includes('lunch')))
    };

    // If anything is missing, create one combined question
    if (Object.values(missing).some(Boolean)) {
      const missingParts = [];
      if (missing.who || missing.what) {
        const parts = [];
        if (missing.who) parts.push("who");
        if (missing.what) parts.push("what type of meeting");
        missingParts.push(parts.join(" and "));
      }
      if (missing.when) missingParts.push("when");
      if (missing.where) missingParts.push("where");

      const question = `Quick follow-up: Could you tell me ${missingParts.join(", ").replace(/,([^,]*)$/, ' and$1')}?`;
      return { field: 'combined', question };
    }

    return null;
  };

  const processVoiceInput = (transcript: string) => {
    const newRequiredInfo = { ...voiceState.requiredInfo };
    let updatedPrompt = prompt;
    
    // Smart pattern matching with context awareness
    const patterns = {
      who: {
        pattern: /(?:with|invite|meet|and)\s+([^,.]+(?:(?:,\s*|,?\s+and\s+)[^,.]+)*)|([a-zA-Z]+@[a-zA-Z.]+)/i,
        extract: (match: RegExpMatchArray) => match[1] || match[2]
      },
      what: {
        pattern: /(?:for\s+)?(?:a\s+)?(coffee|lunch|dinner|meeting|call|zoom|virtual|online|chat|sync|catch-?up|discussion)\s*(?:meeting|session|catch-?up)?/i,
        extract: (match: RegExpMatchArray) => match[1]
      },
      when: {
        pattern: /(?:on|at|this|next|coming|tomorrow|today|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|weekend)\s*([^,.]*?)(?=\s*(?:,|at|in|$))/i,
        extract: (match: RegExpMatchArray) => match[0]
      },
      where: {
        pattern: /(?:at|in|near|around)\s+([^,.]+?)(?=\s*(?:,|$))|(?:on\s+)?(?:zoom|google meet|teams|virtual|online)/i,
        extract: (match: RegExpMatchArray) => match[1] || match[0]
      }
    };

    // Process all patterns at once with context
    Object.entries(patterns).forEach(([field, { pattern, extract }]) => {
      const match = transcript.match(pattern);
      if (match) {
        newRequiredInfo[field as keyof typeof newRequiredInfo] = true;
        
        // Smart context handling
        if (field === 'what') {
          const meetingType = match[1]?.toLowerCase();
          if (meetingType?.match(/zoom|virtual|online|teams/i)) {
            newRequiredInfo.where = true; // Virtual meetings don't need physical location
          }
          if (meetingType?.match(/coffee|lunch|dinner/i)) {
            // For physical meetings, we'll need a location
            newRequiredInfo.where = false;
          }
        }
      }
    });

    // Combine all extracted information
    const extractedInfo = Object.entries(patterns)
      .map(([field, { pattern }]) => {
        const match = transcript.match(pattern);
        return match ? match[0] : null;
      })
      .filter(Boolean)
      .join(" ");

    // Update prompt intelligently
    if (extractedInfo) {
      if (prompt && !prompt.includes(extractedInfo)) {
        updatedPrompt = `${prompt} ${extractedInfo}`.trim();
      } else {
        updatedPrompt = transcript;
      }
    }

    setVoiceState(prev => ({
      ...prev,
      requiredInfo: newRequiredInfo,
      currentQuestion: getNextQuestion(newRequiredInfo),
    }));

    setPrompt(updatedPrompt);

    // If we have all required info, prepare for submission
    if (Object.values(newRequiredInfo).every(value => value)) {
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const getNextQuestion = (info: typeof voiceState.requiredInfo) => {
    if (!info.who) return "Who would you like to meet with?";
    if (!info.what) return "What type of meeting would you like to schedule?";
    if (!info.when) return "When would you prefer to meet?";
    if (!info.where) return "Where would you like to meet?";
    if (!info.priority) return "On a scale of 1-10, how important is this meeting?";
    return null;
  };

  const stopVoiceRecording = () => {
    setIsListening(false);
    setVoiceState(prev => ({ ...prev, isProcessing: false, currentQuestion: null }));
    // The recognition will automatically stop in the onend handler
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  return (
    <Layout>
      <div className="w-full max-w-3xl flex flex-col items-center -mt-16">
        <div className="w-full max-w-xl">
          {/* Motto Image */}
          <div className="flex justify-center -mx-16 -mb-16">
            <img
              src="/images/motto1.png"
              alt="Meetini Motto"
              className="w-full max-w-3xl"
              style={{ marginBottom: '-35%' }}
            />
          </div>

          {/* Voice Input Section */}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Talk to the app (or Type) your meeting details. Example: Who do you want to invite, for What and When. We may ask you follow up questions to understand your calendar invite better."
              className="w-full p-2 pr-12 rounded-lg bg-gray-900 border border-gray-800 text-white focus:outline-none focus:border-teal-500 resize-none"
              rows={3}
            />
            <button
              onClick={isListening ? stopVoiceRecording : startVoiceRecording}
              className={`absolute right-2 top-2 p-2 rounded-full hover:bg-gray-800 transition-colors ${
                isListening ? 'bg-red-500/10 text-red-500 animate-pulse' : 'text-teal-500'
              }`}
              title={isListening ? "Stop recording" : "Start recording"}
            >
              {isListening ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" strokeWidth={2} />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          </div>

          {/* Instructions Toggle */}
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-sm text-teal-500 hover:text-teal-400 transition-colors flex items-center gap-1 mb-2"
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
            <div className="p-3 mb-2 bg-gray-900 rounded-lg border border-gray-800 text-sm text-gray-300 space-y-2">
              <h3 className="font-medium text-teal-500">How to Use Voice Commands:</h3>
              <p>Include the following information in your request:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Who you want to meet with (names or email addresses)</li>
                <li>What type of meeting (coffee, lunch, virtual call, etc.)</li>
                <li>When you prefer (next week, this month, etc.)</li>
                <li>Where you'd like to meet (if applicable)</li>
                <li>Priority level (1-10, optional)</li>
              </ul>
              <p className="text-gray-400 italic">Example: "Schedule a coffee meeting with John and Sarah next week, priority 8"</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handlePromptSubmit}
              disabled={!prompt.trim() || isListening}
              className="w-full bg-teal-500 text-white p-2.5 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Your Meetini
            </button>

            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="w-full bg-white text-black p-2.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        {/* Rotating Tagline */}
        <div className="mt-4 text-center">
          <RotatingTagline />
        </div>

        {/* Footer */}
        <div className="mt-4 text-gray-400 text-sm flex items-center justify-center space-x-4">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <span className="text-gray-600">•</span>
          <a href="mailto:support@meetini.app" className="hover:text-white transition-colors">Contact Us</a>
        </div>
      </div>
    </Layout>
  );
}
