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
 * Extracts potential names from input text using basic heuristics.
 * This is a simple implementation that looks for capitalized words
 * that aren't common meeting-related terms.
 */
export function extractNames(text: string): string[] {
  // Split text into words and clean up
  const words = text.split(/\s+/).map(w => w.trim());
  const names: string[] = [];
  let currentName: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[.,!?]$/, ''); // Remove trailing punctuation
    
    // Check if word starts with capital letter and isn't a common word
    if (
      cleanWord.length > 0 &&
      cleanWord[0] === cleanWord[0].toUpperCase() &&
      !COMMON_WORDS.has(cleanWord.toLowerCase())
    ) {
      currentName.push(cleanWord);
    } else if (currentName.length > 0) {
      // End of a potential name sequence
      names.push(currentName.join(' '));
      currentName = [];
    }
  }

  // Don't forget any name at the end
  if (currentName.length > 0) {
    names.push(currentName.join(' '));
  }

  return names;
}
