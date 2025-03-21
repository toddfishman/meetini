import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Button,
  Grid,
  Paper,
  IconButton,
  InputAdornment,
  FormHelperText,
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import VideocamIcon from '@mui/icons-material/Videocam';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LinkIcon from '@mui/icons-material/Link';

import { UserPreferencesData, PreferredTime } from '../../types/preferences';

interface MeetingsTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

const MEETING_TYPES = [
  { value: 'virtual', label: 'Virtual' },
  { value: 'in-person', label: 'In Person' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'phone', label: 'Phone Call' },
];

const MEETING_PLATFORMS = [
  'Google Meet',
  'Zoom',
  'Microsoft Teams',
  'Webex',
  'Slack Huddle',
  'Discord',
  'Custom',
];

const TIME_TYPES = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'custom', label: 'Custom Time' },
];

export default function MeetingsTab({ preferences, onPreferenceChange }: MeetingsTabProps) {
  const [newPlatform, setNewPlatform] = useState('');
  const [newPreferredTime, setNewPreferredTime] = useState<PreferredTime>({
    type: 'morning',
    time: '09:00',
  });

  const handleDurationChange = (event: Event, newValue: number | number[]) => {
    onPreferenceChange('defaultDuration', newValue as number);
  };

  const handleMeetingTypeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    onPreferenceChange('defaultMeetingType', event.target.value as string);
  };

  const addPlatform = (platform: string) => {
    const platforms = [...(preferences.preferredPlatforms || [])];
    if (!platforms.includes(platform)) {
      platforms.push(platform);
      onPreferenceChange('preferredPlatforms', platforms);
    }
  };

  const removePlatform = (platform: string) => {
    const platforms = [...(preferences.preferredPlatforms || [])];
    const index = platforms.indexOf(platform);
    if (index !== -1) {
      platforms.splice(index, 1);
      onPreferenceChange('preferredPlatforms', platforms);
    }
  };

  const addCustomPlatform = () => {
    if (!newPlatform.trim()) return;
    addPlatform(newPlatform.trim());
    setNewPlatform('');
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      addCustomPlatform();
    }
  };

  const addPreferredTime = () => {
    const times = [...(preferences.preferredTimes || []), newPreferredTime];
    onPreferenceChange('preferredTimes', times);
    
    // Reset form
    setNewPreferredTime({
      type: 'morning',
      time: '09:00',
    });
  };

  const removePreferredTime = (index: number) => {
    const times = [...(preferences.preferredTimes || [])];
    times.splice(index, 1);
    onPreferenceChange('preferredTimes', times);
  };

  const handlePreferredTimeTypeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setNewPreferredTime({
      ...newPreferredTime,
      type: event.target.value as string,
    });
  };

  const handlePreferredTimeChange = (date: Date | null) => {
    if (date) {
      setNewPreferredTime({
        ...newPreferredTime,
        time: format(date, 'HH:mm'),
      });
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
      <Box>
        {/* Default Meeting Duration */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Default Meeting Duration
          </Typography>
          <Slider
            value={preferences.defaultDuration || 30}
            onChange={handleDurationChange}
            aria-labelledby="default-duration-slider"
            valueLabelDisplay="auto"
            step={5}
            marks
            min={5}
            max={120}
            valueLabelFormat={(value) => `${value} min`}
          />
        </Box>

        {/* Default Meeting Type */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Default Meeting Type
          </Typography>
          <FormControl fullWidth>
            <Select
              value={preferences.defaultMeetingType || 'virtual'}
              onChange={handleMeetingTypeChange}
            >
              {MEETING_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Virtual Meeting URLs */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Default Virtual Meeting URL
          </Typography>
          <TextField
            fullWidth
            label="Meeting URL"
            value={preferences.virtualMeetingUrl || ''}
            onChange={(e) => onPreferenceChange('virtualMeetingUrl', e.target.value)}
            placeholder="e.g., https://meet.google.com/your-meeting-code"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon />
                </InputAdornment>
              ),
            }}
          />
          <FormHelperText>
            This URL will be used as the default for your virtual meetings
          </FormHelperText>
        </Box>

        {/* Preferred Meeting Platforms */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Preferred Meeting Platforms
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {(preferences.preferredPlatforms || []).map((platform) => (
              <Chip
                key={platform}
                label={platform}
                onDelete={() => removePlatform(platform)}
                color="primary"
                variant="outlined"
                icon={<VideocamIcon />}
              />
            ))}
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Add Platforms
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {MEETING_PLATFORMS.map((platform) => (
                  <Chip
                    key={platform}
                    label={platform}
                    onClick={() => addPlatform(platform)}
                    color="default"
                    variant="outlined"
                    clickable
                  />
                ))}
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  label="Custom Platform"
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="e.g., Skype"
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={addCustomPlatform}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Preferred Meeting Times */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Preferred Meeting Times
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Set times of day when you prefer to have meetings scheduled.
          </Typography>

          {/* Existing Preferred Times */}
          {(preferences.preferredTimes || []).map((time, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2, position: 'relative' }}>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => removePreferredTime(index)}
              >
                <DeleteIcon />
              </IconButton>
              
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <AccessTimeIcon color="primary" />
                </Grid>
                <Grid item xs>
                  <Typography variant="subtitle1">
                    {time.type === 'custom' ? 'Custom Time' : time.type.charAt(0).toUpperCase() + time.type.slice(1)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {time.time}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          ))}

          {/* Add New Preferred Time */}
          <Paper sx={{ p: 2, mb: 2, border: '1px dashed #ccc' }}>
            <Typography variant="subtitle1" gutterBottom>
              Add New Preferred Time
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="preferred-time-type-label">Time Type</InputLabel>
                  <Select
                    labelId="preferred-time-type-label"
                    value={newPreferredTime.type}
                    onChange={handlePreferredTimeTypeChange}
                    label="Time Type"
                  >
                    {TIME_TYPES.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TimePicker
                  label="Preferred Time"
                  value={parse(newPreferredTime.time, 'HH:mm', new Date())}
                  onChange={handlePreferredTimeChange}
                />
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addPreferredTime}
              >
                Add Preferred Time
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
