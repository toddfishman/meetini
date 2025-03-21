import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  IconButton,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import FreeBreakfastIcon from '@mui/icons-material/FreeBreakfast';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import EventIcon from '@mui/icons-material/Event';

import { UserPreferencesData, PersonalEvent, MealTime } from '../../types/preferences';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: <FreeBreakfastIcon /> },
  { value: 'lunch', label: 'Lunch', icon: <RestaurantIcon /> },
  { value: 'dinner', label: 'Dinner', icon: <DinnerDiningIcon /> },
];

interface PersonalTimeTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

export default function PersonalTimeTab({ preferences, onPreferenceChange }: PersonalTimeTabProps) {
  const [newPersonalEvent, setNewPersonalEvent] = useState<PersonalEvent>({
    title: '',
    start: '12:00',
    end: '13:00',
    days: [1, 2, 3, 4, 5],
  });

  const [newMealTime, setNewMealTime] = useState<MealTime>({
    type: 'lunch',
    start: '12:00',
    end: '13:00',
  });

  const handlePersonalEventChange = (field: keyof PersonalEvent, value: any) => {
    setNewPersonalEvent({
      ...newPersonalEvent,
      [field]: value,
    });
  };

  const handlePersonalEventTimeChange = (
    type: 'start' | 'end', 
    date: Date | null
  ) => {
    if (!date) return;
    
    setNewPersonalEvent({
      ...newPersonalEvent,
      [type]: format(date, 'HH:mm'),
    });
  };

  const handlePersonalEventDayToggle = (day: number) => {
    const days = [...newPersonalEvent.days];
    const index = days.indexOf(day);
    
    if (index === -1) {
      days.push(day);
    } else {
      days.splice(index, 1);
    }
    
    setNewPersonalEvent({
      ...newPersonalEvent,
      days,
    });
  };

  const addPersonalEvent = () => {
    if (!newPersonalEvent.title.trim()) return;
    
    const events = [...(preferences.personalEvents || []), newPersonalEvent];
    onPreferenceChange('personalEvents', events);
    
    // Reset form
    setNewPersonalEvent({
      title: '',
      start: '12:00',
      end: '13:00',
      days: [1, 2, 3, 4, 5],
    });
  };

  const removePersonalEvent = (index: number) => {
    const events = [...(preferences.personalEvents || [])];
    events.splice(index, 1);
    onPreferenceChange('personalEvents', events);
  };

  const handleMealTimeChange = (field: keyof MealTime, value: any) => {
    setNewMealTime({
      ...newMealTime,
      [field]: value,
    });
  };

  const handleMealTimeTimeChange = (
    type: 'start' | 'end', 
    date: Date | null
  ) => {
    if (!date) return;
    
    setNewMealTime({
      ...newMealTime,
      [type]: format(date, 'HH:mm'),
    });
  };

  const addMealTime = () => {
    const meals = [...(preferences.mealTimes || [])];
    
    // Replace if the type already exists, otherwise add
    const existingIndex = meals.findIndex(meal => meal.type === newMealTime.type);
    if (existingIndex !== -1) {
      meals[existingIndex] = newMealTime;
    } else {
      meals.push(newMealTime);
    }
    
    onPreferenceChange('mealTimes', meals);
    
    // Reset form to next meal type not yet added
    const remainingTypes = MEAL_TYPES.filter(
      type => !meals.some(meal => meal.type === type.value)
    );
    
    if (remainingTypes.length > 0) {
      setNewMealTime({
        type: remainingTypes[0].value,
        start: '12:00',
        end: '13:00',
      });
    } else {
      setNewMealTime({
        type: 'lunch',
        start: '12:00',
        end: '13:00',
      });
    }
  };

  const removeMealTime = (index: number) => {
    const meals = [...(preferences.mealTimes || [])];
    meals.splice(index, 1);
    onPreferenceChange('mealTimes', meals);
  };

  const getMealIcon = (type: string) => {
    const mealType = MEAL_TYPES.find(meal => meal.value === type);
    return mealType ? mealType.icon : <RestaurantIcon />;
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
      <Box>
        {/* Personal Events */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Personal Events
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Add recurring personal events that should be blocked off in your calendar.
          </Typography>

          {/* Existing Personal Events */}
          {(preferences.personalEvents || []).map((event, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2, position: 'relative' }}>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => removePersonalEvent(index)}
              >
                <DeleteIcon />
              </IconButton>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EventIcon color="primary" />
                    <Typography variant="subtitle1">
                      {event.title}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Time: {event.start} - {event.end}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Days: {event.days.map(day => 
                      DAYS_OF_WEEK.find(d => d.value === day)?.label.substring(0, 3)
                    ).join(', ')}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          ))}

          {/* Add New Personal Event */}
          <Paper sx={{ p: 2, mb: 2, border: '1px dashed #ccc' }}>
            <Typography variant="subtitle1" gutterBottom>
              Add New Personal Event
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Event Title"
                  value={newPersonalEvent.title}
                  onChange={(e) => handlePersonalEventChange('title', e.target.value)}
                  placeholder="e.g., Gym, School Pickup, Therapy"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box display="flex" gap={2}>
                  <TimePicker
                    label="Start Time"
                    value={parse(newPersonalEvent.start, 'HH:mm', new Date())}
                    onChange={(date) => handlePersonalEventTimeChange('start', date)}
                  />
                  <TimePicker
                    label="End Time"
                    value={parse(newPersonalEvent.end, 'HH:mm', new Date())}
                    onChange={(date) => handlePersonalEventTimeChange('end', date)}
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
                          checked={newPersonalEvent.days.includes(value)}
                          onChange={() => handlePersonalEventDayToggle(value)}
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
                onClick={addPersonalEvent}
                disabled={!newPersonalEvent.title.trim()}
              >
                Add Event
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* Meal Times */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Meal Times
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Set your regular meal times to avoid scheduling meetings during these periods.
          </Typography>

          {/* Existing Meal Times */}
          {(preferences.mealTimes || []).map((meal, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2, position: 'relative' }}>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => removeMealTime(index)}
              >
                <DeleteIcon />
              </IconButton>
              
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  {getMealIcon(meal.type)}
                </Grid>
                <Grid item xs>
                  <Typography variant="subtitle1">
                    {meal.type.charAt(0).toUpperCase() + meal.type.slice(1)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {meal.start} - {meal.end}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          ))}

          {/* Add New Meal Time */}
          <Paper sx={{ p: 2, mb: 2, border: '1px dashed #ccc' }}>
            <Typography variant="subtitle1" gutterBottom>
              Add/Update Meal Time
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  {getMealIcon(newMealTime.type)}
                  <Typography variant="subtitle2">
                    {newMealTime.type.charAt(0).toUpperCase() + newMealTime.type.slice(1)}
                  </Typography>
                </Box>
                <FormGroup row>
                  {MEAL_TYPES.map(({ value, label, icon }) => (
                    <FormControlLabel
                      key={value}
                      control={
                        <Checkbox
                          checked={newMealTime.type === value}
                          onChange={() => handleMealTimeChange('type', value)}
                        />
                      }
                      label={label}
                    />
                  ))}
                </FormGroup>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box display="flex" gap={2}>
                  <TimePicker
                    label="Start Time"
                    value={parse(newMealTime.start, 'HH:mm', new Date())}
                    onChange={(date) => handleMealTimeTimeChange('start', date)}
                  />
                  <TimePicker
                    label="End Time"
                    value={parse(newMealTime.end, 'HH:mm', new Date())}
                    onChange={(date) => handleMealTimeTimeChange('end', date)}
                  />
                </Box>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addMealTime}
              >
                Save Meal Time
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
