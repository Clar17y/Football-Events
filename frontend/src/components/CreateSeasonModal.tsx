/**
 * Create Season Modal Component
 * Beautiful form for creating/editing seasons with date pickers and validation
 */

import React, { useState } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonInput,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonText,
  IonSpinner,
  IonToggle
} from '@ionic/react';
import {
  close,
  checkmark,
  calendar,
  trophy,
  information
} from 'ionicons/icons';
import { useSeasons } from '../hooks/useSeasons';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import 'dayjs/locale/en-gb';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TextField } from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';
import type { Season } from '@shared/types';
import styles from './FormSection.module.css';

interface CreateSeasonModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  editSeason?: Season | null;
  mode?: 'create' | 'edit';
}

interface FormData {
  name: string;
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  isActive: boolean;
}

interface FormErrors {
  name?: string;
  startDate?: string;
  endDate?: string;
}

const CreateSeasonModal: React.FC<CreateSeasonModalProps> = ({ 
  isOpen, 
  onDidDismiss, 
  editSeason = null, 
  mode = 'create' 
}) => {
  const { createSeason, updateSeason, loading } = useSeasons();
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    startDate: dayjs(),
    endDate: dayjs().add(3, 'month'), // 3 months from now
    isActive: true
  });

  // Create MUI theme with primary color
  const muiTheme = createTheme({
    palette: {
      primary: {
        main: '#3880ff', // ion-color-primary
      },
    },
  });

  // Initialize form data when editing
  React.useEffect(() => {
    if (mode === 'edit' && editSeason) {
      setFormData({
        name: editSeason.label || '',
        startDate: editSeason.startDate ? dayjs(editSeason.startDate) : dayjs(),
        endDate: editSeason.endDate ? dayjs(editSeason.endDate) : dayjs().add(3, 'month'),
        isActive: editSeason.isCurrent ?? true
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        name: '',
        startDate: dayjs(),
        endDate: dayjs().add(3, 'month'),
        isActive: true
      });
    }
  }, [mode, editSeason, isOpen]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Season name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Season name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Season name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Season name must be less than 100 characters';
    }

    // Date validation
    if (formData.startDate && formData.endDate) {
      if (formData.startDate.isAfter(formData.endDate) || formData.startDate.isSame(formData.endDate)) {
        newErrors.endDate = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | boolean | Dayjs | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleInputBlur = (field: keyof FormData) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateForm();
  };

  const handleSubmit = async () => {
    // Mark all fields as touched
    const allFields = Object.keys(formData) as (keyof FormData)[];
    setTouched(allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}));

    if (!validateForm()) {
      return;
    }

    const seasonData = {
      label: formData.name.trim(),
      startDate: formData.startDate?.format('YYYY-MM-DD') || '',
      endDate: formData.endDate?.format('YYYY-MM-DD') || '',
      isCurrent: formData.isActive
    };

    let result;
    if (mode === 'edit' && editSeason) {
      console.log('Updating season with ID:', editSeason.id, 'and data:', seasonData);
      result = await updateSeason(editSeason.id, seasonData);
    } else {
      console.log('Creating new season with data:', seasonData);
      result = await createSeason(seasonData);
    }
    
    if (result) {
      // Reset form and close modal
      setFormData({
        name: '',
        startDate: dayjs(),
        endDate: dayjs().add(3, 'month'),
        isActive: true
      });
      setErrors({});
      setTouched({});
      onDidDismiss();
    }
  };

  const handleCancel = () => {
    // Reset form state
    setFormData({
      name: '',
      startDate: dayjs(),
      endDate: dayjs().add(3, 'month'),
      isActive: true
    });
    setErrors({});
    setTouched({});
    onDidDismiss();
  };

  const renderDatePicker = (label: string, field: 'startDate' | 'endDate') => (
    <div className={`${styles.datePickerWrapper} ${errors[field] && touched[field] ? styles.error : ''}`}>
      <ThemeProvider theme={muiTheme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
          <DatePicker
            label={label}
            value={formData[field]}
            onChange={(newValue) => handleInputChange(field, newValue)}
            minDate={field === 'endDate' ? formData.startDate : undefined}
            enableAccessibleFieldDOMStructure={false}
            slots={{
              textField: TextField,
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                variant: 'outlined',
                onBlur: () => handleInputBlur(field),
                sx: {
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    backgroundColor: 'var(--grassroots-surface)',
                    '& fieldset': {
                      borderColor: errors[field] && touched[field] ? 'var(--ion-color-danger)' : 'transparent',
                    },
                    '&:hover fieldset': {
                      borderColor: errors[field] && touched[field] ? 'var(--ion-color-danger)' : 'transparent',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'var(--ion-color-primary)',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'var(--grassroots-text-secondary)',
                    fontWeight: 600,
                    '&.Mui-focused': {
                      color: 'var(--ion-color-primary)',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: 'var(--grassroots-text-primary)',
                    fontWeight: 500,
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'var(--grassroots-text-primary)',
                  },
                  '.dark-theme &': {
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#2a2a2a',
                      '& fieldset': {
                        borderColor: errors[field] && touched[field] ? 'var(--ion-color-danger)' : 'transparent',
                      },
                      '&:hover fieldset': {
                        borderColor: errors[field] && touched[field] ? 'var(--ion-color-danger)' : 'transparent',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--ion-color-primary)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#888888',
                      '&.Mui-focused': {
                        color: 'var(--ion-color-primary)',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#ffffff',
                    },
                    '& .MuiSvgIcon-root': {
                      color: '#ffffff',
                    },
                  },
                },
              },
            }}
          />
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  );

  return (
    <IonModal 
      isOpen={isOpen} 
      onDidDismiss={onDidDismiss} 
      className={styles.modal}
      data-theme="season"
    >
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{mode === 'edit' ? 'Edit Season' : 'Create New Season'}</IonTitle>
          <IonButton 
            fill="clear" 
            slot="end" 
            onClick={handleCancel}
            disabled={loading}
            style={{ color: 'white' }}
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className={styles.content}>
        <div className={styles.container}>
          {/* Season Information Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={trophy} className={styles.sectionIcon} />
                Season Information
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.name && touched.name ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Season Name *</IonLabel>
                      <IonInput
                        value={formData.name}
                        onIonInput={(e) => handleInputChange('name', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('name')}
                        placeholder="Enter season name"
                        maxlength={100}
                        disabled={loading}
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.name && touched.name && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.name}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Season Dates Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={calendar} className={styles.sectionIcon} />
                Season Dates
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    {renderDatePicker('Start Date *', 'startDate')}
                    {errors.startDate && touched.startDate && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.startDate}
                      </IonText>
                    )}
                  </IonCol>
                  <IonCol size="12" sizeMd="6">
                    {renderDatePicker('End Date *', 'endDate')}
                    {errors.endDate && touched.endDate && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.endDate}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Season Settings Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={information} className={styles.sectionIcon} />
                Season Settings
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonItem className={styles.formItem}>
                <IonLabel className={styles.formLabel}>
                  <h3>Active Season</h3>
                  <p>Mark this season as currently active</p>
                </IonLabel>
                <IonToggle
                  checked={formData.isActive}
                  onIonChange={(e) => handleInputChange('isActive', e.detail.checked)}
                  disabled={loading}
                />
              </IonItem>
            </IonCardContent>
          </IonCard>

          {/* Action Buttons */}
          <div className={styles.formActions}>
            <IonButton 
              expand="block" 
              fill="clear" 
              onClick={handleCancel}
              disabled={loading}
              className={styles.cancelButton}
            >
              Cancel
            </IonButton>
            <IonButton 
              expand="block" 
              color="primary" 
              onClick={handleSubmit}
              disabled={loading || !formData.name.trim()}
              className={styles.submitButton}
            >
              {loading ? (
                <>
                  <IonSpinner name="crescent" />
                  <span style={{ marginLeft: '8px' }}>
                    {mode === 'edit' ? 'Updating...' : 'Creating...'}
                  </span>
                </>
              ) : (
                <>
                  <IonIcon icon={checkmark} slot="start" />
                  {mode === 'edit' ? 'Update Season' : 'Create Season'}
                </>
              )}
            </IonButton>
          </div>
        </div>

      </IonContent>
    </IonModal>
  );
};

export default CreateSeasonModal;
