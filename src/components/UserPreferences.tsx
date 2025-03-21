import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Box,
  Typography,
  Alert,
  SelectChangeEvent,
  TextField,
  Tabs,
  Tab,
  Switch,
  Slider,
  InputAdornment,
  IconButton,
  Divider,
  Paper,
  Grid,
  Chip,
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VideocamIcon from '@mui/icons-material/Videocam';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import DirectionsTransitIcon from '@mui/icons-material/DirectionsTransit';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import HomeIcon from '@mui/icons-material/Home';
import BusinessIcon from '@mui/icons-material/Business';

// Define the expanded preferences interface
interface UserPreferencesData {
  // Working Hours & Schedule
  workingHours: { start: string; end: string };
  workDays: number[];
  timezone: string;
  bufferTime?: number;
  maxMeetingsPerDay?: number;
  focusTimeBlocks?: { start: string; end: string; days: number[] }[];
  
  // Location Settings
  homeLocation?: string;
  officeLocation?: string;
  maxTravelTime?: number;
  maxTravelDistance?: number;
  preferredTransport?: string;
  gpsEnabled?: boolean;
  noGoZones?: string[];
  
  // Meeting Preferences
  defaultDuration?: number;
  preferredTimes?: { type: string; time: string }[];
  virtualMeetingUrl?: string;
  defaultMeetingType?: string;
  preferredPlatforms?: string[];
  
  // Personal Time
  personalEvents?: { title: string; start: string; end: string; days: number[] }[];
  mealTimes?: { type: string; start: string; end: string }[];
  
  // Notification Preferences
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  travelAlerts?: boolean;
  weatherAlerts?: boolean;
  
  // Calendar Settings
  defaultCalendarId?: string;
  calendarVisibility?: { [key: string]: boolean };
  
  // Legacy fields for backward compatibility
  meetingTypes?: string[];
  virtualPlatforms?: string[];
}

interface UserPreferencesProps {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
  onWorkDayToggle: (day: number) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const MEETING_TYPES = ['Virtual', 'In Person'];
const VIRTUAL_PLATFORMS = ['Zoom', 'Google Meet', 'Microsoft Teams', 'Other'];

export default function UserPreferences({
  open,
  onClose,
  preferences,
  onPreferenceChange,
  onWorkDayToggle,
}: UserPreferencesProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) throw new Error('Failed to save preferences');
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      setError('Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeChange = (type: 'start' | 'end', date: Date | null) => {
    if (date) {
      onPreferenceChange('workingHours', {
        ...preferences.workingHours,
        [type]: format(date, 'HH:mm'),
      });
    }
  };

  const handleTimezoneChange = (event: SelectChangeEvent<string>) => {
    onPreferenceChange('timezone', event.target.value);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>User Preferences</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Working Hours
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
            <Box display="flex" gap={2}>
              <TimePicker
                label="Start Time"
                value={parse(preferences.workingHours.start, 'HH:mm', new Date())}
                onChange={(date) => handleTimeChange('start', date)}
              />
              <TimePicker
                label="End Time"
                value={parse(preferences.workingHours.end, 'HH:mm', new Date())}
                onChange={(date) => handleTimeChange('end', date)}
              />
            </Box>
          </LocalizationProvider>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Working Days
          </Typography>
          <FormGroup row>
            {DAYS_OF_WEEK.map(({ value, label }) => (
              <FormControlLabel
                key={value}
                control={
                  <Checkbox
                    checked={preferences.workDays.includes(value)}
                    onChange={() => onWorkDayToggle(value)}
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Timezone
          </Typography>
          <FormControl fullWidth>
            <Select
              value={preferences.timezone}
              onChange={handleTimezoneChange}
            >
              {Intl.supportedValuesOf('timeZone').map((zone) => (
                <MenuItem key={zone} value={zone}>
                  {zone}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Meeting Types
          </Typography>
          <FormGroup row>
            {MEETING_TYPES.map((type) => (
              <FormControlLabel
                key={type}
                control={
                  <Checkbox
                    checked={preferences.meetingTypes?.includes(type)}
                    onChange={() => onPreferenceChange('meetingTypes', [...(preferences.meetingTypes || []), type])}
                  />
                }
                label={type}
              />
            ))}
          </FormGroup>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Virtual Platforms
          </Typography>
          <FormGroup row>
            {VIRTUAL_PLATFORMS.map((platform) => (
              <FormControlLabel
                key={platform}
                control={
                  <Checkbox
                    checked={preferences.virtualPlatforms?.includes(platform)}
                    onChange={() => onPreferenceChange('virtualPlatforms', [...(preferences.virtualPlatforms || []), platform])}
                  />
                }
                label={platform}
              />
            ))}
          </FormGroup>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
