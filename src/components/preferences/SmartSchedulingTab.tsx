import { useState } from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Switch,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  Button,
  Divider,
  Chip,
  TextField,
  IconButton,
  Alert,
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import WorkIcon from '@mui/icons-material/Work';
import HomeIcon from '@mui/icons-material/Home';
import BlockIcon from '@mui/icons-material/Block';
import BalanceIcon from '@mui/icons-material/Balance';

import { UserPreferencesData } from '../../types/preferences';

interface SmartSchedulingTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

const RULE_TYPES = [
  { value: 'time', label: 'Time-based' },
  { value: 'participant', label: 'Participant-based' },
  { value: 'topic', label: 'Topic-based' },
];

export default function SmartSchedulingTab({ preferences, onPreferenceChange }: SmartSchedulingTabProps) {
  const [newRule, setNewRule] = useState({ type: 'time', condition: '' });

  const handleSmartSchedulingToggle = () => {
    onPreferenceChange('smartSchedulingEnabled', !preferences.smartSchedulingEnabled);
  };

  const handlePriorityChange = (type: string, value: number) => {
    const priorities = { ...(preferences.priorityLevels || {}) };
    priorities[type] = value;
    onPreferenceChange('priorityLevels', priorities);
  };

  const handleWorkLifeBalanceChange = (field: string, value: any) => {
    const balance = { ...(preferences.workLifeBalance || { maxWorkHours: 8, noMeetingsAfter: '18:00' }) };
    balance[field] = value;
    onPreferenceChange('workLifeBalance', balance);
  };

  const handleMaxWorkHoursChange = (event: Event, newValue: number | number[]) => {
    handleWorkLifeBalanceChange('maxWorkHours', newValue as number);
  };

  const handleNoMeetingsAfterChange = (date: Date | null) => {
    if (date) {
      handleWorkLifeBalanceChange('noMeetingsAfter', format(date, 'HH:mm'));
    }
  };

  const handleNewRuleChange = (field: string, value: string) => {
    setNewRule({
      ...newRule,
      [field]: value,
    });
  };

  const addRule = () => {
    if (!newRule.condition.trim()) return;
    
    const rules = [...(preferences.autoDeclineRules || []), newRule];
    onPreferenceChange('autoDeclineRules', rules);
    
    // Reset form
    setNewRule({ type: 'time', condition: '' });
  };

  const removeRule = (index: number) => {
    const rules = [...(preferences.autoDeclineRules || [])];
    rules.splice(index, 1);
    onPreferenceChange('autoDeclineRules', rules);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <AutoAwesomeIcon color="primary" sx={{ mr: 1, fontSize: 28 }} />
          <Typography variant="h6">
            Smart Scheduling (Coming Soon)
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          Smart Scheduling uses AI to optimize your calendar based on your preferences and work habits. 
          Configure your settings now to be ready when this feature launches.
        </Alert>

        <FormControlLabel
          control={
            <Switch
              checked={preferences.smartSchedulingEnabled || false}
              onChange={handleSmartSchedulingToggle}
              color="primary"
            />
          }
          label="Enable Smart Scheduling"
        />

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          When enabled, Meetini will use AI to suggest optimal meeting times, automatically 
          decline low-priority meetings during focus time, and help maintain your work-life balance.
        </Typography>

        {/* Meeting Priorities */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Meeting Priorities
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Set priority levels for different types of meetings to help the AI make better decisions.
          </Typography>

          <Paper sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography gutterBottom>
                  1:1 Meetings with Manager
                </Typography>
                <Slider
                  value={(preferences.priorityLevels?.manager || 9)}
                  onChange={(e, value) => handlePriorityChange('manager', value as number)}
                  aria-labelledby="manager-priority-slider"
                  valueLabelDisplay="auto"
                  step={1}
                  marks
                  min={1}
                  max={10}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography gutterBottom>
                  Team Meetings
                </Typography>
                <Slider
                  value={(preferences.priorityLevels?.team || 7)}
                  onChange={(e, value) => handlePriorityChange('team', value as number)}
                  aria-labelledby="team-priority-slider"
                  valueLabelDisplay="auto"
                  step={1}
                  marks
                  min={1}
                  max={10}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography gutterBottom>
                  Cross-functional Meetings
                </Typography>
                <Slider
                  value={(preferences.priorityLevels?.crossFunctional || 5)}
                  onChange={(e, value) => handlePriorityChange('crossFunctional', value as number)}
                  aria-labelledby="cross-functional-priority-slider"
                  valueLabelDisplay="auto"
                  step={1}
                  marks
                  min={1}
                  max={10}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography gutterBottom>
                  External Meetings
                </Typography>
                <Slider
                  value={(preferences.priorityLevels?.external || 6)}
                  onChange={(e, value) => handlePriorityChange('external', value as number)}
                  aria-labelledby="external-priority-slider"
                  valueLabelDisplay="auto"
                  step={1}
                  marks
                  min={1}
                  max={10}
                />
              </Grid>
            </Grid>
          </Paper>
        </Box>

        {/* Auto-Decline Rules */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Auto-Decline Rules
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Create rules for when meetings should be automatically declined.
          </Typography>

          {/* Existing Rules */}
          {(preferences.autoDeclineRules || []).map((rule, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2, position: 'relative' }}>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => removeRule(index)}
              >
                <DeleteIcon />
              </IconButton>
              
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <BlockIcon color="error" />
                </Grid>
                <Grid item xs>
                  <Typography variant="subtitle2">
                    {rule.type === 'time' ? 'Time-based Rule' : 
                     rule.type === 'participant' ? 'Participant-based Rule' : 
                     'Topic-based Rule'}
                  </Typography>
                  <Typography variant="body2">
                    {rule.condition}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          ))}

          {/* Add New Rule */}
          <Paper sx={{ p: 2, mb: 2, border: '1px dashed #ccc' }}>
            <Typography variant="subtitle2" gutterBottom>
              Add New Auto-Decline Rule
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel id="rule-type-label">Rule Type</InputLabel>
                  <Select
                    labelId="rule-type-label"
                    value={newRule.type}
                    onChange={(e) => handleNewRuleChange('type', e.target.value)}
                    label="Rule Type"
                  >
                    {RULE_TYPES.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  label="Condition"
                  value={newRule.condition}
                  onChange={(e) => handleNewRuleChange('condition', e.target.value)}
                  placeholder={
                    newRule.type === 'time' ? "e.g., After 6 PM on Fridays" :
                    newRule.type === 'participant' ? "e.g., More than 10 participants" :
                    "e.g., Contains 'status update'"
                  }
                />
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addRule}
                disabled={!newRule.condition.trim()}
              >
                Add Rule
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* Work-Life Balance */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Work-Life Balance
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Set limits to maintain a healthy work-life balance.
          </Typography>

          <Paper sx={{ p: 3 }}>
            <Box sx={{ mb: 3 }}>
              <Typography gutterBottom>
                Maximum Work Hours Per Day
              </Typography>
              <Slider
                value={(preferences.workLifeBalance?.maxWorkHours || 8)}
                onChange={handleMaxWorkHoursChange}
                aria-labelledby="max-work-hours-slider"
                valueLabelDisplay="auto"
                step={0.5}
                marks={[
                  { value: 4, label: '4h' },
                  { value: 8, label: '8h' },
                  { value: 12, label: '12h' },
                ]}
                min={4}
                max={12}
              />
            </Box>

            <Box>
              <Typography gutterBottom>
                No Meetings After
              </Typography>
              <TimePicker
                value={parse(preferences.workLifeBalance?.noMeetingsAfter || '18:00', 'HH:mm', new Date())}
                onChange={handleNoMeetingsAfterChange}
              />
            </Box>
          </Paper>
        </Box>

        {/* AI Learning */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            AI Learning
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Control how the AI learns from your behavior to improve scheduling.
          </Typography>

          <Paper sx={{ p: 3 }}>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={true} // Replace with actual preference when added to schema
                    // onChange={() => handleToggleChange('learnFromDeclines')}
                    color="primary"
                  />
                }
                label="Learn from declined meetings"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={true} // Replace with actual preference when added to schema
                    // onChange={() => handleToggleChange('learnFromRescheduling')}
                    color="primary"
                  />
                }
                label="Learn from rescheduled meetings"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={true} // Replace with actual preference when added to schema
                    // onChange={() => handleToggleChange('suggestOptimalTimes')}
                    color="primary"
                  />
                }
                label="Suggest optimal meeting times"
              />
            </FormGroup>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Coming Soon: Advanced AI Features
            </Typography>
            <Typography variant="body2" color="text.secondary">
              More advanced AI scheduling features will be available in a future update.
            </Typography>
          </Paper>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
