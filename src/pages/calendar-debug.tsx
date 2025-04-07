import { useState } from 'react';
import { Container, Box, TextField, Button, Typography, Paper, CircularProgress, Accordion, AccordionSummary, AccordionDetails, Alert } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { addDays, format } from 'date-fns';
import { DateTimePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export default function CalendarDebug() {
  // Date states for availability check
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(addDays(new Date(), 1));
  const [participants, setParticipants] = useState<string>('');
  const [calendarId, setCalendarId] = useState<string>('primary');
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Test states
  const [aiPrompt, setAiPrompt] = useState<string>(
    "Check if I'm free for a meeting on Thursday next week at 10am. My calendar ID is 'primary'."
  );
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiCalendarData, setAiCalendarData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Direct freebusy test states
  const [freebusyCalendars, setFreebusyCalendars] = useState<string>('primary');
  const [freebusyResult, setFreebusyResult] = useState<any>(null);
  const [freebusyLoading, setFreebusyLoading] = useState(false);
  const [freebusyError, setFreebusyError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const participantsList = participants.split(',').map(p => p.trim());
      const response = await fetch('/api/calendar/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participants: participantsList,
          start: start.toISOString(),
          end: end.toISOString(),
          calendarId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check availability');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.error('Error checking availability:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAiTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    setAiCalendarData(null);

    try {
      const response = await fetch('/api/assistant/calendar-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          calendarId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run AI test');
      }

      const data = await response.json();
      setAiResponse(data.assistantResponse);
      setAiCalendarData(data.calendarData);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unknown error with AI test');
      console.error('AI test error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // New function to test direct freebusy API
  const handleFreebusyTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFreebusyLoading(true);
    setFreebusyError(null);
    setFreebusyResult(null);

    try {
      const calendarsArray = freebusyCalendars.split(',').map(c => c.trim());
      const response = await fetch('/api/calendar/freebusy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calendars: calendarsArray,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get freebusy data');
      }

      const data = await response.json();
      setFreebusyResult(data);
    } catch (error) {
      console.error('Error in freebusy test:', error);
      setFreebusyError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setFreebusyLoading(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Calendar Availability Debug
          </Typography>
          
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <form onSubmit={handleSubmit}>
              <TextField
                label="Participants (comma separated emails)"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                fullWidth
                margin="normal"
                helperText="Enter participant emails separated by commas"
              />
              <TextField
                label="Calendar ID"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                fullWidth
                margin="normal"
                helperText="Default is 'primary'"
              />
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <DateTimePicker
                  label="Start Time"
                  value={start}
                  onChange={(newValue) => newValue && setStart(newValue)}
                />
                <DateTimePicker
                  label="End Time"
                  value={end}
                  onChange={(newValue) => newValue && setEnd(newValue)}
                />
              </Box>
              <Button 
                type="submit" 
                variant="contained" 
                color="primary" 
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Check Availability'}
              </Button>
            </form>
          </Paper>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {/* AI Testing Section */}
          <Box my={4}>
            <Typography variant="h5" component="h2" gutterBottom>
              Test OpenAI Assistant
            </Typography>
            <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
              <form onSubmit={handleAiTest}>
                <TextField
                  label="Prompt for AI"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  fullWidth
                  multiline
                  rows={3}
                  margin="normal"
                  helperText="Enter a prompt asking about your calendar availability"
                />
                <Button 
                  type="submit" 
                  variant="contained" 
                  color="secondary" 
                  disabled={aiLoading}
                  sx={{ mt: 2 }}
                >
                  {aiLoading ? <CircularProgress size={24} /> : 'Test AI Assistant'}
                </Button>
              </form>
            </Paper>

            {aiError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {aiError}
              </Alert>
            )}

            {aiResponse && (
              <Box mt={3}>
                <Typography variant="h6" gutterBottom>AI Assistant Response</Typography>
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Assistant's Response</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography paragraph whiteSpace="pre-line">
                     {aiResponse}
                    </Typography>
                  </AccordionDetails>
                </Accordion>

                {aiCalendarData && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Calendar Data Provided to AI</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                        <pre>{JSON.stringify(aiCalendarData, null, 2)}</pre>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                )}
              </Box>
            )}
          </Box>

          {/* Direct Freebusy Query Section */}
          <Box my={4}>
            <Typography variant="h5" component="h2" gutterBottom>
              Direct Freebusy Query
            </Typography>
            <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
              <form onSubmit={handleFreebusyTest}>
                <TextField
                  label="Calendar IDs (comma separated)"
                  value={freebusyCalendars}
                  onChange={(e) => setFreebusyCalendars(e.target.value)}
                  fullWidth
                  margin="normal"
                  helperText="Enter calendar IDs separated by commas (default: primary)"
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <DateTimePicker
                    label="Start Time"
                    value={start}
                    onChange={(newValue) => newValue && setStart(newValue)}
                  />
                  <DateTimePicker
                    label="End Time"
                    value={end}
                    onChange={(newValue) => newValue && setEnd(newValue)}
                  />
                </Box>
                <Button 
                  type="submit" 
                  variant="contained" 
                  color="primary" 
                  disabled={freebusyLoading}
                  sx={{ mt: 2 }}
                >
                  {freebusyLoading ? <CircularProgress size={24} /> : 'Test Freebusy API'}
                </Button>
              </form>
            </Paper>

            {freebusyError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {freebusyError}
              </Alert>
            )}

            {freebusyResult && (
              <Box mt={3}>
                <Typography variant="h6" gutterBottom>Freebusy Results</Typography>
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Raw Freebusy Response</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                      <pre>{JSON.stringify(freebusyResult, null, 2)}</pre>
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}
          </Box>

          {results && (
            <Box mt={3}>
              <Typography variant="h6" gutterBottom>Debug Results</Typography>
              
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Available Slots</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography component="div">
                    {results.availability.length > 0 ? (
                      <ul>
                        {results.availability.map((slot: any, index: number) => (
                          <li key={index}>
                            {format(new Date(slot.start), 'MMM d, yyyy h:mm a')} - {format(new Date(slot.end), 'h:mm a')}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No available slots found</p>
                    )}
                  </Typography>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Free/Busy Information</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                    <pre>{JSON.stringify(results.freebusy, null, 2)}</pre>
                  </Box>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Calendar Events</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                    <pre>{JSON.stringify(results.events, null, 2)}</pre>
                  </Box>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>User Preferences</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                    <pre>{JSON.stringify(results.preferences, null, 2)}</pre>
                  </Box>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Raw Response</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
                    <pre>{JSON.stringify(results, null, 2)}</pre>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Box>
          )}
        </Box>
      </Container>
    </LocalizationProvider>
  );
} 