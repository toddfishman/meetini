import { FaEnvelope, FaAddressBook, FaLinkedin, FaFacebook, FaPlus } from 'react-icons/fa';

const sourceIcons = {
  email: FaEnvelope,
  phone: FaAddressBook,
  linkedin: FaLinkedin,
  facebook: FaFacebook
} as const;

interface ContactResultProps {
  contact: {
    name: string;
    email: string;
    source: keyof typeof sourceIcons;
    confidence: number;
    lastContact?: string;
    reason?: string;
  };
  onSelect: () => void;
  isSelected: boolean;
}

export const ContactResult = ({ contact, onSelect, isSelected }: ContactResultProps) => {
  const Icon = sourceIcons[contact.source];

  return (
    <button
      onClick={onSelect}
      className="w-full px-4 py-2 flex items-center justify-between bg-[#1a1d23] hover:bg-[#2f3336] rounded-lg transition-colors"
    >
      <div className="flex items-center flex-1 min-w-0">
        <Icon className="w-4 h-4 text-gray-400 mr-3 flex-shrink-0" />
        <div className="truncate">
          <div className="text-white text-left truncate">{contact.name}</div>
          <div className="text-gray-400 text-sm text-left truncate">
            {contact.email}
            {contact.lastContact && (
              <span className="ml-2 text-xs">· Last contact: {contact.lastContact}</span>
            )}
            {contact.reason && (
              <span className="ml-2 text-xs">· {contact.reason}</span>
            )}
            {contact.confidence >= 0.9 && (
              <span className="ml-2 text-xs text-[#22c55e]">· Best match</span>
            )}
          </div>
        </div>
      </div>
      {!isSelected ? (
        <div className="text-[#22c55e] ml-2 flex-shrink-0">
          <FaPlus className="w-4 h-4" />
        </div>
      ) : (
        <div className="text-gray-400 ml-2 flex-shrink-0">Added</div>
      )}
    </button>
  );
};

export default ContactResult;
