import { NextApiRequest } from 'next';

export async function getAvailability(req: NextApiRequest, participants: string[]) {
  // Dummy availability logic — replace with real data later
  return {
    availableSlots: [
      { start: '2025-04-01T14:00:00Z', end: '2025-04-01T14:30:00Z' },
      { start: '2025-04-01T15:00:00Z', end: '2025-04-01T15:30:00Z' }
    ],
    timezone: 'UTC'
  };
}