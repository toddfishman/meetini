import { calendar_v3 } from 'googleapis';
import { UnifiedContactSearch } from './contacts/unifiedContactSearch';
import { SmartScheduler } from './smartScheduling/smartScheduler';
import { MeetingType } from './types/preferences';

export interface Contact {
  name: string;
  email?: string;
  confidence: number;
}

export interface Attendee {
  name: string;
  possibleContacts: Contact[];
  selectedContact?: Contact;
}

export interface MeetingPlan {
  organizer: {
    name: string;
    email: string;
  };
  attendees: Attendee[];
  needsContactResolution: boolean;
  ambiguousContacts: boolean;
  suggestedTimes: Array<{
    start: string;
    end: string;
    score: number;
    reason: string;
  }>;
}

export class MeetingPlanner {
  private contactSearch: UnifiedContactSearch;
  private scheduler: SmartScheduler;

  constructor(openaiApiKey: string, calendar: calendar_v3.Calendar) {
    this.contactSearch = new UnifiedContactSearch(openaiApiKey);
    this.scheduler = new SmartScheduler(openaiApiKey, calendar);
  }

  private async extractParticipants(text: string): Promise<string[]> {
    // Use name extraction to find participant names
    const words = text.split(/\s+/);
    const names: string[] = [];
    let currentName = '';

    for (const word of words) {
      // Skip common words and prepositions
      if (['with', 'and', 'for', 'to', 'the', 'a', 'an'].includes(word.toLowerCase())) {
        if (currentName) {
          names.push(currentName.trim());
          currentName = '';
        }
        continue;
      }

      // Check if word starts with capital letter (potential name)
      if (/^[A-Z]/.test(word)) {
        if (currentName) {
          currentName += ' ' + word;
        } else {
          currentName = word;
        }
      } else if (currentName) {
        names.push(currentName.trim());
        currentName = '';
      }
    }

    if (currentName) {
      names.push(currentName.trim());
    }

    return names;
  }

  private async findContacts(name: string, options: { includeSocialNetworks: boolean }): Promise<Contact[]> {
    const contacts = await this.contactSearch.searchContacts(name, {
      includeSocialNetworks: options.includeSocialNetworks,
      includeDeviceContacts: true,
      minConfidence: 0.6
    });

    return contacts.map(c => ({
      name: c.name,
      email: c.email,
      confidence: c.confidence
    }));
  }

  private determineMeetingType(text: string): MeetingType {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('coffee') || lowerText.includes('tea')) {
      return MeetingType.COFFEE;
    }

    if (lowerText.includes('lunch') || lowerText.includes('dinner') || lowerText.includes('meal')) {
      return MeetingType.LUNCH;
    }

    if (lowerText.includes('sync') || lowerText.includes('quick') || lowerText.includes('catch up')) {
      return MeetingType.SYNC;
    }

    return MeetingType.MEETING;
  }

  public async planFromText(
    text: string,
    organizerEmail: string,
    meetingType: MeetingType,
    options: { includeSocialNetworks: boolean }
  ): Promise<MeetingPlan> {
    // Extract participant names from text
    const participantNames = await this.extractParticipants(text);

    // Find possible contacts for each participant
    const attendees: Attendee[] = await Promise.all(
      participantNames.map(async name => {
        const contacts = await this.findContacts(name, options);
        return {
          name,
          possibleContacts: contacts,
          selectedContact: contacts.length === 1 ? contacts[0] : undefined
        };
      })
    );

    // Check for ambiguous or unresolved contacts
    const needsContactResolution = attendees.some(a => !a.selectedContact);
    const ambiguousContacts = attendees.some(a => a.possibleContacts.length > 1);

    // Get scheduling suggestions
    const suggestedTimes = await this.scheduler.findAvailableSlots({
      userId: organizerEmail,
      userPrefs: {
        userId: organizerEmail,
        email: organizerEmail,
        workingHours: {
          0: { start: "09:00", end: "17:00" }, // Sunday
          1: { start: "09:00", end: "17:00" }, // Monday
          2: { start: "09:00", end: "17:00" }, // Tuesday
          3: { start: "09:00", end: "17:00" }, // Wednesday
          4: { start: "09:00", end: "17:00" }, // Thursday
          5: { start: "09:00", end: "17:00" }, // Friday
          6: { start: "09:00", end: "17:00" }  // Saturday
        },
        preferredDays: [1, 2, 3, 4, 5],
        avoidDays: [0, 6],
        calendars: [{ id: 'primary', selected: true }],
        defaultCalendarId: 'primary',
        calendarsToCheck: ['primary'],
        meetingPreferences: {
          [MeetingType.COFFEE]: {
            preferredDuration: 30,
            preferredBuffer: 15,
            preferredLocation: 'Coffee Shop',
            preferredTimeRanges: [
              { start: "10:00", end: "11:00" },
              { start: "15:00", end: "16:00" }
            ]
          },
          [MeetingType.LUNCH]: {
            preferredDuration: 60,
            preferredBuffer: 15,
            preferredLocation: 'Restaurant',
            preferredTimeRanges: [
              { start: "12:00", end: "14:00" }
            ]
          },
          [MeetingType.MEETING]: {
            preferredDuration: 45,
            preferredBuffer: 10,
            preferredLocation: 'Office',
            preferredTimeRanges: [
              { start: "09:30", end: "11:30" },
              { start: "14:00", end: "16:00" }
            ]
          },
          [MeetingType.SYNC]: {
            preferredDuration: 15,
            preferredBuffer: 5,
            preferredLocation: 'Virtual',
            preferredTimeRanges: [
              { start: "09:00", end: "17:00" }
            ]
          }
        },
        minTimeBetweenMeetings: 15,
        maxMeetingsPerDay: 8,
        defaultContext: 'work',
        defaultMeetingLength: 'medium',
        defaultBuffer: 10,
        focusTimeEnabled: true,
        focusTimeBlocks: [
          { start: "09:00", end: "10:00" },
          { start: "14:00", end: "15:00" }
        ],
        focusDays: [1, 3, 5],
        autoScheduleFocusTime: true,
        defaultToVirtual: true,
        defaultNotificationTiming: 15,
        notificationTypes: ['email', 'calendar'],
        timezone: 'America/Los_Angeles',
        autoUpdateTimezone: true,
        defaultVisibility: 'default',
        shareCalendarWith: [],
        aiSuggestionsEnabled: true,
        suggestAlternativeTimes: true,
        suggestLocationBasedOnTime: true,
        suggestBreakup: true,
        preparationTimeNeeded: 10,
        breakdownTimeNeeded: 5,
        considerCommuteTime: true
      },
      meetingType,
      preferredDuration: this.getMeetingDuration(meetingType),
      earliestTime: new Date().toISOString(),
      latestTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    });

    return {
      organizer: {
        name: organizerEmail.split('@')[0],
        email: organizerEmail
      },
      attendees,
      needsContactResolution,
      ambiguousContacts,
      suggestedTimes: suggestedTimes.suggestedTimes
    };
  }

  private getMeetingDuration(type: MeetingType): number {
    switch (type) {
      case MeetingType.COFFEE:
        return 30;
      case MeetingType.LUNCH:
        return 60;
      case MeetingType.MEETING:
        return 45;
      case MeetingType.SYNC:
        return 15;
      default:
        return 30;
    }
  }
}
