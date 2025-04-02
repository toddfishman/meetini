import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

if (!process.env.OPENAI_ASSISTANT_ID) {
  throw new Error('Missing OPENAI_ASSISTANT_ID environment variable');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v1'
  }
});

export const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
export const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';
