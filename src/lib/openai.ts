interface MeetingRequest {
  title: string;
  participants: string[];
  preferences: {
    timePreference?: 'morning' | 'afternoon' | 'evening';
    durationType?: '30min' | '1hour' | '2hours';
    locationType?: 'coffee' | 'restaurant' | 'office' | 'virtual';
  };
  location?: string;
  priority?: number;
  notes?: string;
}

export async function parseMeetingRequest(prompt: string): Promise<MeetingRequest> {
  try {
    const response = await fetch('/api/ai/parse-meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to parse meeting request');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error('Failed to parse meeting request');
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');

    const response = await fetch('/api/ai/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to transcribe audio');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error('Failed to transcribe audio');
  }
} 