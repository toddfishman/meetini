export type MeetingContext = 'work' | 'personal' | 'both';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
export type MeetingLength = 'short' | 'medium' | 'long';
export type NotificationType = 'email' | 'push' | 'slack' | 'calendar';

export interface TimePreference {
  start: string; // Format: "HH:mm"
  end: string; // Format: "HH:mm"
}

export interface Calendar {
  id: string;
  selected: boolean;
}

export interface MeetingTypePreference {
  preferredDuration?: number;
  preferredBuffer?: number;
  preferredLocation?: string;
  preferredTimeRanges?: TimePreference[];
}

export interface UserPreferences {
  userId: string;
  email: string;
  workingHours: {
    [key: number]: TimePreference; // Key is day of week (0-6, Sunday-Saturday)
  };
  preferredDays: number[]; // Days of week (0-6)
  avoidDays: number[]; // Days of week (0-6)
  calendars: Calendar[];
  defaultCalendarId: string;
  calendarsToCheck?: string[];
  meetingPreferences: {
    [key in MeetingType]: MeetingTypePreference;
  };
  minTimeBetweenMeetings: number;
  maxMeetingsPerDay: number;
  defaultContext: 'work' | 'personal' | 'both';
  defaultMeetingLength: 'short' | 'medium' | 'long';
  defaultBuffer: number;
  focusTimeEnabled: boolean;
  focusTimeBlocks: TimePreference[];
  focusDays: number[];
  autoScheduleFocusTime: boolean;
  defaultToVirtual: boolean;
  defaultNotificationTiming: number;
  notificationTypes: ('email' | 'push' | 'slack' | 'calendar')[];
  timezone: string;
  autoUpdateTimezone: boolean;
  defaultVisibility: 'default' | 'private' | 'public';
  shareCalendarWith: string[];
  aiSuggestionsEnabled: boolean;
  suggestAlternativeTimes: boolean;
  suggestLocationBasedOnTime: boolean;
  suggestBreakup: boolean;
  preparationTimeNeeded: number;
  breakdownTimeNeeded: number;
  considerCommuteTime: boolean;
}

export enum MeetingType {
  COFFEE = 'coffee',
  LUNCH = 'lunch',
  MEETING = 'meeting',
  SYNC = 'sync'
}
