/**
 * Beautiful Date Picker Modal
 * Mobile-first, touch-optimized date selection matching our design system
 */

import React, { useState } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon
} from '@ionic/react';
import { close, checkmark, calendar } from 'ionicons/icons';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TextField } from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';
import './DatePickerModal.css';

interface DatePickerModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  onDateSelect: (date: string) => void;
  initialDate?: string;
  title: string;
  minDate?: string;
  maxDate?: string;
}

const DatePickerModal: React.FC<DatePickerModalProps> = ({
  isOpen,
  onDidDismiss,
  onDateSelect,
  initialDate,
  title,
  minDate,
  maxDate
}) => {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(
    initialDate ? dayjs(initialDate) : dayjs()
  );

  // Create MUI theme with primary color
  const muiTheme = createTheme({
    palette: {
      primary: {
        main: '#3880ff', // ion-color-primary
      },
    },
  });

  const handleConfirm = () => {
    if (selectedDate) {
      onDateSelect(selectedDate.toISOString());
    }
    onDidDismiss();
  };

  const handleCancel = () => {
    setSelectedDate(initialDate ? dayjs(initialDate) : dayjs());
    onDidDismiss();
  };

  const formatDisplayDate = (date: Dayjs | null) => {
    if (!date) return 'No date selected';
    return date.format('dddd, MMMM D, YYYY');
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDidDismiss} className="date-picker-modal">
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{title}</IonTitle>
          <IonButton 
            fill="clear" 
            slot="end" 
            onClick={handleCancel}
            style={{ color: 'white' }}
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="date-picker-content">
        <div className="date-picker-container">
          {/* Date Preview */}
          <div className="date-preview-section">
            <div className="date-preview-icon">
              <IonIcon icon={calendar} />
            </div>
            <div className="date-info">
              <span className="date-value">{formatDisplayDate(selectedDate)}</span>
              <span className="date-label">Selected Date</span>
            </div>
          </div>

          {/* Main Date Picker */}
          <div className="date-picker-section">
            <ThemeProvider theme={muiTheme}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  label="Select Date"
                  value={selectedDate}
                  onChange={(newValue) => setSelectedDate(newValue)}
                  minDate={minDate ? dayjs(minDate) : undefined}
                  maxDate={maxDate ? dayjs(maxDate) : undefined}
                  enableAccessibleFieldDOMStructure={false}
                  slots={{
                    textField: TextField,
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      variant: 'outlined',
                      sx: {
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '12px',
                          backgroundColor: 'var(--grassroots-surface)',
                          '& fieldset': {
                            borderColor: 'var(--grassroots-surface-variant)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--ion-color-primary)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--ion-color-primary)',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: 'var(--grassroots-text-secondary)',
                          '&.Mui-focused': {
                            color: 'var(--ion-color-primary)',
                          },
                        },
                        '& .MuiInputBase-input': {
                          color: 'var(--grassroots-text-primary)',
                        },
                      },
                    },
                  }}
                />
              </LocalizationProvider>
            </ThemeProvider>
          </div>

          {/* Action Buttons */}
          <div className="date-picker-actions">
            <IonButton 
              expand="block" 
              fill="clear" 
              onClick={handleCancel}
              className="cancel-button"
            >
              Cancel
            </IonButton>
            <IonButton 
              expand="block" 
              color="primary" 
              onClick={handleConfirm}
              className="confirm-button"
            >
              <IonIcon icon={checkmark} slot="start" />
              Select Date
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default DatePickerModal;