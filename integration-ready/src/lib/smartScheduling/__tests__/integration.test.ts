import { SmartScheduler } from '../smartScheduler';
import { calendar_v3 } from 'googleapis';
import { MeetingType } from '../../types/preferences';
import { MeetingPlanner } from '../../meetingPlanner';

describe('SmartScheduler Integration Tests', () => {
  let scheduler: SmartScheduler;
  let meetingPlanner: MeetingPlanner;
  let mockCalendar: calendar_v3.Calendar;

  beforeEach(() => {
    // Mock calendar with multiple events to test complex scenarios
    mockCalendar = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              // Morning meeting
              {
                start: { dateTime: '2024-02-15T10:00:00Z' },
                end: { dateTime: '2024-02-15T11:00:00Z' }
              },
              // Lunch meeting
              {
                start: { dateTime: '2024-02-15T12:00:00Z' },
                end: { dateTime: '2024-02-15T13:00:00Z' }
              },
              // Focus time block
              {
                start: { dateTime: '2024-02-15T14:00:00Z' },
                end: { dateTime: '2024-02-15T15:00:00Z' },
                summary: 'Focus Time'
              }
            ]
          }
        })
      }
    } as unknown as calendar_v3.Calendar;

    scheduler = new SmartScheduler('test-api-key', mockCalendar);
    meetingPlanner = new MeetingPlanner('test-api-key', mockCalendar);
  });

  describe('findAvailableSlots', () => {
    it('should find available time slots considering calendar events', async () => {
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

      // Verify that all busy times are marked as conflicts
      const expectedConflicts = [
        { start: '2024-02-15T10:00:00Z', end: '2024-02-15T11:00:00Z' },
        { start: '2024-02-15T12:00:00Z', end: '2024-02-15T13:00:00Z' },
        { start: '2024-02-15T14:00:00Z', end: '2024-02-15T15:00:00Z' }
      ];

      // Check that each expected conflict exists in the result
      for (const expectedConflict of expectedConflicts) {
        expect(result.conflicts).toContainEqual(
          expect.objectContaining({
            start: expect.stringMatching(new RegExp(`^${expectedConflict.start.replace(/Z$/, '')}`)),
            end: expect.stringMatching(new RegExp(`^${expectedConflict.end.replace(/Z$/, '')}`))
          })
        );
      }

      // Verify that suggested times don't overlap with conflicts
      for (const suggestion of result.suggestedTimes) {
        const suggestionStart = new Date(suggestion.start);
        const suggestionEnd = new Date(suggestion.end);

        // Check against all conflicts
        for (const conflict of result.conflicts) {
          const conflictStart = new Date(conflict.start);
          const conflictEnd = new Date(conflict.end);

          expect(
            suggestionEnd <= conflictStart ||
            suggestionStart >= conflictEnd
          ).toBe(true);
        }
      }

      // Verify that suggested times respect buffer periods
      if (result.suggestedTimes.length > 1) {
        for (let i = 0; i < result.suggestedTimes.length - 1; i++) {
          const currentEnd = new Date(result.suggestedTimes[i].end);
          const nextStart = new Date(result.suggestedTimes[i + 1].start);
          const bufferInMinutes = 15; // minTimeBetweenMeetings

          expect(
            (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60)
          ).toBeGreaterThanOrEqual(bufferInMinutes);
        }
      }
    });

    it('should respect focus time blocks', async () => {
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

      // Verify that focus time is respected
      for (const suggestion of result.suggestedTimes) {
        const suggestionStart = new Date(suggestion.start);
        const suggestionEnd = new Date(suggestion.end);
        const focusStart = new Date('2024-02-15T14:00:00Z');
        const focusEnd = new Date('2024-02-15T15:00:00Z');

        expect(
          suggestionEnd <= focusStart ||
          suggestionStart >= focusEnd
        ).toBe(true);
      }
    });

    it('should respect meeting type preferences', async () => {
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
        meetingType: MeetingType.COFFEE,
        preferredDuration: 30,
        earliestTime: '2024-02-15T09:00:00Z',
        latestTime: '2024-02-15T17:00:00Z'
      });

      // Verify that we have at least one suggested time
      expect(result.suggestedTimes.length).toBeGreaterThan(0);

      // Verify that suggested times fall within coffee meeting preferred time ranges
      for (const suggestion of result.suggestedTimes) {
        const suggestionTime = new Date(suggestion.start);
        const hour = suggestionTime.getUTCHours();
        const minutes = suggestionTime.getUTCMinutes();
        const timeInMinutes = hour * 60 + minutes;
        
        // Coffee meetings should be between 10:00-11:00 or 15:00-16:00
        const isInMorningSlot = timeInMinutes >= 600 && timeInMinutes < 660; // 10:00-11:00
        const isInAfternoonSlot = timeInMinutes >= 900 && timeInMinutes < 960; // 15:00-16:00
        
        expect(isInMorningSlot || isInAfternoonSlot).toBe(true);
      }
    });
  });
});
