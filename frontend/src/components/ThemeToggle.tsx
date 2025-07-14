import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { moon, sunny } from 'ionicons/icons';
import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

interface ThemeToggleProps {
  slot?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ slot }) => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <IonButton
      fill="clear"
      slot={slot}
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
    >
      <IonIcon 
        icon={isDarkMode ? sunny : moon} 
        className="theme-toggle-icon"
      />
    </IonButton>
  );
};

export default ThemeToggle;