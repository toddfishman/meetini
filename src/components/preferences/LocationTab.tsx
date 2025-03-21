import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Button,
  Grid,
  Paper,
  InputAdornment,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import DirectionsTransitIcon from '@mui/icons-material/DirectionsTransit';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import HomeIcon from '@mui/icons-material/Home';
import BusinessIcon from '@mui/icons-material/Business';

import { UserPreferencesData } from '../../types/preferences';

interface LocationTabProps {
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
}

const TRANSPORT_MODES = [
  { value: 'driving', label: 'Driving', icon: <DirectionsCarIcon /> },
  { value: 'walking', label: 'Walking', icon: <DirectionsWalkIcon /> },
  { value: 'transit', label: 'Public Transit', icon: <DirectionsTransitIcon /> },
  { value: 'bicycling', label: 'Bicycling', icon: <DirectionsBikeIcon /> },
];

export default function LocationTab({ preferences, onPreferenceChange }: LocationTabProps) {
  const [newNoGoZone, setNewNoGoZone] = useState('');

  const handleGpsToggle = () => {
    onPreferenceChange('gpsEnabled', !preferences.gpsEnabled);
  };

  const handleTransportChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    onPreferenceChange('preferredTransport', event.target.value as string);
  };

  const handleMaxTravelTimeChange = (event: Event, newValue: number | number[]) => {
    onPreferenceChange('maxTravelTime', newValue as number);
  };

  const handleMaxTravelDistanceChange = (event: Event, newValue: number | number[]) => {
    onPreferenceChange('maxTravelDistance', newValue as number);
  };

  const addNoGoZone = () => {
    if (!newNoGoZone.trim()) return;
    
    const zones = [...(preferences.noGoZones || []), newNoGoZone.trim()];
    onPreferenceChange('noGoZones', zones);
    setNewNoGoZone('');
  };

  const removeNoGoZone = (index: number) => {
    const zones = [...(preferences.noGoZones || [])];
    zones.splice(index, 1);
    onPreferenceChange('noGoZones', zones);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      addNoGoZone();
    }
  };

  return (
    <Box>
      {/* Home Location */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Home Location
        </Typography>
        <TextField
          fullWidth
          label="Home Address"
          value={preferences.homeLocation || ''}
          onChange={(e) => onPreferenceChange('homeLocation', e.target.value)}
          placeholder="Enter your home address"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <HomeIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Office Location */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Office Location
        </Typography>
        <TextField
          fullWidth
          label="Office Address"
          value={preferences.officeLocation || ''}
          onChange={(e) => onPreferenceChange('officeLocation', e.target.value)}
          placeholder="Enter your office address"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <BusinessIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* GPS Settings */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Location Services
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={preferences.gpsEnabled || false}
              onChange={handleGpsToggle}
              color="primary"
            />
          }
          label="Enable GPS location for real-time travel updates"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          When enabled, Meetini can provide real-time traffic alerts and better venue recommendations based on your current location.
        </Typography>
      </Box>

      {/* Travel Preferences */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Travel Preferences
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id="transport-mode-label">Preferred Transport</InputLabel>
              <Select
                labelId="transport-mode-label"
                value={preferences.preferredTransport || 'driving'}
                onChange={handleTransportChange}
                label="Preferred Transport"
              >
                {TRANSPORT_MODES.map((mode) => (
                  <MenuItem key={mode.value} value={mode.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {mode.icon}
                      <Box sx={{ ml: 1 }}>{mode.label}</Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box sx={{ mt: 3 }}>
          <Typography gutterBottom>
            Maximum Travel Time (minutes)
          </Typography>
          <Slider
            value={preferences.maxTravelTime || 30}
            onChange={handleMaxTravelTimeChange}
            aria-labelledby="max-travel-time-slider"
            valueLabelDisplay="auto"
            step={5}
            marks
            min={5}
            max={120}
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography gutterBottom>
            Maximum Travel Distance (miles)
          </Typography>
          <Slider
            value={preferences.maxTravelDistance || 5}
            onChange={handleMaxTravelDistanceChange}
            aria-labelledby="max-travel-distance-slider"
            valueLabelDisplay="auto"
            step={1}
            marks
            min={1}
            max={50}
          />
        </Box>
      </Box>

      {/* No-Go Zones */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          No-Go Zones
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Add areas or neighborhoods you prefer to avoid for meetings.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {(preferences.noGoZones || []).map((zone, index) => (
            <Chip
              key={index}
              label={zone}
              onDelete={() => removeNoGoZone(index)}
              color="primary"
              variant="outlined"
              icon={<LocationOnIcon />}
            />
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Add No-Go Zone"
            value={newNoGoZone}
            onChange={(e) => setNewNoGoZone(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., Downtown, North Beach"
            fullWidth
          />
          <Button
            variant="outlined"
            onClick={addNoGoZone}
            startIcon={<AddIcon />}
          >
            Add
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
