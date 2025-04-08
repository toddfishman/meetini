import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  IconButton,
  TextField,
} from '@mui/material';
import FacebookIcon from '@mui/icons-material/Facebook';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import SettingsIcon from '@mui/icons-material/Settings';
import PhoneIcon from '@mui/icons-material/Phone';
import CloseIcon from '@mui/icons-material/Close';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onOpenPreferences: () => void;
}

export default function OnboardingModal({ open, onClose, onOpenPreferences }: OnboardingModalProps) {
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');

  const integrations = [
    { id: 'facebook', name: 'Facebook', icon: <FacebookIcon sx={{ color: '#1877F2' }} /> },
    { id: 'linkedin', name: 'LinkedIn', icon: <LinkedInIcon sx={{ color: '#0A66C2' }} /> }
  ];

  const handleIntegrationToggle = (id: string) => {
    setSelectedIntegrations(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    onOpenPreferences();
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#1a1d23',
          color: 'white',
          border: '1px solid #2f3336',
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #2f3336'
      }}>
        <Typography variant="h5" sx={{ color: '#22c55e', fontWeight: 600 }}>
          Welcome to Meetini! 🎉
        </Typography>
        <IconButton onClick={onClose} sx={{ color: 'gray' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        <Typography variant="body1" paragraph>
          The more information you give us, the better we'll schedule for you. Let's get you set up for success!
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ color: '#22c55e', mb: 2 }}>
            💪 Recommended Steps:
          </Typography>
          
          <List>
            <ListItem>
              <ListItemIcon>
                <SettingsIcon sx={{ color: '#22c55e' }} />
              </ListItemIcon>
              <ListItemText 
                primary="Set Your Preferences"
                secondary={
                  <Typography variant="body2" sx={{ color: 'gray' }}>
                    Here you can configure things like working and non-working hours, favorite locations for different meeting types, add your webconference links, create groups, and so much more
                  </Typography>
                }
                sx={{ color: 'white' }}
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <PhoneIcon sx={{ color: '#22c55e' }} />
              </ListItemIcon>
              <ListItemText 
                primary="Add Your Phone Number"
                secondary={
                  <>
                    <Typography variant="body2" sx={{ color: 'gray', mb: 1 }}>
                      Imagine texting your calendar invitations to people!
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      placeholder="Enter your phone number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      size="small"
                      sx={{
                        mt: 1,
                        '& .MuiOutlinedInput-root': {
                          color: 'white',
                          '& fieldset': {
                            borderColor: '#2f3336',
                          },
                          '&:hover fieldset': {
                            borderColor: '#22c55e',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#22c55e',
                          },
                        },
                        '& input::placeholder': {
                          color: 'gray',
                        },
                      }}
                    />
                  </>
                }
                sx={{ color: 'white' }}
              />
            </ListItem>
          </List>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ color: '#22c55e', mb: 2 }}>
            Optional Integrations:
          </Typography>
          
          <Typography variant="body2" sx={{ color: 'gray', mb: 2 }}>
            Let us make sure we invite the right people to your meetini's... Cuz, that'd be weird.
          </Typography>
          
          <List>
            {integrations.map(integration => (
              <ListItem key={integration.id} sx={{ py: 1 }}>
                <ListItemIcon>
                  {integration.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={integration.name}
                  sx={{ color: 'white' }}
                />
                <Checkbox
                  checked={selectedIntegrations.includes(integration.id)}
                  onChange={() => handleIntegrationToggle(integration.id)}
                  sx={{
                    color: '#2f3336',
                    '&.Mui-checked': {
                      color: '#22c55e',
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        borderTop: '1px solid #2f3336',
        p: 3,
        gap: 2
      }}>
        <Button 
          onClick={onClose}
          sx={{ 
            color: 'gray',
            '&:hover': {
              backgroundColor: '#2f3336'
            }
          }}
        >
          Maybe Later
        </Button>
        <Button
          variant="contained"
          onClick={handleContinue}
          sx={{
            backgroundColor: '#22c55e',
            color: 'white',
            '&:hover': {
              backgroundColor: '#1ea550'
            }
          }}
        >
          Set Up Preferences
        </Button>
      </DialogActions>
    </Dialog>
  );
} 