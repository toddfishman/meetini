import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

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

  let audioFilePath: string | null = null;

  try {
    const form = formidable({
      maxFileSize: 25 * 1024 * 1024, // 25MB max file size
    });
    
    // Parse the form
    const [_, files] = await form.parse(req);
    const audioFile = files.audio?.[0];
    
    if (!audioFile) {
      throw new Error('No audio file received');
    }

    // Verify file type
    if (!audioFile.mimetype?.includes('audio/')) {
      throw new Error('Invalid file type. Only audio files are allowed.');
    }

    // Store the file path for cleanup
    audioFilePath = audioFile.filepath;

    // Create a File object from the audio file
    const file = fs.createReadStream(audioFile.filepath);

    console.log('Starting transcription process');

    // Log file details
    console.log('Processing audio file:', {
      size: audioFile.size,
      type: audioFile.mimetype,
    });

    // Log API call start
    console.log('Calling OpenAI API for transcription');

    // Send to OpenAI Whisper API with minimal settings
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en'
    });

    // Log API response
    console.log('Transcription successful:', response.text);

    // Post-process the transcription
    let processedText = response.text;
    processedText = processedText
      .replace(/at gmail dot com/gi, '@gmail.com')
      .replace(/at gmail/gi, '@gmail.com')
      .replace(/\bat\b/gi, '@')
      .replace(/\bdot\b/gi, '.')
      .replace(/\bperiod\b/gi, '.');

    console.log('Transcription successful:', {
      original: response.text,
      processed: processedText
    });

    return res.status(200).json({ 
      text: processedText,
      original: response.text
    });

  } catch (error) {
    console.error('Transcription Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({ 
      error: 'Failed to transcribe audio',
      details: error instanceof Error ? error.message : 'Unknown error'
    });

  } finally {
    // Clean up the temporary file
    if (audioFilePath) {
      try {
        fs.unlinkSync(audioFilePath);
      } catch (e) {
        console.error('Failed to clean up temporary file:', e);
      }
    }

    console.log('Transcription process completed');
  }
} 
