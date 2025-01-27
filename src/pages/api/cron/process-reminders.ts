import { NextApiRequest, NextApiResponse } from 'next';
import { processReminders, cleanupReminders } from '@/lib/reminders';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the request is from the cron service
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Process due reminders
    await processReminders();

    // Clean up old reminders
    await cleanupReminders();

    return res.status(200).json({ message: 'Successfully processed reminders' });
  } catch (error) {
    console.error('Failed to process reminders:', error);
    return res.status(500).json({ error: 'Failed to process reminders' });
  }
} 