import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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
    const token = await getToken({ req });
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Parse form data
    const form = formidable();
    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Get the first audio file from the files object
    const audioFiles = files.audio;
    const audioFile = Array.isArray(audioFiles) ? audioFiles[0] : audioFiles;
    
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Transcribe audio using OpenAI's Whisper model
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: 'whisper-1',
      language: 'en',
    });

    // Clean up temporary file
    fs.unlinkSync(audioFile.filepath);

    return res.status(200).json({ text: transcription.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 
