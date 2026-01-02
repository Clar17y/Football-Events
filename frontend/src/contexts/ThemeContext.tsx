import React, { createContext, useContext, useState, useEffect } from 'react';

const APP_SETTINGS_KEY = 'matchmaster_app_settings';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check for saved theme preference from app settings first
    const loadTheme = () => {
      try {
        const appSettings = localStorage.getItem(APP_SETTINGS_KEY);
        if (appSettings) {
          const parsed = JSON.parse(appSettings);
          const theme = parsed.theme || 'system';
          applyTheme(theme);
          return;
        }
      } catch { }

      // Fallback to legacy matchmaster-theme key
      const savedTheme = localStorage.getItem('matchmaster-theme');
      if (savedTheme) {
        const isDark = savedTheme === 'dark';
        setIsDarkMode(isDark);
        updateThemeClass(isDark);
      } else {
        // Default to light mode for outdoor sports use
        updateThemeClass(false);
      }
    };

    loadTheme();

    // Listen for storage changes (from other tabs or App Settings page)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === APP_SETTINGS_KEY || e.key === 'matchmaster-theme') {
        loadTheme();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateThemeClass = (isDark: boolean) => {
    const body = document.body;
    if (isDark) {
      body.classList.add('dark-theme');
    } else {
      body.classList.remove('dark-theme');
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    let isDark = false;
    if (theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = theme === 'dark';
    }
    setIsDarkMode(isDark);
    updateThemeClass(isDark);
  };

  const updateAppSettings = (theme: 'light' | 'dark') => {
    try {
      const appSettings = localStorage.getItem(APP_SETTINGS_KEY);
      const settings = appSettings ? JSON.parse(appSettings) : {};
      settings.theme = theme;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    } catch { }
    // Also update legacy key for compatibility
    localStorage.setItem('matchmaster-theme', theme);
  };

  const toggleTheme = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(!isDarkMode);
    updateThemeClass(!isDarkMode);
    updateAppSettings(newTheme);
  };

  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    applyTheme(theme);
    try {
      const appSettings = localStorage.getItem(APP_SETTINGS_KEY);
      const settings = appSettings ? JSON.parse(appSettings) : {};
      settings.theme = theme;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    } catch { }
    // Update legacy key based on resolved theme
    const resolvedTheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    localStorage.setItem('matchmaster-theme', resolvedTheme);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};