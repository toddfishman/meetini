import type { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "next-auth/react";
import { getToken } from "next-auth/jwt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const session = await getSession({ req });
    const token = await getToken({ req });

    if (!session || !token?.accessToken) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const now = new Date();
    const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: threeMonthsFromNow.toISOString(),
        maxResults: '100',
        singleEvents: 'true',
        orderBy: 'startTime'
      }).toString(),
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform the events to match our interface
    const events = (data.items || []).map((event: any) => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      location: event.location || undefined
    }));

    res.status(200).json(events);
  } catch (error: any) {
    console.error('Calendar API Error:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar events',
      details: error.message
    });
  }
} 