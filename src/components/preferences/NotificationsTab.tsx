import { useState } from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Switch,
  TextField,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  Divider,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NotificationsIcon from '@mui/icons-material/Notifications';

import { UserPreferencesData } from '../../types/preferences';

interface NotificationsTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

export default function NotificationsTab({ preferences, onPreferenceChange }: NotificationsTabProps) {
  const handleToggleChange = (key: keyof UserPreferencesData) => {
    onPreferenceChange(key, !preferences[key]);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Notification Preferences
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Control how and when you receive notifications about your meetings and schedule.
      </Typography>

      <Grid container spacing={3}>
        {/* Email Notifications */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <EmailIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Email Notifications</Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.emailNotifications || false}
                  onChange={() => handleToggleChange('emailNotifications')}
                  color="primary"
                />
              }
              label="Receive email notifications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Get notified about meeting invitations, updates, and reminders via email.
            </Typography>
          </Paper>
        </Grid>

        {/* SMS Notifications */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SmsIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1">SMS Notifications</Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.smsNotifications || false}
                  onChange={() => handleToggleChange('smsNotifications')}
                  color="primary"
                />
              }
              label="Receive SMS notifications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Get text message alerts for important meeting reminders.
            </Typography>
          </Paper>
        </Grid>

        {/* Travel Alerts */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <DirectionsCarIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Travel Alerts</Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.travelAlerts || false}
                  onChange={() => handleToggleChange('travelAlerts')}
                  color="primary"
                />
              }
              label="Receive travel time alerts"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Get notified about traffic conditions and when to leave for in-person meetings.
              {!preferences.gpsEnabled && (
                <Box component="span" sx={{ color: 'warning.main', display: 'block', mt: 1 }}>
                  Note: Enable GPS in Location settings for real-time traffic updates.
                </Box>
              )}
            </Typography>
          </Paper>
        </Grid>

        {/* Weather Alerts */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <WbSunnyIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Weather Alerts</Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.weatherAlerts || false}
                  onChange={() => handleToggleChange('weatherAlerts')}
                  color="primary"
                />
              }
              label="Receive weather alerts"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Get notified about weather conditions that might affect your meetings.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Notification Timing
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Set when you want to receive reminders before meetings.
        </Typography>

        <Paper sx={{ p: 3 }}>
          <Box sx={{ mb: 3 }}>
            <Typography gutterBottom>
              Default Notification Time (minutes before meeting)
            </Typography>
            <Slider
              value={30} // Replace with actual preference when added to schema
              // onChange={(e, value) => onPreferenceChange('notificationTiming', value)}
              aria-labelledby="notification-timing-slider"
              valueLabelDisplay="auto"
              step={5}
              marks={[
                { value: 5, label: '5m' },
                { value: 15, label: '15m' },
                { value: 30, label: '30m' },
                { value: 60, label: '1h' },
                { value: 120, label: '2h' },
              ]}
              min={5}
              max={120}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            Coming Soon: Advanced Notification Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            More granular control over notification types and timing will be available in a future update.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
