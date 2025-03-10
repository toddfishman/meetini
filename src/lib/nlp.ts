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
  'concerning', 'quick', 'brief', 'long', 'short', 'happy', 'hour', 'the', 'a', 'an',
  'have', 'has', 'had', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'at', 'in', 'on', 'for', 'of', 'from', 'by'
]);

// Name markers that indicate a name might follow
const NAME_MARKERS = new Set(['with', 'and', 'for', '@', ',']);

// Extracted name with its position in the input
interface ExtractedName {
  name: string;
  position: number;
}

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
  // Clean and normalize the input
  const cleanedText = text.toLowerCase()
    .replace(/[.!?]/g, '') // Remove sentence endings
    .replace(/,/g, ' and ') // Convert commas to 'and'
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  const words = cleanedText.split(' ');
  
  // If there's only one word and it's not common, treat it as a name
  if (words.length === 1 && !COMMON_WORDS.has(words[0]) && words[0].length > 1) {
    return [words[0]];
  }

  const nameGroups: ExtractedName[] = [];
  let currentGroup: string[] = [];
  let groupStart = -1;
  let expectingName = false;

  // Process words sequentially
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Skip very short words
    if (word.length <= 1) continue;

    // Check if this word indicates a name might follow
    if (NAME_MARKERS.has(word)) {
      // Save any current group
      if (currentGroup.length > 0) {
        nameGroups.push({
          name: currentGroup.join(' '),
          position: groupStart
        });
        currentGroup = [];
      }
      expectingName = true;
      groupStart = i + 1;
      continue;
    }

    // If this is a common word and we're not expecting a name, skip it
    if (COMMON_WORDS.has(word) && !expectingName) {
      if (currentGroup.length > 0) {
        nameGroups.push({
          name: currentGroup.join(' '),
          position: groupStart
        });
        currentGroup = [];
      }
      groupStart = -1;
      continue;
    }

    // If we're expecting a name or this word isn't common, add it to current group
    if (expectingName || !COMMON_WORDS.has(word)) {
      if (groupStart === -1) groupStart = i;
      currentGroup.push(word);
      expectingName = false;

      // Check if next word indicates end of name
      const nextWord = i < words.length - 1 ? words[i + 1] : '';
      if (!nextWord || NAME_MARKERS.has(nextWord) || COMMON_WORDS.has(nextWord)) {
        if (currentGroup.length > 0) {
          nameGroups.push({
            name: currentGroup.join(' '),
            position: groupStart
          });
          currentGroup = [];
          groupStart = -1;
        }
      }
    }
  }

  // Add any remaining group
  if (currentGroup.length > 0) {
    nameGroups.push({
      name: currentGroup.join(' '),
      position: groupStart
    });
  }

  // Sort by position and return unique names
  return [...new Set(
    nameGroups
      .sort((a, b) => a.position - b.position)
      .map(group => group.name)
      .filter(name => name.length > 2)
  )];
}
