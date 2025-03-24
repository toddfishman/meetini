type MockUser = {
  id: string;
  name: string;
  preferences: {
    workingHours: {
      start: string;
      end: string;
    };
    timezone: string;
    bufferTime: number;
  };
  calendar: Array<{
    start: string;
    end: string;
    summary: string;
  }>;
};

type MockUsers = {
  [key: string]: MockUser;
};

type MockMeetingHistoryItem = {
  organizerId: string;
  participantIds: string[];
  scheduledTime: string;
  duration: number;
  accepted: boolean;
  type: string;
};

type MockTestScenario = {
  name: string;
  request: {
    organizerId: string;
    participantIds: string[];
    meetingType: string;
    preferredDuration: number;
    earliestTime?: string;
    latestTime?: string;
  };
  expectedResults: {
    shouldHaveSlots: boolean;
    minimumSlots?: number;
    shouldConsiderTimezones: boolean;
    shouldRespectBuffers?: boolean;
    shouldExplainConflicts?: boolean;
  };
};

export const mockUsers: MockUsers = {
  alice: {
    id: 'alice@example.com',
    name: 'Alice',
    preferences: {
      workingHours: {
        start: '09:00',
        end: '17:00'
      },
      timezone: 'America/Los_Angeles',
      bufferTime: 15
    },
    calendar: [
      {
        start: '2025-03-19T10:00:00-07:00',
        end: '2025-03-19T11:00:00-07:00',
        summary: 'Team Meeting'
      },
      {
        start: '2025-03-19T15:00:00-07:00',
        end: '2025-03-19T16:00:00-07:00',
        summary: 'Client Call'
      }
    ]
  },
  bob: {
    id: 'bob@example.com',
    name: 'Bob',
    preferences: {
      workingHours: {
        start: '08:00',
        end: '16:00'
      },
      timezone: 'America/Los_Angeles',
      bufferTime: 30
    },
    calendar: [
      {
        start: '2025-03-19T11:30:00-07:00',
        end: '2025-03-19T12:30:00-07:00',
        summary: 'Lunch'
      },
      {
        start: '2025-03-19T14:00:00-07:00',
        end: '2025-03-19T15:00:00-07:00',
        summary: 'Project Review'
      }
    ]
  },
  carol: {
    id: 'carol@example.com',
    name: 'Carol',
    preferences: {
      workingHours: {
        start: '10:00',
        end: '18:00'
      },
      timezone: 'America/Chicago',
      bufferTime: 15
    },
    calendar: [
      {
        start: '2025-03-19T09:00:00-05:00',
        end: '2025-03-19T10:00:00-05:00',
        summary: 'Morning Standup'
      },
      {
        start: '2025-03-19T16:00:00-05:00',
        end: '2025-03-19T17:00:00-05:00',
        summary: 'Team Sync'
      }
    ]
  }
};

export const mockMeetingHistory: MockMeetingHistoryItem[] = [
  {
    organizerId: "alice@example.com",
    participantIds: ["bob@example.com"],
    scheduledTime: "2025-03-19T09:00:00-07:00",
    duration: 30,
    accepted: true,
    type: "Quick Sync"
  },
  {
    organizerId: "carol@example.com",
    participantIds: ["alice@example.com", "bob@example.com"],
    scheduledTime: "2025-03-19T15:30:00-07:00",
    duration: 60,
    accepted: true,
    type: "Project Planning"
  }
];

export const mockTestScenarios: MockTestScenario[] = [
  {
    name: 'Basic 1:1 Meeting',
    request: {
      organizerId: mockUsers.alice.id,
      participantIds: [mockUsers.bob.id],
      meetingType: '1:1',
      preferredDuration: 30,
      earliestTime: '2025-03-19T09:00:00-07:00',
      latestTime: '2025-03-19T17:00:00-07:00'
    },
    expectedResults: {
      shouldHaveSlots: true,
      minimumSlots: 3,
      shouldConsiderTimezones: true,
      shouldRespectBuffers: true
    }
  },
  {
    name: 'Complex Team Meeting',
    request: {
      organizerId: mockUsers.alice.id,
      participantIds: [mockUsers.bob.id, mockUsers.carol.id],
      meetingType: 'Team Sync',
      preferredDuration: 45,
      earliestTime: '2025-03-19T09:00:00-07:00',
      latestTime: '2025-03-19T17:00:00-07:00'
    },
    expectedResults: {
      shouldHaveSlots: true,
      minimumSlots: 3,
      shouldConsiderTimezones: true,
      shouldRespectBuffers: true,
      shouldExplainConflicts: true
    }
  }
];
