import { useState } from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Switch,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WorkIcon from '@mui/icons-material/Work';
import WeekendIcon from '@mui/icons-material/Weekend';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { UserPreferencesData } from '../../types/preferences';

interface CalendarSettingsTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

export default function CalendarSettingsTab({ preferences, onPreferenceChange }: CalendarSettingsTabProps) {
  const handleCalendarVisibilityChange = (calendarType: string) => {
    const visibility = { ...(preferences.calendarVisibility || { work: true, personal: true }) };
    visibility[calendarType] = !visibility[calendarType];
    onPreferenceChange('calendarVisibility', visibility);
  };

  const handleDefaultCalendarChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    onPreferenceChange('defaultCalendarId', event.target.value as string);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Calendar Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Manage your calendar visibility and default settings.
      </Typography>

      {/* Calendar Visibility */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Calendar Visibility
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Control which calendars are visible when scheduling meetings.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <WorkIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1">Work Calendar</Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={(preferences.calendarVisibility?.work !== false)}
                    onChange={() => handleCalendarVisibilityChange('work')}
                    color="primary"
                  />
                }
                label="Show work calendar"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your primary work calendar with professional appointments.
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <WeekendIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1">Personal Calendar</Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={(preferences.calendarVisibility?.personal !== false)}
                    onChange={() => handleCalendarVisibilityChange('personal')}
                    color="primary"
                  />
                }
                label="Show personal calendar"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your personal calendar with private appointments and events.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Default Calendar */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Default Calendar
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Select which calendar new meetings should be created in by default.
        </Typography>

        <FormControl fullWidth>
          <Select
            value={preferences.defaultCalendarId || 'primary'}
            onChange={handleDefaultCalendarChange}
            displayEmpty
          >
            <MenuItem value="primary">Primary Calendar</MenuItem>
            <MenuItem value="work">Work Calendar</MenuItem>
            <MenuItem value="personal">Personal Calendar</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Calendar Display Options */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Calendar Display Options
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Customize how your calendar appears in the dashboard.
        </Typography>

        <Paper sx={{ p: 3 }}>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={true} // Replace with actual preference when added to schema
                  // onChange={() => handleToggleChange('showWeekends')}
                  color="primary"
                />
              }
              label="Show weekends"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={true} // Replace with actual preference when added to schema
                  // onChange={() => handleToggleChange('showDeclinedEvents')}
                  color="primary"
                />
              }
              label="Show declined events"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={false} // Replace with actual preference when added to schema
                  // onChange={() => handleToggleChange('showAllDayEvents')}
                  color="primary"
                />
              }
              label="Hide all-day events"
            />
          </FormGroup>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            Coming Soon: Additional Calendar Features
          </Typography>
          <Typography variant="body2" color="text.secondary">
            More calendar customization options will be available in a future update.
          </Typography>
        </Paper>
      </Box>

      {/* Calendar Sharing */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Calendar Sharing
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Control how your calendar availability is shared with others.
        </Typography>

        <Paper sx={{ p: 3 }}>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={true} // Replace with actual preference when added to schema
                  // onChange={() => handleToggleChange('shareFreeBusy')}
                  color="primary"
                />
              }
              label="Share free/busy information"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={false} // Replace with actual preference when added to schema
                  // onChange={() => handleToggleChange('shareEventDetails')}
                  color="primary"
                />
              }
              label="Share event details"
            />
          </FormGroup>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            Coming Soon: Advanced Sharing Controls
          </Typography>
          <Typography variant="body2" color="text.secondary">
            More granular control over calendar sharing will be available in a future update.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
