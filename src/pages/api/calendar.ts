import { google } from "googleapis";
import type { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "next-auth/react";
import { getToken } from "next-auth/jwt";

interface CalendarError {
  message?: string;
}

interface Token {
  accessToken?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === "GET") {
    try {
      // Get the session and token
      const session = await getSession({ req });
      const token = (await getToken({ req })) as Token;

      if (!session || !token?.accessToken) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
      );

      // Set credentials using the access token from the session
      auth.setCredentials({ access_token: token.accessToken });

      const calendar = google.calendar({ version: "v3", auth });
      
      console.log("Fetching calendar events...");
      
      const events = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      console.log("Events fetched:", events.data.items?.length || 0);
      
      res.status(200).json(events.data.items);
    } catch (error) {
      const calendarError = error as CalendarError;
      console.error("Calendar API Error:", calendarError.message);
      res.status(500).json({ error: calendarError.message || "Failed to fetch calendar events" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
} 