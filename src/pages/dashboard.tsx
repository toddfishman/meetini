import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Navbar from '../components/Navbar';
import ConfirmationDialog from '../components/ConfirmationDialog';
import CreateMeetiniForm from '../components/CreateMeetiniForm';

interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime: string;
    date?: string;
  };
  end: {
    dateTime: string;
    date?: string;
  };
}

interface MeetiniInvite {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'declined';
  type: 'sent' | 'received';
  participants: string[];
  createdAt: string;
  proposedTimes: string[];
  location?: string;
  createdBy: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
  const [meetiniInvites, setMeetiniInvites] = useState<MeetiniInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    type: 'danger' | 'success' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
    type: 'warning'
  });

  const fetchInvites = useCallback(async () => {
    try {
      setInviteLoading(true);
      const response = await fetch('/api/meetini');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMeetiniInvites(data);
    } catch (error) {
      console.error('Failed to fetch invites:', error);
      setError('Failed to load invitations');
    } finally {
      setInviteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await fetch('/api/calendar');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setEvents(data);
      } catch (error) {
        console.error('Failed to fetch calendar events:', error);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchEvents();
      fetchInvites();
    }
  }, [session, fetchInvites]);

  useEffect(() => {
    // Check for prompt or openCreateModal in URL when component mounts
    const prompt = router.query.prompt as string;
    const shouldOpenModal = router.query.openCreateModal === 'true';
    
    if (prompt && !initialPrompt) {
      setInitialPrompt(prompt);
      setIsCreateModalOpen(true);
    } else if (shouldOpenModal) {
      setIsCreateModalOpen(true);
      // Remove the query parameter without page reload
      const { openCreateModal, ...query } = router.query;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    }
  }, [router.query, initialPrompt]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-teal-500">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  // Group events by month
  const groupedEvents = events.reduce((groups: { [key: string]: CalendarEvent[] }, event) => {
    const date = new Date(event.start.dateTime || event.start.date || Date.now());
    const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groups[monthYear]) {
      groups[monthYear] = [];
    }
    groups[monthYear].push(event);
    return groups;
  }, {});

  const filteredInvites = meetiniInvites.filter(invite => invite.type === activeTab);

  const getStatusColor = (status: MeetiniInvite['status']) => {
    switch (status) {
      case 'accepted':
        return 'text-green-500';
      case 'declined':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const handleInviteAction = async (id: string, action: 'accept' | 'decline' | 'cancel') => {
    const confirmActions = {
      accept: {
        title: 'Accept Invitation',
        message: 'Are you sure you want to accept this invitation? This will create a calendar event.',
        type: 'success' as const
      },
      decline: {
        title: 'Decline Invitation',
        message: 'Are you sure you want to decline this invitation?',
        type: 'danger' as const
      },
      cancel: {
        title: 'Cancel Invitation',
        message: 'Are you sure you want to cancel this invitation? This cannot be undone.',
        type: 'warning' as const
      }
    };

    const { title, message, type } = confirmActions[action];

    setConfirmDialog({
      isOpen: true,
      title,
      message,
      type,
      action: async () => {
        try {
          // First update the invitation status
          const response = await fetch('/api/meetini', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id, action }),
          });

          const data = await response.json();
          
          if (!response.ok) throw new Error(data.error);
          
          // If accepting, create calendar invitation
          if (action === 'accept') {
            const calendarResponse = await fetch('/api/calendar/invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ invitationId: id }),
            });

            if (!calendarResponse.ok) {
              const calendarError = await calendarResponse.json();
              throw new Error(calendarError.error || 'Failed to create calendar invitation');
            }
          }

          // Update local state based on the action
          if (action === 'cancel') {
            setMeetiniInvites(prev => prev.filter(invite => invite.id !== id));
          } else {
            setMeetiniInvites(prev => 
              prev.map(invite => 
                invite.id === id 
                  ? { ...invite, status: action === 'accept' ? 'accepted' : 'declined' }
                  : invite
              )
            );
          }
        } catch (error) {
          console.error('Failed to update invitation:', error);
          setError(error instanceof Error ? error.message : 'Failed to update invitation');
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <Navbar />
      <div className="pt-40 max-w-4xl mx-auto space-y-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome to Your Dashboard</h1>
            {session?.user?.email && (
              <p className="text-gray-400 mt-1">Logged in as: {session.user.email}</p>
            )}
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors text-sm font-medium"
          >
            Create New Meetini
          </button>
        </div>
        
        {/* Calendar Events Section - Single Row Expandable */}
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <button
            className="w-full p-4 bg-gray-900 text-left font-medium text-teal-500 hover:bg-gray-800 transition-colors flex justify-between items-center"
            onClick={() => setExpandedEvents(prev => 
              prev.length === Object.keys(groupedEvents).length ? [] : Object.keys(groupedEvents)
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">Calendar Events</span>
              {loading && <span className="text-sm text-gray-400">(Loading...)</span>}
            </div>
            <span className="text-sm text-gray-400">
              {events.length} total event{events.length !== 1 ? 's' : ''}
            </span>
          </button>
          
          {expandedEvents.length > 0 && (
            <div className="bg-black/30">
              {Object.entries(groupedEvents).map(([monthYear, monthEvents]) => (
                <div key={monthYear} className="border-t border-gray-800">
                  <div className="p-4">
                    <div className="font-medium text-teal-500 mb-2">{monthYear}</div>
                    <div className="space-y-3">
                      {monthEvents.map((event) => (
                        <div key={event.id} className="pl-4 border-l-2 border-gray-800">
                          <h3 className="font-medium text-white">{event.summary}</h3>
                          <p className="text-sm text-gray-400">
                            {new Date(event.start.dateTime || event.start.date || Date.now()).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meetini Invitations Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Meetini Invitations</h2>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex space-x-4 mb-4">
            <button
              onClick={() => setActiveTab('received')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'received'
                  ? 'bg-teal-500 text-white'
                  : 'text-teal-500 border border-teal-500 hover:bg-teal-500/10'
              }`}
            >
              Received
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'sent'
                  ? 'bg-teal-500 text-white'
                  : 'text-teal-500 border border-teal-500 hover:bg-teal-500/10'
              }`}
            >
              Sent
            </button>
          </div>
          
          <div className="space-y-4">
            {inviteLoading ? (
              <p>Loading invitations...</p>
            ) : filteredInvites.length > 0 ? (
              filteredInvites.map((invite) => (
                <div key={invite.id} className="border border-gray-800 rounded-lg p-4 hover:border-teal-500 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-medium text-teal-500">{invite.title}</h3>
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(invite.status)}`}>
                      {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>
                      <span className="font-medium">Participants: </span>
                      {invite.participants.join(', ')}
                    </p>
                    <p>
                      <span className="font-medium">Location: </span>
                      {invite.location || 'To be determined'}
                    </p>
                    <p>
                      <span className="font-medium">Proposed Times: </span>
                      {invite.proposedTimes.map(time => 
                        new Date(time).toLocaleString()
                      ).join(', ')}
                    </p>
                    <p className="text-xs">
                      Created {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      {invite.type === 'received' && invite.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleInviteAction(invite.id, 'accept')}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleInviteAction(invite.id, 'decline')}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {invite.type === 'sent' && invite.status === 'pending' && (
                        <button
                          onClick={() => handleInviteAction(invite.id, 'cancel')}
                          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No {activeTab} invitations found</p>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateMeetiniForm
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setInitialPrompt(null);
          const { prompt, ...query } = router.query;
          router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
        }}
        onSuccess={() => {
          setInitialPrompt(null);
          fetchInvites();
        }}
        initialPrompt={initialPrompt}
      />

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.action}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />
    </div>
  );
} 