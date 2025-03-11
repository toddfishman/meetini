import React from 'react';
import { FiMail, FiClock, FiCheck } from 'react-icons/fi';

interface Contact {
  email: string;
  name?: string;
  interactionCount?: number;
  lastInteraction?: string;
  selected?: boolean;
}

interface ContactDisplayProps {
  contact: Contact;
  onSelect?: (contact: Contact) => void;
  selected?: boolean;
  showInteractionMetrics?: boolean;
}

const ContactDisplay: React.FC<ContactDisplayProps> = ({
  contact,
  onSelect,
  selected = false,
  showInteractionMetrics = true
}) => {
  const getInteractionLevel = (count?: number) => {
    if (!count) return 'low';
    if (count > 50) return 'high';
    if (count > 20) return 'medium';
    return 'low';
  };

  const formatLastInteraction = (date?: string) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <div 
      className={`flex items-center p-3 rounded-lg transition-all duration-200 ${
        selected 
          ? 'bg-blue-100 dark:bg-blue-900' 
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      } ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={() => onSelect?.(contact)}
    >
      <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
        {contact.name?.[0]?.toUpperCase() || contact.email[0].toUpperCase()}
      </div>
      
      <div className="ml-3 flex-grow">
        <div className="flex items-center">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {contact.name || contact.email}
          </span>
          {selected && (
            <FiCheck className="ml-2 text-green-500" />
          )}
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <FiMail className="inline-block" />
          <span>{contact.email}</span>
        </div>
        
        {showInteractionMetrics && contact.interactionCount && (
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className={`
              px-2 py-0.5 rounded-full
              ${getInteractionLevel(contact.interactionCount) === 'high' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : getInteractionLevel(contact.interactionCount) === 'medium'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }
            `}>
              {contact.interactionCount} interactions
            </span>
            
            {contact.lastInteraction && (
              <span className="flex items-center text-gray-500 dark:text-gray-400">
                <FiClock className="mr-1" />
                {formatLastInteraction(contact.lastInteraction)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactDisplay;
