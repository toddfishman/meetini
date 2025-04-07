import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Snackbar,
  Stack,
  Divider,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Paper
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { format } from 'date-fns';
import { CheckCircle, Close, Schedule, Event } from '@mui/icons-material';
import Layout from '@/components/Layout';

export default function ConfirmTimePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { email, invite, response } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [confirmationStatus, setConfirmationStatus] = useState<string | null>(null);
  const [responseOption, setResponseOption] = useState(response === 'yes' ? 'yes' : 'no');
  const [alternativeTimes, setAlternativeTimes] = useState<Date[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!email || !invite) return;

    const fetchInvitation = async () => {
      try {
        const result = await fetch(`/api/meetini/${invite}`);
        if (!result.ok) {
          throw new Error('Failed to fetch invitation details');
        }
        const data = await result.json();
        setInvitation(data);
        
        // If there are proposed times, set the first one as selected
        if (data.proposedTimes?.length > 0) {
          setSelectedDate(new Date(data.proposedTimes[0]));
        }
      } catch (err) {
        setError('Could not load invitation details. Please try again later.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [email, invite]);

  // Handle auto-submission if response is in URL
  useEffect(() => {
    if (response === 'yes' || response === 'no') {
      if (invitation && email && invite) {
        setResponseOption(response as string);
        handleAutoSubmit();
      }
    }
  }, [response, invitation, email, invite]);

  const handleAutoSubmit = async () => {
    if (!email || !invite || !response || !invitation) return;
    
    setLoading(true);
    try {
      const payload = {
        email,
        inviteId: invite,
        response: response,
        suggestedTime: selectedDate?.toISOString(),
        alternativeTimes: []
      };
      
      const result = await fetch('/api/meetini/confirm-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!result.ok) {
        throw new Error('Failed to confirm time');
      }
      
      setSuccess(true);
      setConfirmationStatus(response as string);
    } catch (err) {
      setError('Failed to submit your response. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!email || !invite) return;
    
    setLoading(true);
    try {
      const payload = {
        email,
        inviteId: invite,
        response: responseOption,
        suggestedTime: selectedDate?.toISOString(),
        alternativeTimes: alternativeTimes.map(d => d.toISOString()),
        message: message
      };
      
      const result = await fetch('/api/meetini/confirm-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!result.ok) {
        throw new Error('Failed to confirm time');
      }
      
      setSuccess(true);
      setConfirmationStatus(responseOption);
    } catch (err) {
      setError('Failed to submit your response. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addAlternativeTime = () => {
    if (selectedDate) {
      setAlternativeTimes([...alternativeTimes, selectedDate]);
      setSelectedDate(null);
    }
  };

  const removeAlternativeTime = (index: number) => {
    setAlternativeTimes(alternativeTimes.filter((_, i) => i !== index));
  };

  if (loading && !invitation) {
    return (
      <Layout>
        <Container maxWidth="md" className="py-8">
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
            <CircularProgress />
          </Box>
        </Container>
      </Layout>
    );
  }

  if (error && !invitation) {
    return (
      <Layout>
        <Container maxWidth="md" className="py-8">
          <Alert severity="error">{error}</Alert>
        </Container>
      </Layout>
    );
  }

  if (success || confirmationStatus) {
    return (
      <Layout>
        <Container maxWidth="md">
          <Box my={4} textAlign="center">
            <Card>
              <CardContent>
                {(confirmationStatus === 'yes' || responseOption === 'yes') ? (
                  <Box>
                    <CheckCircle color="success" sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h4" gutterBottom>
                      Thank You for Confirming!
                    </Typography>
                    <Typography variant="body1" paragraph>
                      You have confirmed your availability for "{invitation?.title}" on {selectedDate ? format(new Date(invitation?.proposedTimes[0]), 'EEEE, MMMM d, yyyy h:mm a') : 'the requested time'}.
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      You will receive a calendar invitation soon.
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <Schedule color="warning" sx={{ fontSize: 60, mb: 2 }} />
                    <Typography variant="h4" gutterBottom>
                      Response Recorded
                    </Typography>
                    <Typography variant="body1" paragraph>
                      You have indicated that you're not available for "{invitation?.title}" at the suggested time.
                    </Typography>
                    {alternativeTimes.length > 0 && (
                      <Box mt={2}>
                        <Typography variant="body1" fontWeight="bold">
                          Your alternative suggestions:
                        </Typography>
                        <ul>
                          {alternativeTimes.map((time, index) => (
                            <li key={index}>
                              {format(time, 'EEEE, MMMM d, yyyy h:mm a')}
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}
                    <Typography variant="body2" color="textSecondary">
                      The organizer has been notified and will contact you about rescheduling.
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
            
            <Box mt={4}>
              <Typography variant="body2" color="textSecondary">
                Want a better scheduling experience?
              </Typography>
              <Button 
                variant="contained" 
                color="primary" 
                sx={{ mt: 1 }}
                href={`/signup?email=${encodeURIComponent(email as string)}`}
              >
                Create a Meetini Account
              </Button>
            </Box>
          </Box>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container maxWidth="md">
        <Box my={4}>
          <Typography variant="h4" component="h1" gutterBottom>
            Meeting Confirmation
          </Typography>
          
          <Card>
            <CardContent>
              <Box mb={3}>
                <Typography variant="h5" gutterBottom>
                  {invitation?.title}
                </Typography>
                <Divider />
                <Box my={2}>
                  <Typography variant="body1">
                    <strong>Organizer:</strong> {invitation?.createdBy}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Proposed time:</strong> {invitation?.proposedTimes?.length > 0 
                      ? format(new Date(invitation.proposedTimes[0]), 'EEEE, MMMM d, yyyy h:mm a') 
                      : 'No time specified'}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Participants:</strong> {invitation?.participants?.map((p: any) => p.email).join(', ')}
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom>
                  Your Response
                </Typography>
                
                <FormControl component="fieldset">
                  <RadioGroup
                    value={responseOption}
                    onChange={(e) => setResponseOption(e.target.value)}
                  >
                    <FormControlLabel 
                      value="yes" 
                      control={<Radio />} 
                      label="Yes, I can attend at this time" 
                    />
                    <FormControlLabel 
                      value="no" 
                      control={<Radio />} 
                      label="No, I'm not available at this time" 
                    />
                  </RadioGroup>
                </FormControl>

                {responseOption === 'no' && (
                  <Box mt={3}>
                    <Typography variant="subtitle1" gutterBottom>
                      Suggest Alternative Times:
                    </Typography>
                    
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <Box display="flex" alignItems="flex-start" mb={2}>
                        <DateTimePicker
                          label="Select Alternative Time"
                          value={selectedDate}
                          onChange={(newValue) => setSelectedDate(newValue)}
                        />
                        <Button 
                          variant="contained" 
                          onClick={addAlternativeTime}
                          disabled={!selectedDate}
                          sx={{ ml: 2, mt: 1 }}
                        >
                          Add Time
                        </Button>
                      </Box>
                    </LocalizationProvider>
                    
                    {alternativeTimes.length > 0 && (
                      <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Your Suggested Times:
                        </Typography>
                        <Stack spacing={1}>
                          {alternativeTimes.map((time, index) => (
                            <Box key={index} display="flex" alignItems="center" justifyContent="space-between">
                              <Typography>
                                {format(time, 'EEEE, MMMM d, yyyy h:mm a')}
                              </Typography>
                              <Button 
                                size="small"
                                onClick={() => removeAlternativeTime(index)}
                                startIcon={<Close />}
                              >
                                Remove
                              </Button>
                            </Box>
                          ))}
                        </Stack>
                      </Paper>
                    )}
                    
                    <TextField
                      label="Additional Message"
                      multiline
                      rows={3}
                      fullWidth
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      margin="normal"
                      placeholder="Add any additional information about your availability..."
                    />
                  </Box>
                )}
              </Box>

              <Box mt={4} display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={24} /> : 'Submit Response'}
                </Button>
              </Box>
            </CardContent>
          </Card>
          
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </Container>
    </Layout>
  );
} 