import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Contact {
  id: string;
  type: 'email' | 'phone';
  value: string;
  name?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  contacts: Contact[];
}

export default function GroupManager() {
  const { data: session } = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (session) {
      loadGroups();
    }
  }, [session]);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch('/api/groups');
      if (!res.ok) {
        throw new Error('Failed to load groups');
      }

      const data = await res.json();
      setGroups(data);
    } catch {
      setError('Failed to load groups. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    try {
      setError(null);
      
      if (!newGroup.name.trim()) {
        setError('Group name is required');
        return;
      }

      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      });

      if (!res.ok) {
        throw new Error('Failed to create group');
      }

      const createdGroup = await res.json();
      setGroups([...groups, createdGroup]);
      setIsCreating(false);
      setNewGroup({ name: '', description: '' });
    } catch {
      setError('Failed to create group. Please try again.');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      setError(null);

      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete group');
      }

      setGroups(groups.filter(group => group.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
    } catch {
      setError('Failed to delete group. Please try again.');
    }
  };

  const handleRemoveContact = async (groupId: string, contactId: string) => {
    try {
      setError(null);

      const res = await fetch(`/api/groups/${groupId}/contacts/${contactId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to remove contact');
      }

      const updatedGroup = await res.json();
      setGroups(groups.map(group => 
        group.id === groupId ? updatedGroup : group
      ));
      setSelectedGroup(updatedGroup);
    } catch {
      setError('Failed to remove contact. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse text-teal-500">Loading groups...</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6 p-4">
      {/* Groups List */}
      <div className="col-span-1 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-teal-500">Groups</h3>
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1 rounded text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            New Group
          </button>
        </div>

        <div className="space-y-2">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className={`w-full p-3 rounded text-left ${
                selectedGroup?.id === group.id
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              } transition-colors`}
            >
              <div className="font-medium">{group.name}</div>
              {group.description && (
                <div className="text-sm opacity-75">{group.description}</div>
              )}
              <div className="text-xs mt-1">
                {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Group Details */}
      <div className="col-span-2">
        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500 rounded text-red-500">
            {error}
          </div>
        )}

        {isCreating ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-teal-500">Create New Group</h3>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Group Name
              </label>
              <input
                type="text"
                value={newGroup.name}
                onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                placeholder="Enter group name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={newGroup.description}
                onChange={e => setNewGroup({ ...newGroup, description: e.target.value })}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-teal-500"
                placeholder="Enter group description"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewGroup({ name: '', description: '' });
                }}
                className="px-4 py-2 rounded text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 rounded text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition-colors"
              >
                Create Group
              </button>
            </div>
          </div>
        ) : selectedGroup ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-teal-500">{selectedGroup.name}</h3>
              <button
                onClick={() => handleDeleteGroup(selectedGroup.id)}
                className="px-3 py-1 rounded text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                Delete Group
              </button>
            </div>

            {selectedGroup.description && (
              <p className="text-gray-400">{selectedGroup.description}</p>
            )}

            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">Contacts</h4>
              <div className="space-y-2">
                {selectedGroup.contacts.map(contact => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-2 bg-gray-800 rounded"
                  >
                    <div>
                      {contact.name && (
                        <div className="font-medium">{contact.name}</div>
                      )}
                      <div className="text-sm text-gray-400">
                        {contact.value}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveContact(selectedGroup.id, contact.id)}
                      className="text-red-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            Select a group or create a new one to get started
          </div>
        )}
      </div>
    </div>
  );
} 