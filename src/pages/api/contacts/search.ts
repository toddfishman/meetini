import { NextApiRequest, NextApiResponse } from 'next';
import { searchEmailContacts } from '@/lib/google';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { openai } from '@/lib/openaiClient';

// More lenient email regex that matches emails within text
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

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

    console.log('\n--- Processing new query ---');
    console.log('Query:', query);
    console.log('User:', session.user.email);

    // First check if the query contains any email addresses
    const emailMatches = query.match(EMAIL_REGEX);
    console.log('Checking for email matches in:', query);
    
    if (emailMatches && emailMatches.length > 0) {
      console.log('Found email addresses:', emailMatches);
      // Search directly with all found email addresses
      const contacts = await searchEmailContacts(req, emailMatches);
      console.log('Direct email search results:', Object.keys(contacts));
      
      return res.status(200).json({ 
        contacts,
        confidence: {
          score: 1.0, // 100% confidence for exact email matches
          explanation: `Direct email match(es) found: ${emailMatches.join(', ')}`
        }
      });
    }
    console.log('No email addresses found, proceeding with name extraction');

    // Use OpenAI with function calling for name extraction
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: "system",
          content: `You are an AI assistant helping identify people in meeting requests.
Your task is to extract names of people the user wants to meet with.

Key points:
- Extract any word that could reasonably be a person's name
- Names can be first names, last names, or full names
- Names can be formal or informal
- Names can be in any case (upper, lower, mixed)
- Look for names after words like "with", "and", "meet", but don't limit to only these
- The user is: ${session.user.name || 'Unknown'} <${session.user.email}>
- Include the user's name if it appears to be a participant
- If unsure, include the name and let the contact search filter it out
- Common words like "meet", "next", "week" are not names

Example valid names:
- "todd" in "meet with todd"
- "Sarah" in "call Sarah tomorrow"
- "jason smith" in "schedule with jason smith"
- "Mike" in "Mike and I need to chat"
- "bob" in "quick sync with bob"

Example invalid:
- "next" in "next week"
- "meet" in "meet with"
- "call" in "call me"
- "schedule" in "schedule a meeting"`
        },
        {
          role: "user",
          content: query
        }
      ],
      functions: [
        {
          name: 'extractNames',
          description: 'Extract names of people mentioned in the meeting request',
          parameters: {
            type: 'object',
            properties: {
              names: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of names mentioned'
              },
              confidence: {
                type: 'object',
                properties: {
                  explanation: {
                    type: 'string',
                    description: 'Brief explanation of how names were identified'
                  }
                }
              }
            },
            required: ['names']
          }
        }
      ],
      function_call: { name: 'extractNames' }
    });

    const functionCall = completion.choices[0]?.message?.function_call;
    if (!functionCall?.arguments) {
      console.error('No function call in response');
      throw new Error('Failed to extract names');
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(functionCall.arguments);
      console.log('Extracted names:', parsedResponse.names);
      if (parsedResponse.confidence?.explanation) {
        console.log('Confidence explanation:', parsedResponse.confidence.explanation);
      }
    } catch (e) {
      console.error('Failed to parse OpenAI response:', functionCall.arguments);
      throw new Error('Invalid function response');
    }

    if (!parsedResponse.names || !Array.isArray(parsedResponse.names)) {
      console.error('Unexpected response format:', parsedResponse);
      throw new Error('Invalid response format');
    }

    if (parsedResponse.names.length === 0) {
      console.log('No names found in query');
      return res.status(200).json({ contacts: {}, confidence: parsedResponse.confidence });
    }

    // Search for contacts based on the extracted names
    console.log('Searching for contacts with names:', parsedResponse.names);
    const contacts = await searchEmailContacts(req, parsedResponse.names);
    const contactCount = Object.keys(contacts).length;
    console.log(`Found ${contactCount} contacts`);
    if (contactCount > 0) {
      console.log('Contact emails found:', Object.keys(contacts));
    }
    
    res.status(200).json({ 
      contacts,
      confidence: parsedResponse.confidence 
    });
  } catch (error) {
    console.error('Error in contact search:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to search contacts' 
    });
  }
}
