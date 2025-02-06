import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempFilePath: string | null = null;

  try {
    console.log('Starting transcription request...');
    
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Convert base64 to buffer
    const base64Data = audio.split('base64,')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Create temp file in OS temp directory
    tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, buffer);

    console.log('Created temp file:', tempFilePath);
    
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
      temperature: 0.0
    });

    console.log('Received response from OpenAI:', response.text);
    return res.status(200).json({ transcription: response.text });

  } catch (error) {
    console.error('Transcription Error:', error);
    if (error instanceof Error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to transcribe audio' });
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Cleaned up temp file');
      } catch (e) {
        console.error('Failed to clean up temp file:', e);
      }
    }
  }
} 
