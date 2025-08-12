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
        main: '#3880ff', // Ionic primary color
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
