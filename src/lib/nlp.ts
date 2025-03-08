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
 * Extracts potential names from input text using basic heuristics.
 * This is a simple implementation that looks for words that could be names
 * by checking against common meeting-related terms.
 */
export function extractNames(text: string): string[] {
  // Split text into words and clean up
  const words = text.split(/\s+/).map(w => w.trim());
  const names: string[] = [];
  let currentName: string[] = [];
  let inNameSequence = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[.,!?]$/, ''); // Remove trailing punctuation
    const lowerWord = cleanWord.toLowerCase();
    
    // Skip empty words or very short words
    if (cleanWord.length <= 1) continue;

    // Check for name indicators
    const isNameIndicator = ['with', 'and', '@', 'for'].includes(lowerWord);
    const nextWord = i < words.length - 1 ? words[i + 1] : '';
    
    // Start name sequence if we see an indicator
    if (isNameIndicator && nextWord) {
      if (currentName.length > 0) {
        names.push(currentName.join(' '));
        currentName = [];
      }
      inNameSequence = true;
      continue;
    }

    // Skip common words and words that look like times
    if (
      (!inNameSequence && COMMON_WORDS.has(lowerWord)) ||
      /^\d{1,2}(:\d{2})?([ap]m)?$/i.test(cleanWord)
    ) {
      if (currentName.length > 0) {
        names.push(currentName.join(' '));
        currentName = [];
      }
      inNameSequence = false;
      continue;
    }

    // If it's capitalized or we're in a name sequence
    if (
      cleanWord[0] === cleanWord[0].toUpperCase() ||
      inNameSequence ||
      currentName.length > 0
    ) {
      currentName.push(cleanWord);
      
      // If next word is a common word or punctuation, end the name
      const nextWordLower = nextWord.toLowerCase().replace(/[.,!?]$/, '');
      if (
        !nextWord ||
        COMMON_WORDS.has(nextWordLower) ||
        ['and', 'with', '@', 'for'].includes(nextWordLower)
      ) {
        if (currentName.length > 0) {
          names.push(currentName.join(' '));
          currentName = [];
        }
        inNameSequence = false;
      }
    }
  }

  // Don't forget any name at the end
  if (currentName.length > 0) {
    names.push(currentName.join(' '));
  }

  // Remove duplicates and very short names
  return [...new Set(names)]
    .filter(name => name.length > 2)
    .map(name => name.trim());
}
