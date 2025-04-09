import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import OpenAI from 'openai';
import { searchEmailContacts } from '@/lib/google';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `You are an AI assistant helping users schedule meetings through a chat interface. Your goal is to gather all necessary information to schedule a meeting while keeping the conversation natural and friendly.

When users mention scheduling a meeting:
1. Extract names of participants
2. Identify timing preferences
3. Ask for clarification when needed about:
   - Specific participants if names are ambiguous
   - Preferred time slots if not specified
   - Meeting duration if not mentioned
   - Meeting type (coffee, lunch, call, etc.)
   - Location preferences

Important guidelines:
- Be conversational and friendly
- Ask one question at a time to avoid overwhelming users
- Confirm details before proceeding
- Handle vague requests by asking for specifics
- If you recognize a name but need to confirm, ask "Did you mean [full name]?"
- If multiple contacts match a name, list them with their emails
- Use context from previous messages in the conversation

When responding, you should:
1. If you identify a name, include "EXTRACT_NAMES:[name1,name2,...]" at the end of your message
2. If you need quick reply options, include "QUICK_REPLIES:[option1,option2,...]" at the end of your message

Example interactions:
User: "Schedule coffee with Sarah"
Assistant: "I'd be happy to help you schedule coffee with Sarah. When would you like to meet? EXTRACT_NAMES:[Sarah] QUICK_REPLIES:[Tomorrow morning,Tomorrow afternoon,Later this week]"

User: "Tomorrow morning"
Assistant: "Got it. Would you prefer early morning (9-10am) or late morning (11am-12pm)? Also, do you have a preferred location for coffee? QUICK_REPLIES:[9-10am,11am-12pm]"`;

interface ContactSuggestion {
  name: string;
  email: string;
}

interface ExtractedInfo {
  names: string[];
  quickReplies: string[];
}

function extractInfo(content: string): ExtractedInfo {
  const info: ExtractedInfo = {
    names: [],
    quickReplies: []
  };

  // Extract names
  const namesMatch = content.match(/EXTRACT_NAMES:\[(.*?)\]/);
  if (namesMatch && namesMatch[1]) {
    info.names = namesMatch[1].split(',').map(n => n.trim());
  }

  // Extract quick replies
  const repliesMatch = content.match(/QUICK_REPLIES:\[(.*?)\]/);
  if (repliesMatch && repliesMatch[1]) {
    info.quickReplies = repliesMatch[1].split(',').map(r => r.trim());
  }

  return info;
}

function cleanMessage(content: string): string {
  return content
    .replace(/EXTRACT_NAMES:\[.*?\]/, '')
    .replace(/QUICK_REPLIES:\[.*?\]/, '')
    .trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getToken({ req });
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('No reply from OpenAI');
    }

    // Extract names and quick replies
    const info = extractInfo(reply);
    const cleanedMessage = cleanMessage(reply);

    // If names were extracted, search for contacts
    let contactSuggestions: ContactSuggestion[] = [];
    if (info.names.length > 0) {
      const contacts = await searchEmailContacts(req, info.names);
      contactSuggestions = Object.entries(contacts).flatMap(([name, matches]) =>
        matches.map(match => ({
          name: match.name,
          email: match.email
        }))
      );
    }

    return res.status(200).json({
      message: cleanedMessage,
      contactSuggestions,
      quickReplies: info.quickReplies
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 