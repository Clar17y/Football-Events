import React, { useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useTheme as useAppTheme } from './contexts/ThemeContext';

const MuiThemeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isDarkMode } = useAppTheme();

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: isDarkMode ? 'dark' : 'light',
      primary: {
        main: isDarkMode ? '#2e7d62' : '#12392d',
        light: isDarkMode ? '#439678' : '#1d5242',
        dark: isDarkMode ? '#1f5c47' : '#0c261e',
        contrastText: '#ffffff',
      },
      secondary: {
        main: isDarkMode ? '#389e7c' : '#245b49',
      },
      background: {
        default: isDarkMode ? '#111e19' : '#f8faf7',
        paper: isDarkMode ? '#1b2c24' : '#ffffff',
      },
      text: {
        primary: isDarkMode ? '#f4f6f4' : '#14231d',
        secondary: isDarkMode ? '#9ab0a4' : '#56645d',
      },
      divider: isDarkMode ? '#2a3e34' : '#dce4de',
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      body1: {
        fontSize: '15px',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '14px',
        lineHeight: 1.5,
      },
      button: {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '14px',
      },
    },
    shape: {
      borderRadius: 14,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: '44px',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontSize: '15px',
          },
        },
      },
    },
  }), [isDarkMode]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};

export default MuiThemeBridge;
