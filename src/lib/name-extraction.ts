import { NamedEntity } from './types';

// Common words that should be ignored when looking for names
const COMMON_WORDS = new Set([
  'meeting', 'schedule', 'set', 'up', 'with', 'and', 'the', 'for', 'about',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'tomorrow', 'next', 'week', 'morning', 'afternoon', 'evening',
  'call', 'chat', 'sync', 'review', 'discussion', 'meetini',
  'please', 'would', 'like', 'want', 'need', 'should', 'must',
  'zoom', 'teams', 'meet', 'google', 'calendar', 'email', 'phone',
  'minutes', 'hours', 'today', 'tonight', 'am', 'pm',
  'coffee', 'lunch', 'dinner', 'breakfast', 'meeting',
]);

// Common name prefixes that might appear before names
const NAME_PREFIXES = new Set(['mr', 'mrs', 'ms', 'dr', 'prof']);

interface ExtractedName {
  name: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export function extractNames(text: string): ExtractedName[] {
  const words = text.split(/[\s,]+/);
  const extractedNames: ExtractedName[] = [];
  let skipNextWord = false;

  for (let i = 0; i < words.length; i++) {
    if (skipNextWord) {
      skipNextWord = false;
      continue;
    }

    const word = words[i];
    const nextWord = words[i + 1];
    const cleanWord = word.replace(/[.,!?]$/, '').toLowerCase();
    
    // Skip common words and short words
    if (COMMON_WORDS.has(cleanWord) || word.length < 2) continue;

    let confidence = 0;
    let extractedName = '';
    let wordCount = 1;

    // Check if current word starts with capital letter
    if (word[0] === word[0].toUpperCase()) {
      confidence += 0.3;
    }

    // Check for name prefixes
    if (NAME_PREFIXES.has(cleanWord) && nextWord?.[0] === nextWord?.[0].toUpperCase()) {
      extractedName = nextWord;
      confidence += 0.3;
      skipNextWord = true;
    } else {
      extractedName = word;
    }

    // Check for full names (e.g., "John Smith")
    if (nextWord && !skipNextWord) {
      const nextCleanWord = nextWord.replace(/[.,!?]$/, '').toLowerCase();
      if (
        nextWord[0] === nextWord[0].toUpperCase() && // Starts with capital
        !COMMON_WORDS.has(nextCleanWord) && // Not a common word
        nextWord.length > 1 // Not too short
      ) {
        extractedName = `${word} ${nextWord}`;
        confidence += 0.2;
        wordCount = 2;
        skipNextWord = true;
      }
    }

    // Additional confidence rules
    if (
      !extractedName.includes('@') && // Not an email
      !/\d/.test(extractedName) && // No numbers
      extractedName.length > 2 && // Not too short
      !/^[A-Z]+$/.test(extractedName) // Not all caps
    ) {
      confidence += 0.2;
    }

    // Context-based confidence boost
    const prevWord = i > 0 ? words[i - 1].toLowerCase() : '';
    if (['with', 'and', 'to'].includes(prevWord)) {
      confidence += 0.2;
    }

    // Only include names with sufficient confidence
    if (confidence > 0.4) {
      extractedNames.push({
        name: extractedName,
        confidence: Math.min(1, confidence),
        startIndex: text.indexOf(extractedName),
        endIndex: text.indexOf(extractedName) + extractedName.length
      });
      i += wordCount - 1;
    }
  }

  return extractedNames;
}

export function parseInput(text: string): NamedEntity[] {
  const extractedNames = extractNames(text);
  
  return extractedNames.map(({ name, confidence }) => ({
    type: 'PERSON',
    text: name,
    confidence
  }));
}
