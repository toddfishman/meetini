import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  Tabs,
  Tab,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VideocamIcon from '@mui/icons-material/Videocam';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import ScheduleTab from './ScheduleTab';
import LocationTab from './LocationTab';
import MeetingsTab from './MeetingsTab';
import PersonalTimeTab from './PersonalTimeTab';
import NotificationsTab from './NotificationsTab';
import CalendarSettingsTab from './CalendarSettingsTab';
import SmartSchedulingTab from './SmartSchedulingTab';

import { UserPreferencesData } from '../../types/preferences';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`preferences-tabpanel-${index}`}
      aria-labelledby={`preferences-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

interface UserPreferencesProps {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

export default function UserPreferences({
  open,
  onClose,
  preferences,
  onPreferenceChange,
}: UserPreferencesProps) {
  const [tabValue, setTabValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle>
        <Typography variant="h5" component="div">
          User Preferences
        </Typography>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          variant="scrollable"
          scrollButtons="auto"
          aria-label="preferences tabs"
        >
          <Tab icon={<AccessTimeIcon />} label="Schedule" />
          <Tab icon={<LocationOnIcon />} label="Location" />
          <Tab icon={<VideocamIcon />} label="Meetings" />
          <Tab icon={<ScheduleIcon />} label="Personal Time" />
          <Tab icon={<NotificationsIcon />} label="Notifications" />
          <Tab icon={<CalendarMonthIcon />} label="Calendar" />
          <Tab icon={<AutoAwesomeIcon />} label="Smart Scheduling" />
        </Tabs>
      </Box>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <TabPanel value={tabValue} index={0}>
          <ScheduleTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          <LocationTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={2}>
          <MeetingsTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={3}>
          <PersonalTimeTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={4}>
          <NotificationsTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={5}>
          <CalendarSettingsTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
        
        <TabPanel value={tabValue} index={6}>
          <SmartSchedulingTab 
            preferences={preferences} 
            onPreferenceChange={onPreferenceChange} 
          />
        </TabPanel>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={loading}
          color="primary"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
