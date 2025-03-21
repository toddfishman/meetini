import { useState } from 'react';
import PreferencesDialog from './preferences';
import { UserPreferencesData } from '../types/preferences';

interface UserPreferencesProps {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferencesData;
  onPreferenceChange: (key: keyof UserPreferencesData, value: any) => void;
  onWorkDayToggle?: (day: number) => void; // Made optional for backward compatibility
}

export default function UserPreferencesWrapper({
  open,
  onClose,
  preferences,
  onPreferenceChange,
  onWorkDayToggle,
}: UserPreferencesProps) {
  // Handle work day toggle if the old method is provided
  const handlePreferenceChange = (key: keyof UserPreferencesData, value: any) => {
    if (key === 'workDays' && onWorkDayToggle) {
      // This is for backward compatibility with the old API
      return;
    }
    onPreferenceChange(key, value);
  };

  return (
    <PreferencesDialog
      open={open}
      onClose={onClose}
      preferences={preferences}
      onPreferenceChange={handlePreferenceChange}
    />
  );
}
