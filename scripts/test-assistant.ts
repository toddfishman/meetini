const OpenAI = require('openai');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v1'
  }
});

async function testAssistant() {
  try {
    console.log('=== TESTING ASSISTANT API ===');
    console.log('API Key:', process.env.OPENAI_API_KEY?.slice(0, 10) + '...');
    console.log('Assistant ID:', process.env.OPENAI_ASSISTANT_ID);
    console.log('Model:', process.env.OPENAI_MODEL);

    // 1. Retrieve the assistant
    console.log('\n1. Retrieving assistant...');
    const assistant = await openai.beta.assistants.retrieve(process.env.OPENAI_ASSISTANT_ID);
    console.log('Assistant retrieved:', {
      id: assistant.id,
      name: assistant.name,
      model: assistant.model
    });

    // 2. Create a thread
    console.log('\n2. Creating thread...');
    const thread = await openai.beta.threads.create();
    console.log('Thread created:', thread.id);

    // 3. Add a message
    console.log('\n3. Adding message...');
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: 'Let\'s have coffee with Todd'
    });
    console.log('Message added');

    // 4. Create a run
    console.log('\n4. Creating run...');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
      model: process.env.OPENAI_MODEL,
      instructions: 'You are a scheduling assistant. Help schedule a meeting.'
    });
    console.log('Run created:', run.id);

    // 5. Wait for completion
    console.log('\n5. Waiting for completion...');
    let currentRun = run;
    while (currentRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      currentRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('Status:', currentRun.status);
      
      if (currentRun.status === 'failed') {
        console.error('Run failed:', currentRun.last_error);
        break;
      }
    }

    // 6. Get messages
    console.log('\n6. Getting messages...');
    const messages = await openai.beta.threads.messages.list(thread.id);
    console.log('\nFinal Messages:');
    messages.data.forEach((msg: any) => {
      const content = msg.content[0];
      if (content && 'text' in content) {
        console.log(`${msg.role}: ${content.text.value}`);
      }
    });

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testAssistant();
