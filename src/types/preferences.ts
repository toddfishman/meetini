// Define focus time block
export interface FocusTimeBlock {
  start: string;
  end: string;
  days: number[];
}

// Define preferred time
export interface PreferredTime {
  type: string;
  time: string;
}

// Define personal event
export interface PersonalEvent {
  title: string;
  start: string;
  end: string;
  days: number[];
}

// Define meal time
export interface MealTime {
  type: string;
  start: string;
  end: string;
}

// Define the expanded preferences interface
export interface UserPreferencesData {
  // Working Hours & Schedule
  workingHours: { start: string; end: string };
  workDays: number[];
  timezone: string;
  bufferTime?: number;
  maxMeetingsPerDay?: number;
  focusTimeBlocks?: FocusTimeBlock[];
  
  // Location Settings
  homeLocation?: string;
  officeLocation?: string;
  maxTravelTime?: number;
  maxTravelDistance?: number;
  preferredTransport?: string;
  gpsEnabled?: boolean;
  noGoZones?: string[];
  
  // Meeting Preferences
  defaultDuration?: number;
  preferredTimes?: PreferredTime[];
  virtualMeetingUrl?: string;
  defaultMeetingType?: string;
  preferredPlatforms?: string[];
  
  // Personal Time
  personalEvents?: PersonalEvent[];
  mealTimes?: MealTime[];
  
  // Notification Preferences
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  travelAlerts?: boolean;
  weatherAlerts?: boolean;
  
  // Calendar Settings
  defaultCalendarId?: string;
  calendarVisibility?: { [key: string]: boolean };
  
  // Smart Scheduling
  smartSchedulingEnabled?: boolean;
  priorityLevels?: { [key: string]: number };
  autoDeclineRules?: { type: string; condition: string }[];
  workLifeBalance?: { maxWorkHours: number; noMeetingsAfter: string };
  
  // Legacy fields for backward compatibility
  meetingTypes?: string[];
  virtualPlatforms?: string[];
}

// Default preferences
export const defaultPreferences: UserPreferencesData = {
  workingHours: { start: '09:00', end: '17:00' },
  workDays: [1, 2, 3, 4, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bufferTime: 15,
  maxMeetingsPerDay: 8,
  focusTimeBlocks: [],
  defaultDuration: 30,
  preferredTimes: [],
  defaultMeetingType: 'virtual',
  preferredPlatforms: ['Google Meet'],
  emailNotifications: true,
  smsNotifications: false,
  travelAlerts: true,
  weatherAlerts: true,
  gpsEnabled: false,
  maxTravelTime: 30,
  maxTravelDistance: 5,
  preferredTransport: 'driving',
  personalEvents: [],
  mealTimes: [
    { type: 'lunch', start: '12:00', end: '13:00' }
  ],
  calendarVisibility: { work: true, personal: true },
  smartSchedulingEnabled: false,
  meetingTypes: ['Virtual', 'In Person'],
  virtualPlatforms: ['Google Meet', 'Zoom']
};
