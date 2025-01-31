import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create a temporary file to store the audio
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    
    if (!files.audio || !files.audio[0]) {
      throw new Error('No audio file received');
    }

    const audioFile = files.audio[0];
    
    // Create a readable stream from the temporary file
    const audioStream = fs.createReadStream(audioFile.filepath);

    // Send to OpenAI Whisper API
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'en',
    });

    // Clean up the temporary file
    fs.unlinkSync(audioFile.filepath);

    return res.status(200).json({ text: response.text });
  } catch (error) {
    console.error('Whisper API Error:', error);
    return res.status(500).json({ error: 'Failed to transcribe audio' });
  }
} 
