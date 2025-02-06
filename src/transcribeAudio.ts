const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

async function transcribeAudio(audioContent: string) {
  const audio = {
    content: audioContent,
  };

  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
  };

  const request = {
    audio: audio,
    config: config,
  };

  const [response] = await client.recognize(request);
  const transcription = response.results
    .map((result: any) => result.alternatives[0].transcript)
    .join('\n');
  console.log(`Transcription: ${transcription}`);
}

export default transcribeAudio; 
