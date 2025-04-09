import { useState, useRef, useEffect } from 'react';
import { Box, TextField, Button, Paper, Typography, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface Message {
  role: 'user' | 'assistant';
  content: string[];
  id: string;
}

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Show initial message
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: ['Hi! I can help you schedule a meeting. Just tell me who you want to meet with and any other details you\'d like to include.'],
      id: 'initial'
    }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    
    // Add user message immediately
    setMessages(prev => [...prev, {
      role: 'user',
      content: [userMessage],
      id: Date.now().toString()
    }]);
    
    setInput('');
    setIsLoading(true);

    try {
      console.log('Sending message:', userMessage);
      console.log('Thread ID:', threadId);
      
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          threadId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      console.log('Assistant response:', data);
      
      setThreadId(data.threadId);

      interface OpenAIMessage {
        role: 'user' | 'assistant';
        content: Array<{ text: { value: string } }>;
        id: string;
      }

      // Convert OpenAI messages to our format
      const newMessages = data.messages.map((msg: OpenAIMessage) => ({
        role: msg.role,
        content: msg.content.map(c => c.text.value),
        id: msg.id
      }));

      setMessages(newMessages.reverse()); // OpenAI returns newest first

    } catch (error) {
      console.error('Failed to process message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ['Sorry, I encountered an error. Please try again.'],
        id: 'error-' + Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Messages Area */}
      <Box sx={{ 
        flex: 1, 
        overflowY: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}>
        {messages.map((message) => (
          <Paper
            key={message.id}
            elevation={1}
            sx={{
              p: 2,
              maxWidth: '80%',
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              bgcolor: message.role === 'user' ? 'primary.light' : 'background.paper',
              color: message.role === 'user' ? 'primary.contrastText' : 'text.primary'
            }}
          >
            {message.content.map((text, i) => (
              <Typography key={i} variant="body1">
                {text}
              </Typography>
            ))}
          </Paper>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          gap: 1
        }}
      >
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          sx={{ bgcolor: 'background.paper' }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading}
          endIcon={isLoading ? <CircularProgress size={20} /> : <SendIcon />}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
}
