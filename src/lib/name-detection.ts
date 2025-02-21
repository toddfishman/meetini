// Common words that might appear in meeting-related text but aren't names
const COMMON_WORDS = new Set([
  'Meeting', 'Schedule', 'Set', 'Up', 'With', 'And', 'The', 'For', 'About',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'Tomorrow', 'Next', 'Week',
  'Morning', 'Afternoon', 'Evening', 'Coffee', 'Lunch', 'Dinner', 'Call',
  'Meeting', 'Discussion', 'Chat', 'Review', 'Sync', 'Catchup', 'Team'
]);

// Common name prefixes that might appear before names
const NAME_PREFIXES = new Set(['Mr', 'Mrs', 'Ms', 'Dr', 'Prof']);

export function extractPotentialNames(text: string): string[] {
  // Split text into words and clean them
  const words = text.split(/[\s,]+/).map(word => word.trim());
  const potentialNames: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = words[i + 1];
    
    // Skip if it's a common word or too short
    if (COMMON_WORDS.has(word) || word.length < 2) continue;

    // Check for name patterns
    const isCapitalized = word[0] === word[0].toUpperCase();
    const hasNoNumbers = !/\d/.test(word);
    const isNotAllCaps = word !== word.toUpperCase();
    const isNotEmail = !word.includes('@');
    
    if (isCapitalized && hasNoNumbers && isNotAllCaps && isNotEmail) {
      // Check for prefix + name pattern (e.g., "Mr Smith")
      if (NAME_PREFIXES.has(word) && nextWord) {
        potentialNames.push(nextWord);
        i++; // Skip next word since we've used it
        continue;
      }

      // Check for full name pattern (e.g., "John Smith")
      if (nextWord && 
          nextWord[0] === nextWord[0].toUpperCase() && 
          !COMMON_WORDS.has(nextWord)) {
        potentialNames.push(`${word} ${nextWord}`);
        i++; // Skip next word since we've used it
        continue;
      }

      // Single capitalized word that's not a common word
      potentialNames.push(word);
    }
  }

  // Remove duplicates and return
  return [...new Set(potentialNames)];
}

export function scoreNameConfidence(name: string): number {
  let score = 0;

  // Length-based scoring
  if (name.length > 2) score += 0.2;
  if (name.length > 4) score += 0.2;

  // Case-based scoring
  if (name[0] === name[0].toUpperCase()) score += 0.3;
  if (name.slice(1) === name.slice(1).toLowerCase()) score += 0.2;

  // Full name scoring
  if (name.includes(' ')) {
    const [first, last] = name.split(' ');
    if (first[0] === first[0].toUpperCase() && 
        last[0] === last[0].toUpperCase()) {
      score += 0.3;
    }
  }

  return Math.min(1, score);
}
