import React, { useState } from 'react';
import { useSession } from 'next-auth/react';

interface Contact {
  name: string;
  email?: string;
  confidence: number;
}

interface SchedulingResult {
  suggestedTimes: Array<{
    start: string;
    end: string;
    score: number;
    reason: string;
  }>;
  conflicts: Array<{
    start: string;
    end: string;
    reason: string;
  }>;
  contacts: Contact[];
  meetingContext?: {
    type: string;
    duration: number;
    isInPerson: boolean;
    location?: string;
  };
}

export function SchedulingTest() {
  const { data: session } = useSession();
  const [input, setInput] = useState('');
  const [results, setResults] = useState<SchedulingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testScheduling = async () => {
    try {
      setLoading(true);
      setError(null);

      // Make API call to test scheduling
      const response = await fetch('/api/test-scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input })
      });

      if (!response.ok) {
        throw new Error('Failed to test scheduling');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Smart Scheduling Test</h2>
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your request (e.g., 'coffee with Todd next week')"
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        <button 
          onClick={testScheduling}
          disabled={loading || !session || !input.trim()}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (!session || !input.trim()) ? 0.5 : 1
          }}
        >
          {loading ? 'Finding times...' : 'Find Available Times'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          Error: {error}
        </div>
      )}

      {results && (
        <div style={{ margin: '20px 0' }}>
          {results.contacts.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3>Identified Contacts:</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {results.contacts.map((contact, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: '10px',
                      backgroundColor: '#f0f8ff',
                      borderRadius: '4px',
                      border: '1px solid #b8d4f5'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{contact.name}</div>
                    {contact.email && (
                      <div style={{ color: '#666', fontSize: '0.9em' }}>
                        {contact.email}
                      </div>
                    )}
                    <div style={{ 
                      color: contact.confidence > 0.7 ? '#28a745' : '#ffc107',
                      fontSize: '0.8em'
                    }}>
                      Match confidence: {Math.round(contact.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3>Suggested Times:</h3>
          {results.suggestedTimes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.meetingContext && (
                <div style={{
                  padding: '10px',
                  backgroundColor: '#e8f4ff',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  border: '1px solid #b8d4f5'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                    Meeting Context:
                  </div>
                  <div style={{ fontSize: '0.9em' }}>
                    Type: {results.meetingContext.type}<br />
                    Duration: {results.meetingContext.duration} minutes<br />
                    {results.meetingContext.location && `Location: ${results.meetingContext.location}`}
                  </div>
                </div>
              )}
              {results.suggestedTimes.map((slot, index) => (
                <div 
                  key={index}
                  style={{
                    padding: '15px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                    border: '1px solid #ddd'
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '8px' }}>
                    {new Date(slot.start).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div style={{ marginBottom: '5px' }}>
                    {new Date(slot.start).toLocaleTimeString()} - {new Date(slot.end).toLocaleTimeString()}
                  </div>
                  <div style={{ 
                    backgroundColor: '#fff',
                    padding: '8px',
                    borderRadius: '4px',
                    marginTop: '8px',
                    fontSize: '0.9em'
                  }}>
                    <div style={{ 
                      color: '#28a745',
                      marginBottom: '4px'
                    }}>
                      Confidence: {Math.round(slot.score * 100)}%
                    </div>
                    <div style={{ color: '#666' }}>
                      {slot.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No suitable times found. Try adjusting your request.</p>
          )}

          {results.conflicts.length > 0 && (
            <>
              <h3>Conflicts:</h3>
              <div style={{ color: '#666', fontSize: '0.9em' }}>
                {results.conflicts.length} time slots had conflicts
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
