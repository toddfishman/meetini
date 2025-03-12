// Meeting-related terms categorized by type
export const MEETING_TERMS = {
  general: [
    'meeting', 'schedule', 'appointment', 'arrange', 'set up', 'book', 'reserve',
    'organize', 'plan', 'conference', 'discussion', 'check-in', 'meetup', 'call',
    'chat', 'session', 'gathering', 'connect', 'catch up', 'sync', 'stand-up',
    'one-on-one', '1-on-1', 'brainstorm', 'huddle', 'briefing', 'touch base'
  ],
  inPerson: [
    'face-to-face', 'meet in person', 'physical meeting', 'office meeting',
    'on-site meeting', 'coffee meeting', 'lunch meeting', 'dinner meeting',
    'walk-and-talk'
  ],
  phone: [
    'phone call', 'voice call', 'dial in', 'conference call', 'group call',
    'audio call', 'landline call', 'cell phone call', 'mobile call', 'talk',
    'ring'
  ],
  virtual: [
    'web conference', 'web call', 'video call', 'video chat', 'video meeting',
    'virtual meeting', 'online meeting', 'zoom', 'google meet', 'google meeting',
    'google hangout', 'microsoft teams', 'teams call', 'teams meeting', 'webex',
    'cisco webex', 'skype', 'skype call', 'gotomeeting', 'gotowebinar',
    'bluejeans', 'facetime', 'slack call', 'discord call', 'ringcentral',
    'hopin', 'livestorm', 'streamyard', 'virtual huddle'
  ],
  hybrid: [
    'hybrid meeting', 'mixed meeting', 'part virtual', 'part in-person',
    'in-office and online', 'dual-mode meeting', 'on-site and remote'
  ],
  recurring: [
    'weekly meeting', 'daily stand-up', 'biweekly meeting', 'monthly meeting',
    'quarterly check-in', 'annual review', 'follow-up', 'regular sync',
    'status update', 'ongoing meeting'
  ],
  casual: [
    'coffee chat', 'lunch catch-up', 'dinner meetup', 'happy hour',
    'informal chat', 'social call', 'quick chat'
  ],
  urgent: [
    'emergency meeting', 'last-minute call', 'immediate sync', 'crisis meeting',
    'urgent discussion', 'priority meeting'
  ]
};

// Common words that often appear in meeting requests but aren't names
const COMMON_WORDS = new Set([
  'meet', 'meeting', 'schedule', 'with', 'and', 'setup', 'set', 'up', 'organize',
  'plan', 'discuss', 'catch', 'sync', 'connect', 'chat', 'talk', 'call', 'video',
  'zoom', 'teams', 'morning', 'afternoon', 'evening', 'tomorrow', 'today', 'next',
  'week', 'month', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'minutes', 'hour', 'hours', 'virtual', 'in-person',
  'coffee', 'lunch', 'dinner', 'breakfast', 'please', 'would', 'like', 'want',
  'need', 'must', 'should', 'could', 'can', 'will', 'about', 'regarding',
  'concerning', 'quick', 'brief', 'long', 'short'
]);

// Extracted name with its position in the input
interface ExtractedName {
  name: string;
  position: number;
}

interface MeetingPattern {
  type: string;
  phrases: string[];
  keywords: string[];
  prefix?: string;
}

const meetingPatterns: MeetingPattern[] = [
  {
    type: 'Coffee Chat',
    phrases: ['coffee chat', 'coffee meeting', 'grab coffee', 'get coffee'],
    keywords: ['coffee', 'starbucks', 'cafe']
  },
  {
    type: 'Happy Hour',
    phrases: ['happy hour', 'drinks after work', 'team drinks', 'virtual happy hour'],
    keywords: ['drinks', 'beer', 'wine', 'happy', 'hour']
  },
  {
    type: 'Team Sync',
    phrases: ['team sync', 'team meeting', 'team catchup', 'team check-in'],
    keywords: ['sync', 'team', 'catchup', 'check-in', 'check in', 'standup']
  },
  {
    type: 'Virtual Meeting',
    phrases: ['virtual meeting', 'video call', 'zoom call', 'google meet'],
    keywords: ['virtual', 'zoom', 'teams', 'google meet', 'online', 'call', 'video'],
    prefix: 'Virtual'
  },
  {
    type: '1:1',
    phrases: ['1:1', 'one on one', 'one-on-one', '1 on 1'],
    keywords: ['1:1', 'one-on-one', '1on1']
  },
  {
    type: 'Lunch',
    phrases: ['lunch meeting', 'lunch and learn', 'team lunch'],
    keywords: ['lunch', 'meal']
  }
];

/**
 * Detects the type of meeting from the input text
 */
export function detectMeetingType(text: string): {
  type: 'virtual' | 'phone' | 'in-person' | 'hybrid' | undefined;
  confidence: number;
} {
  const lowercaseText = text.toLowerCase();
  
  // Check each category
  const matches = {
    virtual: MEETING_TERMS.virtual.filter(term => lowercaseText.includes(term.toLowerCase())).length,
    phone: MEETING_TERMS.phone.filter(term => lowercaseText.includes(term.toLowerCase())).length,
    inPerson: MEETING_TERMS.inPerson.filter(term => lowercaseText.includes(term.toLowerCase())).length,
    hybrid: MEETING_TERMS.hybrid.filter(term => lowercaseText.includes(term.toLowerCase())).length
  };

  // Find the category with the most matches
  const maxMatches = Math.max(...Object.values(matches));
  if (maxMatches === 0) {
    return { type: undefined, confidence: 0 };
  }

  // Calculate confidence based on how many more matches the top category has
  const sortedCategories = Object.entries(matches)
    .sort(([,a], [,b]) => b - a);
  
  const confidence = sortedCategories[0][1] / 
    (sortedCategories.slice(1).reduce((sum, [,count]) => sum + count, 0) || 1);

  // Map the category name to the return type
  const typeMap: Record<string, 'virtual' | 'phone' | 'in-person' | 'hybrid'> = {
    virtual: 'virtual',
    phone: 'phone',
    inPerson: 'in-person',
    hybrid: 'hybrid'
  };

  return {
    type: typeMap[sortedCategories[0][0]],
    confidence: Math.min(confidence, 1)
  };
}

/**
 * Detects the purpose of a meeting from the input text
 */
export function detectMeetingPurpose(prompt: string): { type: string; confidence: number } {
  const promptLower = prompt.toLowerCase();
  
  // First, check for exact phrases with highest confidence
  for (const pattern of meetingPatterns) {
    for (const phrase of pattern.phrases) {
      if (promptLower.includes(phrase)) {
        return { 
          type: pattern.type,
          confidence: 0.95 
        };
      }
    }
  }

  // Then check for keyword matches with medium confidence
  for (const pattern of meetingPatterns) {
    for (const keyword of pattern.keywords) {
      if (promptLower.includes(keyword)) {
        // If it's a virtual keyword and we find location markers, don't match
        if (pattern.type === 'Virtual Meeting' && 
            (promptLower.includes('office') || promptLower.includes('at '))) {
          continue;
        }
        
        return { 
          type: pattern.type,
          confidence: 0.8 
        };
      }
    }
  }

  // Check for custom meeting types (e.g., "Monthly Planning", "Design Review")
  const customTypeMatch = prompt.match(/\b(monthly|weekly|quarterly|annual|design|planning|review|strategy|brainstorm)\s+(\w+)\b/i);
  if (customTypeMatch) {
    const customType = titleCase(customTypeMatch[0]);
    // If it contains virtual keywords, prefix it
    if (promptLower.includes('virtual') || promptLower.includes('zoom') || promptLower.includes('online')) {
      return { type: `Virtual ${customType}`, confidence: 0.85 };
    }
    return { type: customType, confidence: 0.85 };
  }

  // Default to a generic meeting type
  return { 
    type: promptLower.includes('virtual') || promptLower.includes('zoom') ? 'Virtual Meeting' : 'Meeting',
    confidence: 0.6 
  };
}

/**
 * Extracts potential names from input text using basic heuristics.
 * This is a simple implementation that looks for words that could be names
 * by checking against common meeting-related terms.
 */
export function extractNames(text: string): string[] {
  // Don't try to extract names if the input is too short
  if (text.length < 3) return [];

  const nameGroups: ExtractedName[] = [];
  let currentGroup: string[] = [];
  let groupStart = -1;

  // Split and normalize input
  const words = text.toLowerCase().split(/\s+/).map(w => w.trim());
  
  // Only process if we have actual words
  if (words.length === 0 || words[0].length < 2) {
    return [];
  }
  
  // If there's only one word and it's not in common words, treat it as a name
  if (words.length === 1 && !COMMON_WORDS.has(words[0]) && words[0].length > 1) {
    return [words[0]];
  }
  
  // Process words with a sliding window
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[.,!?]$/, '');
    
    // Skip very short words or single letters
    if (cleanWord.length < 2) continue;

    // Check for name group markers
    if (['with', 'and', 'for', '@'].includes(cleanWord)) {
      // Save current group if exists and has valid length
      if (currentGroup.length > 0 && currentGroup.join(' ').length > 1) {
        nameGroups.push({
          name: currentGroup.join(' '),
          position: groupStart
        });
        currentGroup = [];
      }
      groupStart = i + 1;
      continue;
    }

    // Skip if it's a common word or looks like a time
    if (
      COMMON_WORDS.has(cleanWord) ||
      /^\d{1,2}(:\d{2})?([ap]m)?$/i.test(cleanWord)
    ) {
      if (currentGroup.length > 0 && currentGroup.join(' ').length > 1) {
        nameGroups.push({
          name: currentGroup.join(' '),
          position: groupStart
        });
        currentGroup = [];
      }
      groupStart = -1;
      continue;
    }

    // If we're in a group or starting a new one
    if (groupStart === -1) groupStart = i;
    currentGroup.push(cleanWord);

    // Check if this is the end of a name group
    const nextWord = i < words.length - 1 ? words[i + 1].toLowerCase().replace(/[.,!?]$/, '') : '';
    if (
      !nextWord ||
      ['with', 'and', 'for', '@'].includes(nextWord) ||
      COMMON_WORDS.has(nextWord)
    ) {
      if (currentGroup.length > 0 && currentGroup.join(' ').length > 1) {
        nameGroups.push({
          name: currentGroup.join(' '),
          position: groupStart
        });
        currentGroup = [];
        groupStart = -1;
      }
    }
  }

  // Add any remaining group if it has valid length
  if (currentGroup.length > 0 && currentGroup.join(' ').length > 1) {
    nameGroups.push({
      name: currentGroup.join(' '),
      position: groupStart
    });
  }

  // Sort by position and return unique names with minimum length
  return [...new Set(
    nameGroups
      .sort((a, b) => a.position - b.position)
      .map(group => group.name)
      .filter(name => name.length > 2)
  )];
}

/**
 * Formats a meeting title based on the meeting type and participants
 */
export function formatMeetingTitle(type: string, participants: string[]): string {
  const participantNames = participants.map(email => {
    const name = email.split('@')[0];
    return titleCase(name);
  }).join('/');

  return `${type} with ${participantNames}`;
}
