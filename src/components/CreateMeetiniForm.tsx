import React, { useState, useEffect } from 'react';
import { isContactPickerSupported, selectContacts } from '@/lib/contacts';

// Add at the top of the file, after the imports
declare global {
  interface Window {
    recognition: any;
    webkitSpeechRecognition: any;
  }
}

interface CreateMeetiniFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPrompt?: string | null;
}

interface Contact {
  type: 'email' | 'phone';
  value: string;
  name?: string;
}

interface PickedContact {
  email?: string;
  phoneNumber?: string;
  name?: string;
}

type ContactResult = { type: 'email'; value: string; name?: string } | { type: 'phone'; value: string; name?: string };

interface FormData {
  title: string;
  contacts: Contact[];
  location: string;
  proposedTimes: string[];
  preferences?: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours' | 'custom';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual' | 'custom';
  };
}

export default function CreateMeetiniForm({ isOpen, onClose, onSuccess, initialPrompt }: CreateMeetiniFormProps) {
  const [creationMode, setCreationMode] = useState<'ai' | 'manual' | null>(initialPrompt ? 'ai' : null);
  const [aiPrompt, setAiPrompt] = useState(initialPrompt || '');
  const [isListening, setIsListening] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    contacts: [],
    location: '',
    proposedTimes: [],
    preferences: {
      timePreference: undefined,
      durationType: undefined,
      locationType: undefined,
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [newContact, setNewContact] = useState('');
  const [isContactPickerAvailable, setIsContactPickerAvailable] = useState(false);
  const [isSelectingContacts, setIsSelectingContacts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState({
    isProcessing: false,
    requiredInfo: {
      who: false,
      what: false,
      when: false,
      where: false,
    },
    currentQuestion: null as string | null,
  });

  // Add effect to handle initialPrompt changes
  useEffect(() => {
    if (initialPrompt) {
      setCreationMode('ai');
      setAiPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    setIsContactPickerAvailable(isContactPickerSupported());
  }, []);

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingStatus('🤖 Analyzing your request...');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/meetini/ai-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: aiPrompt
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'NOT_AUTHENTICATED') {
          throw new Error('Please sign in to create a Meetini');
        }
        throw new Error(data.error || 'Failed to process request');
      }

      setProcessingStatus('✨ Success! Sending invitations...');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingStatus('📋 Creating invitation...');
    setIsSubmitting(true);

    try {
      // Validate form
      if (!formData.title.trim()) {
        throw new Error('Title is required');
      }
      if (!formData.contacts.length) {
        throw new Error('At least one participant is required');
      }
      if (!formData.proposedTimes.length) {
        throw new Error('At least one proposed time is required');
      }

      const requestBody = {
        title: formData.title.trim(),
        contacts: formData.contacts,
        location: formData.location.trim(),
        preferences: formData.preferences,
        proposedTimes: formData.proposedTimes.map(time => new Date(time).toISOString())
      };

      setProcessingStatus('🚀 Sending invitations...');

      // Submit to API
      const response = await fetch('/api/meetini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'same-origin',
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textContent = await response.text();
        console.error('Received non-JSON response:', textContent);
        throw new Error('Server returned invalid response format');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      setProcessingStatus('✨ Success! Your Meetini has been created.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Submission error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setProcessingStatus(`❌ ${errorMessage}`);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
        setProcessingStatus(null);
      }, 5000);
    }
  };

  const processVoiceInput = (transcript: string) => {
    setAiPrompt(prev => prev ? `${prev} ${transcript}` : transcript);
  };

  const getNextQuestion = (info: typeof voiceState.requiredInfo) => {
    if (!info.who) return "Who would you like to meet with?";
    if (!info.what) return "What type of meeting would you like to schedule?";
    if (!info.when) return "When would you prefer to meet?";
    if (!info.where) return "Where would you like to meet?";
    return null;
  };

  const stopVoiceRecording = () => {
    if (window.recognition) {
      window.recognition.stop();
      setIsListening(false);
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
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
    // Store recognition instance globally so we can stop it
    window.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      processVoiceInput(transcript);
      
      // After processing the voice input, automatically submit if we have all required info
      const newRequiredInfo = { ...voiceState.requiredInfo };
      let hasAllInfo = true;
      
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

      // Check if we have all required information
      for (const key of ['who', 'what', 'when'] as const) {
        if (!newRequiredInfo[key]) {
          hasAllInfo = false;
        }
      }

      setVoiceState(prev => ({
        ...prev,
        requiredInfo: newRequiredInfo,
        currentQuestion: hasAllInfo ? null : getNextQuestion(newRequiredInfo),
      }));

      // If we have all required info, stop listening and submit
      if (hasAllInfo) {
        stopVoiceRecording();
        handleAISubmit(new Event('submit') as any);
      }
    };

    recognition.onerror = () => {
      setError('Failed to recognize voice. Please try again.');
      stopVoiceRecording();
    };

    recognition.onend = () => {
      if (voiceState.currentQuestion) {
        recognition.start(); // Continue listening if we still have questions
      } else {
        stopVoiceRecording();
      }
    };

    recognition.start();
  };

  const addContact = () => {
    const contact = validateContact(newContact);
    if (contact) {
      console.log('Adding contact:', contact);
      setFormData(prev => {
        const updatedContacts = [...prev.contacts, contact];
        console.log('Updated contacts:', updatedContacts);
        return {
          ...prev,
          contacts: updatedContacts
        };
      });
      setNewContact('');
    } else {
      setProcessingStatus('Invalid email or phone number format');
      setTimeout(() => setProcessingStatus(null), 3000);
    }
  };

  const validateContact = (value: string): Contact | null => {
    const trimmedValue = value.trim();
    // Email validation
    if (trimmedValue.includes('@')) {
      console.log('Validated email contact:', trimmedValue);
      return { type: 'email', value: trimmedValue };
    }
    
    // Phone validation (basic)
    const phoneNumber = trimmedValue.replace(/[^0-9+]/g, '');
    if (phoneNumber.length >= 10) {
      console.log('Validated phone contact:', phoneNumber);
      return { type: 'phone', value: phoneNumber };
    }
    
    return null;
  };

  const removeContact = (index: number) => {
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index)
    }));
  };

  const handleSelectContacts = async () => {
    try {
      setIsSelectingContacts(true);
      
      const selectedContacts = await selectContacts();
      const validContacts = selectedContacts
        .map((contact: PickedContact): ContactResult | null => {
          if (contact.email) {
            return {
              type: 'email',
              value: contact.email,
              name: contact.name
            };
          }
          if (contact.phoneNumber) {
            return {
              type: 'phone',
              value: contact.phoneNumber,
              name: contact.name
            };
          }
          return null;
        })
        .filter((contact): contact is ContactResult => contact !== null);

      setFormData(prev => ({
        ...prev,
        contacts: [...prev.contacts, ...validContacts]
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSelectingContacts(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        
        {/* Form */}
        <div className="relative bg-gray-900 rounded-lg p-6 max-w-2xl w-full border border-gray-800">
          <h2 className="text-xl font-semibold mb-6 text-teal-500">Create New Meetini</h2>
          
          {!creationMode ? (
            <div className="space-y-4">
              <p className="text-gray-300 mb-6">Choose how you'd like to create your Meetini:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setCreationMode('ai')}
                  className="p-6 border border-teal-500 rounded-lg hover:bg-teal-500/10 transition-colors text-left"
                >
                  <h3 className="text-lg font-medium text-teal-500 mb-2">Quick Create with AI</h3>
                  <p className="text-sm text-gray-400">
                    Just tell us what you want! We'll handle the scheduling based on everyone's availability.
                  </p>
                </button>
                <button
                  onClick={() => setCreationMode('manual')}
                  className="p-6 border border-teal-500 rounded-lg hover:bg-teal-500/10 transition-colors text-left"
                >
                  <h3 className="text-lg font-medium text-teal-500 mb-2">Manual Setup</h3>
                  <p className="text-sm text-gray-400">
                    Specify your preferences and let us find the perfect time that works for everyone.
                  </p>
                </button>
              </div>
            </div>
          ) : creationMode === 'ai' ? (
            <form onSubmit={handleAISubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  What would you like to schedule?
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    className="flex-1 p-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g., Schedule a coffee meeting with Jane and John next week"
                  />
                  <button
                    type="button"
                    onClick={isListening ? stopVoiceRecording : startVoiceRecording}
                    className={`p-3 rounded-lg ${
                      isListening 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-teal-500 hover:bg-teal-600'
                    } transition-colors flex items-center gap-2`}
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isListening ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M10 15l-3-3m0 0l3-3m-3 3h12" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      )}
                    </svg>
                    <span className="text-white text-sm">
                      {isListening ? 'Stop Recording' : 'Start Recording'}
                    </span>
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  Just tell us what kind of meeting you want, and we'll handle the rest!
                </p>
              </div>

              {processingStatus && (
                <div className="p-3 bg-teal-500/10 border border-teal-500 rounded text-teal-500">
                  {processingStatus}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreationMode(null)}
                  className="px-4 py-2 rounded text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !aiPrompt.trim()}
                  className="px-4 py-2 rounded text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : 'Create Meetini'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                  placeholder="e.g., Team Coffee Meeting"
                />
              </div>

              {/* Contact Input Section */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Add Participants
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newContact}
                      onChange={e => setNewContact(e.target.value)}
                      onKeyPress={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addContact();
                        }
                      }}
                      className="flex-1 p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                      placeholder="Enter email or phone number"
                    />
                    <button
                      type="button"
                      onClick={addContact}
                      className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors"
                    >
                      Add
                    </button>
                    {isContactPickerAvailable && (
                      <button
                        type="button"
                        onClick={handleSelectContacts}
                        disabled={isSelectingContacts}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-2"
                      >
                        {isSelectingContacts ? (
                          <>
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Selecting...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Select Contacts
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {/* Contact List */}
                  <div className="space-y-2">
                    {formData.contacts.map((contact, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded bg-gray-800 border border-gray-700"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            contact.type === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                          }`}>
                            {contact.type === 'email' ? 'Email' : 'Phone'}
                          </span>
                          <span className="text-gray-300">{contact.value}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeContact(index)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Location Type
                </label>
                <select
                  value={formData.preferences?.locationType || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      locationType: e.target.value as any
                    }
                  }))}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">No preference</option>
                  <option value="coffee">Coffee Shop</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="office">Office</option>
                  <option value="virtual">Virtual Meeting</option>
                  <option value="custom">Custom Location</option>
                </select>
              </div>

              {formData.preferences?.locationType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Custom Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                    placeholder="Enter specific location"
                  />
                </div>
              )}

              {/* Time Selection Section */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Proposed Times
                </label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Date</label>
                      <input
                        type="date"
                        className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => {
                          const selectedDate = e.target.value;
                          const currentTime = formData.proposedTimes[0]?.split('T')[1];
                          
                          if (selectedDate && currentTime) {
                            setFormData(prev => ({
                              ...prev,
                              proposedTimes: [`${selectedDate}T${currentTime}`]
                            }));
                          } else if (selectedDate) {
                            // Store just the date part until time is selected
                            setFormData(prev => ({
                              ...prev,
                              proposedTimes: [selectedDate]
                            }));
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Time</label>
                      <input
                        type="time"
                        className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                        onChange={e => {
                          const selectedTime = e.target.value;
                          const currentDate = formData.proposedTimes[0]?.split('T')[0];
                          
                          if (currentDate && selectedTime) {
                            setFormData(prev => ({
                              ...prev,
                              proposedTimes: [`${currentDate}T${selectedTime}`]
                            }));
                          }
                        }}
                      />
                    </div>
                  </div>
                  {formData.proposedTimes?.map((time, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded bg-gray-800 border border-gray-700">
                      <span className="text-gray-300">
                        {time.includes('T') 
                          ? new Date(time).toLocaleString()
                          : 'Select both date and time'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            proposedTimes: prev.proposedTimes?.filter((_, i) => i !== index)
                          }));
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {processingStatus && (
                <div className="p-3 bg-teal-500/10 border border-teal-500 rounded text-teal-500">
                  {processingStatus}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setCreationMode(null)}
                  className="px-4 py-2 rounded text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Meetini'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
} 