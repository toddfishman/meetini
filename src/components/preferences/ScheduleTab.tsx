import { useState } from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Slider,
  TextField,
  Button,
  IconButton,
  Grid,
  Paper,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

import { UserPreferencesData, FocusTimeBlock } from '../../types/preferences';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

interface ScheduleTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

export default function ScheduleTab({ preferences, onPreferenceChange }: ScheduleTabProps) {
  const [newFocusBlock, setNewFocusBlock] = useState<FocusTimeBlock>({
    start: '09:00',
    end: '12:00',
    days: [1, 2, 3, 4, 5],
  });

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

  const handleWorkDayToggle = (day: number) => {
    const currentDays = [...preferences.workDays];
    const index = currentDays.indexOf(day);
    
    if (index === -1) {
      currentDays.push(day);
    } else {
      currentDays.splice(index, 1);
    }
    
    onPreferenceChange('workDays', currentDays);
  };

  const handleBufferTimeChange = (event: Event, newValue: number | number[]) => {
    onPreferenceChange('bufferTime', newValue as number);
  };

  const handleMaxMeetingsChange = (event: Event, newValue: number | number[]) => {
    onPreferenceChange('maxMeetingsPerDay', newValue as number);
  };

  const handleFocusBlockTimeChange = (
    index: number, 
    type: 'start' | 'end', 
    date: Date | null
  ) => {
    if (!date) return;
    
    const blocks = [...(preferences.focusTimeBlocks || [])];
    blocks[index] = {
      ...blocks[index],
      [type]: format(date, 'HH:mm'),
    };
    
    onPreferenceChange('focusTimeBlocks', blocks);
  };

  const handleNewFocusBlockTimeChange = (
    type: 'start' | 'end', 
    date: Date | null
  ) => {
    if (!date) return;
    
    setNewFocusBlock({
      ...newFocusBlock,
      [type]: format(date, 'HH:mm'),
    });
  };

  const handleFocusBlockDayToggle = (index: number, day: number) => {
    const blocks = [...(preferences.focusTimeBlocks || [])];
    const days = [...blocks[index].days];
    const dayIndex = days.indexOf(day);
    
    if (dayIndex === -1) {
      days.push(day);
    } else {
      days.splice(dayIndex, 1);
    }
    
    blocks[index] = {
      ...blocks[index],
      days,
    };
    
    onPreferenceChange('focusTimeBlocks', blocks);
  };

  const handleNewFocusBlockDayToggle = (day: number) => {
    const days = [...newFocusBlock.days];
    const index = days.indexOf(day);
    
    if (index === -1) {
      days.push(day);
    } else {
      days.splice(index, 1);
    }
    
    setNewFocusBlock({
      ...newFocusBlock,
      days,
    });
  };

  const addFocusBlock = () => {
    const blocks = [...(preferences.focusTimeBlocks || []), newFocusBlock];
    onPreferenceChange('focusTimeBlocks', blocks);
    
    // Reset form
    setNewFocusBlock({
      start: '09:00',
      end: '12:00',
      days: [1, 2, 3, 4, 5],
    });
  };

  const removeFocusBlock = (index: number) => {
    const blocks = [...(preferences.focusTimeBlocks || [])];
    blocks.splice(index, 1);
    onPreferenceChange('focusTimeBlocks', blocks);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
      <Box>
        {/* Working Hours */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Working Hours
          </Typography>
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
        </Box>

        {/* Working Days */}
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
                    onChange={() => handleWorkDayToggle(value)}
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
        </Box>

        {/* Timezone */}
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

        {/* Buffer Time */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Buffer Time Between Meetings (minutes)
          </Typography>
          <Slider
            value={preferences.bufferTime || 15}
            onChange={handleBufferTimeChange}
            aria-labelledby="buffer-time-slider"
            valueLabelDisplay="auto"
            step={5}
            marks
            min={0}
            max={60}
          />
        </Box>

        {/* Max Meetings Per Day */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Maximum Meetings Per Day
          </Typography>
          <Slider
            value={preferences.maxMeetingsPerDay || 8}
            onChange={handleMaxMeetingsChange}
            aria-labelledby="max-meetings-slider"
            valueLabelDisplay="auto"
            step={1}
            marks
            min={1}
            max={15}
          />
        </Box>

        {/* Focus Time Blocks */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Focus Time Blocks
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Set blocks of time where you prefer not to have meetings scheduled.
          </Typography>

          {/* Existing Focus Blocks */}
          {(preferences.focusTimeBlocks || []).map((block, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2, position: 'relative' }}>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => removeFocusBlock(index)}
              >
                <DeleteIcon />
              </IconButton>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box display="flex" gap={2}>
                    <TimePicker
                      label="Start Time"
                      value={parse(block.start, 'HH:mm', new Date())}
                      onChange={(date) => handleFocusBlockTimeChange(index, 'start', date)}
                    />
                    <TimePicker
                      label="End Time"
                      value={parse(block.end, 'HH:mm', new Date())}
                      onChange={(date) => handleFocusBlockTimeChange(index, 'end', date)}
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Days
                  </Typography>
                  <FormGroup row>
                    {DAYS_OF_WEEK.map(({ value, label }) => (
                      <FormControlLabel
                        key={value}
                        control={
                          <Checkbox
                            size="small"
                            checked={block.days.includes(value)}
                            onChange={() => handleFocusBlockDayToggle(index, value)}
                          />
                        }
                        label={label.substring(0, 3)}
                      />
                    ))}
                  </FormGroup>
                </Grid>
              </Grid>
            </Paper>
          ))}

          {/* Add New Focus Block */}
          <Paper sx={{ p: 2, mb: 2, border: '1px dashed #ccc' }}>
            <Typography variant="subtitle1" gutterBottom>
              Add New Focus Block
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box display="flex" gap={2}>
                  <TimePicker
                    label="Start Time"
                    value={parse(newFocusBlock.start, 'HH:mm', new Date())}
                    onChange={(date) => handleNewFocusBlockTimeChange('start', date)}
                  />
                  <TimePicker
                    label="End Time"
                    value={parse(newFocusBlock.end, 'HH:mm', new Date())}
                    onChange={(date) => handleNewFocusBlockTimeChange('end', date)}
                  />
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Days
                </Typography>
                <FormGroup row>
                  {DAYS_OF_WEEK.map(({ value, label }) => (
                    <FormControlLabel
                      key={value}
                      control={
                        <Checkbox
                          size="small"
                          checked={newFocusBlock.days.includes(value)}
                          onChange={() => handleNewFocusBlockDayToggle(value)}
                        />
                      }
                      label={label.substring(0, 3)}
                    />
                  ))}
                </FormGroup>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addFocusBlock}
              >
                Add Focus Block
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
