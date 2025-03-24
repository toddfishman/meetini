import { UserPreferences, MeetingTypePreference, TimePreference } from '../types/preferences';

// This is a mock implementation. Replace with actual database integration.
export class PreferencesRepository {
  private static instance: PreferencesRepository;
  private preferences: Map<string, UserPreferences>;

  private constructor() {
    this.preferences = new Map();
  }

  static getInstance(): PreferencesRepository {
    if (!PreferencesRepository.instance) {
      PreferencesRepository.instance = new PreferencesRepository();
    }
    return PreferencesRepository.instance;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    return this.preferences.get(userId) || null;
  }

  async getMeetingTypePreference(userId: string, meetingType: string): Promise<MeetingTypePreference | null> {
    const userPrefs = await this.getUserPreferences(userId);
    return userPrefs?.meetingPreferences[meetingType] || null;
  }

  async getPreferredTimeRanges(userId: string, meetingType: string): Promise<TimePreference[]> {
    const meetingPrefs = await this.getMeetingTypePreference(userId, meetingType);
    return meetingPrefs?.preferredTimeRanges || [];
  }

  async upsertPreferences(preferences: UserPreferences): Promise<void> {
    this.preferences.set(preferences.userId, preferences);
  }

  async updateMeetingTypePreference(
    userId: string,
    meetingType: string,
    preference: MeetingTypePreference
  ): Promise<void> {
    const userPrefs = await this.getUserPreferences(userId);
    if (userPrefs) {
      userPrefs.meetingPreferences[meetingType] = preference;
      await this.upsertPreferences(userPrefs);
    }
  }
}
