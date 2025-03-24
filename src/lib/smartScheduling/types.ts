export interface UserPreference {
  userId: string;
  preferredTimes: {
    start: string;
    end: string;
    weight: number;
  }[];
  preferredDuration: number;
  preferredBuffer: number;
  preferredLocations: string[];
  timezone: string;
}

export interface MeetingHistory {
  userId: string;
  participantIds: string[];
  scheduledTime: string;
  duration: number;
  accepted: boolean;
  location?: string;
  type: string;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  score: number;
  participants: string[];
}

export interface SmartSchedulingRequest {
  organizerId: string;
  participantIds: string[];
  meetingType: string;
  preferredDuration?: number;
  locationPreference?: string;
  earliestTime?: string;
  latestTime?: string;
}

export interface ParticipantAvailability {
  isAvailable: boolean;
  conflicts: Array<{
    userId: string;
    reason: string;
    conflictingEvent?: {
      start: string;
      end: string;
      summary: string;
    };
  }>;
  alternativeSuggestions?: AvailabilitySlot[];
}
