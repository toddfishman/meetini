/**
 * Converts a string to title case, handling special cases
 */
export function titleCase(str: string): string {
  // Special cases for common abbreviations and words
  const specialCases: { [key: string]: string } = {
    '1:1': '1:1',
    'zoom': 'Zoom',
    'google': 'Google',
    'meet': 'Meet',
    'ai': 'AI'
  };

  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Check for special cases first
      if (specialCases[word]) {
        return specialCases[word];
      }
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Formats a date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

/**
 * Generates a list of time slots for a given date
 */
export function generateTimeSlots(date: Date, intervalMinutes: number = 30): Date[] {
  const slots: Date[] = [];
  const startHour = 9; // 9 AM
  const endHour = 17; // 5 PM

  const start = new Date(date);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(date);
  end.setHours(endHour, 0, 0, 0);

  let current = start;
  while (current <= end) {
    slots.push(new Date(current));
    current = new Date(current.getTime() + intervalMinutes * 60000);
  }

  return slots;
}

/**
 * Formats an email for display
 */
export function formatEmailDisplay(email: string): string {
  const [name] = email.split('@');
  return titleCase(name.replace(/[._]/g, ' '));
}

/**
 * Generates a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
