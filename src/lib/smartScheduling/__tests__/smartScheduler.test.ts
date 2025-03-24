import { SmartScheduler } from '../smartScheduler';
import { calendar_v3 } from 'googleapis';
import { MeetingType } from '../../types/preferences';

describe('SmartScheduler', () => {
  let scheduler: SmartScheduler;
  let mockCalendar: calendar_v3.Calendar;

  beforeEach(() => {
    mockCalendar = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                start: { dateTime: '2024-02-15T10:00:00Z' },
                end: { dateTime: '2024-02-15T11:00:00Z' }
              }
            ]
          }
        })
      }
    } as unknown as calendar_v3.Calendar;

    scheduler = new SmartScheduler('test-api-key', mockCalendar);
  });

  describe('findAvailableSlots', () => {
    it('should find available time slots', async () => {
      const result = await scheduler.findAvailableSlots({
        userId: 'test@example.com',
        userPrefs: {
          userId: 'test@example.com',
          email: 'test@example.com',
          workingHours: {
            0: { start: "09:00", end: "17:00" },
            1: { start: "09:00", end: "17:00" },
            2: { start: "09:00", end: "17:00" },
            3: { start: "09:00", end: "17:00" },
            4: { start: "09:00", end: "17:00" },
            5: { start: "09:00", end: "17:00" },
            6: { start: "09:00", end: "17:00" }
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
        meetingType: MeetingType.MEETING,
        preferredDuration: 30,
        earliestTime: '2024-02-15T09:00:00Z',
        latestTime: '2024-02-15T17:00:00Z'
      });

      expect(result).toHaveProperty('suggestedTimes');
      expect(result).toHaveProperty('conflicts');
      expect(Array.isArray(result.suggestedTimes)).toBe(true);
      expect(Array.isArray(result.conflicts)).toBe(true);

      // Verify that suggested times don't overlap with conflicts
      for (const suggestion of result.suggestedTimes) {
        const suggestionStart = new Date(suggestion.start);
        const suggestionEnd = new Date(suggestion.end);
        const conflictStart = new Date('2024-02-15T10:00:00Z');
        const conflictEnd = new Date('2024-02-15T11:00:00Z');

        expect(
          suggestionEnd <= conflictStart ||
          suggestionStart >= conflictEnd
        ).toBe(true);
      }
    });

    it('should handle multiple calendars', async () => {
      const result = await scheduler.findAvailableSlots({
        userId: 'test@example.com',
        userPrefs: {
          userId: 'test@example.com',
          email: 'test@example.com',
          workingHours: {
            0: { start: "09:00", end: "17:00" },
            1: { start: "09:00", end: "17:00" },
            2: { start: "09:00", end: "17:00" },
            3: { start: "09:00", end: "17:00" },
            4: { start: "09:00", end: "17:00" },
            5: { start: "09:00", end: "17:00" },
            6: { start: "09:00", end: "17:00" }
          },
          preferredDays: [1, 2, 3, 4, 5],
          avoidDays: [0, 6],
          calendars: [
            { id: 'primary', selected: true },
            { id: 'work', selected: true }
          ],
          defaultCalendarId: 'primary',
          calendarsToCheck: ['primary', 'work'],
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
        meetingType: MeetingType.MEETING,
        preferredDuration: 30,
        earliestTime: '2024-02-15T09:00:00Z',
        latestTime: '2024-02-15T17:00:00Z'
      });

      expect(result).toHaveProperty('suggestedTimes');
      expect(result).toHaveProperty('conflicts');
      expect(Array.isArray(result.suggestedTimes)).toBe(true);
      expect(Array.isArray(result.conflicts)).toBe(true);
    });
  });
});
