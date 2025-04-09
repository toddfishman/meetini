import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { searchEmailContacts } from '@/lib/google';
import { openai } from '@/lib/openaiClient';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Use OpenAI to extract names from the query
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: "system",
        content: `Extract potential participant names from the user's message. Return ONLY a JSON array of names.
For example: ["John Smith", "Jane Doe"]
Do not include explanations or other text.`
      }, {
        role: "user",
        content: query
      }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    const { names } = JSON.parse(aiResponse);
    if (!Array.isArray(names)) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Search for contacts based on the extracted names
    const contacts = await searchEmailContacts(req, names);
    
    res.status(200).json({ contacts });
  } catch (error) {
    console.error('Error in contact suggestions:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get contact suggestions' 
    });
  }
}
