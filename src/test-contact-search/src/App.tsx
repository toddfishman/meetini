import React, { useState, useEffect, useCallback } from 'react';
import { UnifiedContactSearch, Contact, SearchOptions } from './lib/contacts/unifiedContactSearch';
import debounce from 'lodash/debounce';
import { SessionProvider } from 'next-auth/react';
import { LoginButtonContainer } from './components/LoginButton';
import { SchedulingTest } from './components/SchedulingTest';

const searchOptions: SearchOptions = {
  includeSocialNetworks: true,
  includeDeviceContacts: true,
  minConfidence: 0.6,
};

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<{
    facebook: boolean;
    linkedin: boolean;
    errors?: { facebook?: string; linkedin?: string };
  }>({ facebook: false, linkedin: false });

  // Initialize contact search
  const contactSearch = new UnifiedContactSearch(import.meta.env.VITE_OPENAI_API_KEY);

  // Check API status on mount
  useEffect(() => {
    const checkApiStatus = async () => {
      const status = await contactSearch.validateApiAccess();
      setApiStatus(status);
    };
    checkApiStatus();
  }, []);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (term: string) => {
      if (!term.trim()) {
        setContacts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const results = await contactSearch.searchContacts(term, searchOptions);
        setContacts(results);
      } catch (err) {
        setError('Error searching contacts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  // Update search when input changes
  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch]);

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'facebook':
        return '#1877F2';
      case 'linkedin':
        return '#0A66C2';
      case 'device':
        return '#34D399';
      default:
        return '#6B7280';
    }
  };

  return (
    <SessionProvider>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <h1 style={{ marginBottom: '20px' }}>Contact Search Demo</h1>
        <LoginButtonContainer />
        <SchedulingTest />
        <div className="api-status">
          <h3>API Status</h3>
          <div className="status-grid">
            <div className={`status-item ${apiStatus.facebook ? 'connected' : 'disconnected'}`}>
              <span className="status-label">Facebook:</span>
              <span className="status-value">
                {apiStatus.facebook ? 'Connected' : 'Disconnected'}
              </span>
              {apiStatus.errors?.facebook && (
                <span className="status-error">{apiStatus.errors.facebook}</span>
              )}
            </div>
            <div className={`status-item ${apiStatus.linkedin ? 'connected' : 'disconnected'}`}>
              <span className="status-label">LinkedIn:</span>
              <span className="status-value">
                {apiStatus.linkedin ? 'Connected' : 'Disconnected'}
              </span>
              {apiStatus.errors?.linkedin && (
                <span className="status-error">{apiStatus.errors.linkedin}</span>
              )}
            </div>
          </div>
        </div>

        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Start typing a name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading && <div className="loading">Searching...</div>}
        {error && <div className="error">{error}</div>}

        <div className="results-container">
          {contacts.map((contact, index) => (
            <div key={index} className="contact-card">
              <div className="contact-header">
                <div className="contact-name">{contact.name}</div>
                <div 
                  className="source-tag"
                  style={{ backgroundColor: getSourceColor(contact.source) }}
                >
                  {contact.source}
                </div>
              </div>
              {contact.email && (
                <div className="contact-email">
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </div>
              )}
              {contact.profileUrl && (
                <div className="contact-profile">
                  <a 
                    href={contact.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profile-link"
                  >
                    View Profile
                  </a>
                </div>
              )}
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{ 
                    width: `${contact.confidence * 100}%`,
                    backgroundColor: getSourceColor(contact.source)
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SessionProvider>
  );
}

export default App;
