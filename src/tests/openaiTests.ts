import { transcribeAudio, parseMeetingRequest } from '../lib/openai';

async function testTranscription() {
  const audioBlob = new Blob(['test audio content'], { type: 'audio/webm' });
  try {
    const transcription = await transcribeAudio(audioBlob);
    console.log('Transcription successful:', transcription);
  } catch (error) {
    console.error('Transcription test failed:', error);
  }
}

async function testMeetingParsing() {
  const prompt = 'Schedule a meeting with John next Monday.';
  try {
    const parsedMeeting = await parseMeetingRequest(prompt);
    console.log('Meeting parsing successful:', parsedMeeting);
  } catch (error) {
    console.error('Meeting parsing test failed:', error);
  }
}

(async () => {
  await testTranscription();
  await testMeetingParsing();
})(); 