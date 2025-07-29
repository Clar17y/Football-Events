/**
 * Create Player Modal Component
 * Beautiful form for creating new players with validation and team assignment
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
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonActionSheet
} from '@ionic/react';
import {
  close,
  checkmark,
  person,
  shirt,
  calendar,
  document
} from 'ionicons/icons';
import { usePlayers } from '../hooks/usePlayers';
import { useTeams } from '../hooks/useTeams';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TextField } from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/en-gb';
import type { Player, PlayerCreateRequest } from '@shared/types';
import styles from './FormSection.module.css';

interface CreatePlayerModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  editPlayer?: Player | null;
  mode?: 'create' | 'edit';
}

interface FormData {
  name: string;
  squadNumber: string;
  preferredPosition: string;
  dateOfBirth: Dayjs | null;
  notes: string;
  currentTeam: string;
}

interface FormErrors {
  name?: string;
  squadNumber?: string;
  preferredPosition?: string;
  dateOfBirth?: string;
  notes?: string;
  currentTeam?: string;
}

// Common football positions
const POSITIONS = [
  { code: 'GK', name: 'Goalkeeper' },
  { code: 'DEF', name: 'Defender' },
  { code: 'MID', name: 'Midfielder' },
  { code: 'FWD', name: 'Forward' },
  { code: 'LB', name: 'Left Back' },
  { code: 'CB', name: 'Centre Back' },
  { code: 'RB', name: 'Right Back' },
  { code: 'CDM', name: 'Defensive Midfielder' },
  { code: 'CM', name: 'Central Midfielder' },
  { code: 'CAM', name: 'Attacking Midfielder' },
  { code: 'LW', name: 'Left Winger' },
  { code: 'RW', name: 'Right Winger' },
  { code: 'ST', name: 'Striker' }
];

const CreatePlayerModal: React.FC<CreatePlayerModalProps> = ({ 
  isOpen, 
  onDidDismiss, 
  editPlayer = null, 
  mode = 'create' 
}) => {
  const { createPlayer, updatePlayer, loading } = usePlayers();
  const { teams, loadTeams } = useTeams();
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    squadNumber: '',
    preferredPosition: '',
    dateOfBirth: dayjs('2000-01-01'),
    notes: '',
    currentTeam: ''
  });

  // Initialize form data when editing
  React.useEffect(() => {
    if (mode === 'edit' && editPlayer) {
      setFormData({
        name: editPlayer.name || '',
        squadNumber: editPlayer.squadNumber?.toString() || '',
        preferredPosition: editPlayer.preferredPosition || '',
        dateOfBirth: editPlayer.dateOfBirth ? dayjs(editPlayer.dateOfBirth) : null,
        notes: editPlayer.notes || '',
        currentTeam: editPlayer.currentTeam || ''
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        name: '',
        squadNumber: '',
        preferredPosition: '',
        dateOfBirth: dayjs('2000-01-01'),
        notes: '',
        currentTeam: ''
      });
    }
  }, [mode, editPlayer, isOpen]);

  // Load teams when modal opens
  React.useEffect(() => {
    if (isOpen) {
      loadTeams();
    }
  }, [isOpen, loadTeams]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [positionActionSheetOpen, setPositionActionSheetOpen] = useState(false);
  const [teamActionSheetOpen, setTeamActionSheetOpen] = useState(false);

  // Create MUI theme with indigo color
  const muiTheme = createTheme({
    palette: {
      primary: {
        main: '#3f51b5', // ion-color-indigo
      },
    },
  });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Player name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Player name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Player name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Player name must be less than 100 characters';
    }

    // Squad number validation
    if (formData.squadNumber) {
      const squadNum = parseInt(formData.squadNumber, 10);
      if (isNaN(squadNum) || squadNum < 1 || squadNum > 99) {
        newErrors.squadNumber = 'Squad number must be between 1 and 99';
      }
    }

    // Position validation
    if (formData.preferredPosition && !POSITIONS.find(p => p.code === formData.preferredPosition)) {
      newErrors.preferredPosition = 'Please select a valid position';
    }

    // Date of birth validation
    if (formData.dateOfBirth) {
      const today = dayjs();
      const age = today.diff(formData.dateOfBirth, 'year');
      if (age < 5 || age > 50) {
        newErrors.dateOfBirth = 'Player age must be between 5 and 50 years';
      }
    }

    // Notes validation
    if (formData.notes && formData.notes.length > 1000) {
      newErrors.notes = 'Notes must be less than 1000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | Dayjs | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
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

    const playerData: PlayerCreateRequest = {
      name: formData.name.trim(),
      squadNumber: formData.squadNumber ? parseInt(formData.squadNumber, 10) : undefined,
      preferredPosition: formData.preferredPosition || undefined,
      dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth.toDate() : undefined,
      notes: formData.notes || undefined,
      currentTeam: formData.currentTeam || undefined
    };

    let result;
    if (mode === 'edit' && editPlayer) {
      console.log('Updating player with ID:', editPlayer.id, 'and data:', playerData);
      result = await updatePlayer(editPlayer.id, playerData);
    } else {
      console.log('Creating new player with data:', playerData);
      result = await createPlayer(playerData);
    }
    
    if (result) {
      // Reset form and close modal
      setFormData({
        name: '',
        squadNumber: '',
        preferredPosition: '',
        dateOfBirth: dayjs('2000-01-01'),
        notes: '',
        currentTeam: ''
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
      squadNumber: '',
      preferredPosition: '',
      dateOfBirth: null,
      notes: '',
      currentTeam: ''
    });
    setErrors({});
    setTouched({});
    onDidDismiss();
  };

  const handlePositionSelect = (position: string) => {
    handleInputChange('preferredPosition', position);
    setPositionActionSheetOpen(false);
  };

  const handleTeamSelect = (teamName: string) => {
    handleInputChange('currentTeam', teamName);
    setTeamActionSheetOpen(false);
  };

  const getPositionDisplayName = (code: string) => {
    const position = POSITIONS.find(p => p.code === code);
    return position ? `${position.name} (${position.code})` : code;
  };

  const renderDatePicker = (label: string, field: 'dateOfBirth') => (
    <div className={`${styles.datePickerWrapper} ${errors[field] && touched[field] ? styles.error : ''}`}>
      <ThemeProvider theme={muiTheme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
          <DatePicker
            format="DD/MM/YYYY"
            label={label}
            value={formData[field]}
            onChange={(newValue) => handleInputChange(field, newValue)}
            maxDate={dayjs()}
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
                      borderColor: 'var(--ion-color-indigo)',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'var(--grassroots-text-secondary)',
                    fontWeight: 600,
                    '&.Mui-focused': {
                      color: 'var(--ion-color-indigo)',
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
                        borderColor: 'var(--ion-color-indigo)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#888888',
                      '&.Mui-focused': {
                        color: 'var(--ion-color-indigo)',
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
      data-theme="player"
    >
      <IonHeader>
        <IonToolbar color="indigo">
          <IonTitle>{mode === 'edit' ? 'Edit Player' : 'Create New Player'}</IonTitle>
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
          {/* Player Information Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={person} className={styles.sectionIcon} />
                Player Information
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="8">
                    <IonItem className={`${styles.formItem} ${errors.name && touched.name ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Player Name *</IonLabel>
                      <IonInput
                        value={formData.name}
                        onIonInput={(e) => handleInputChange('name', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('name')}
                        placeholder="Enter player name"
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
                  <IonCol size="12" sizeMd="4">
                    <IonItem className={`${styles.formItem} ${errors.squadNumber && touched.squadNumber ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Squad Number</IonLabel>
                      <IonInput
                        value={formData.squadNumber}
                        onIonInput={(e) => handleInputChange('squadNumber', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('squadNumber')}
                        placeholder="1-99"
                        type="number"
                        min="1"
                        max="99"
                        disabled={loading}
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.squadNumber && touched.squadNumber && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.squadNumber}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Position and Team Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={shirt} className={styles.sectionIcon} />
                Position & Team
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    <IonItem 
                      className={`${styles.formItem} ${errors.preferredPosition && touched.preferredPosition ? styles.error : ''}`}
                      button
                      onClick={() => setPositionActionSheetOpen(true)}
                      disabled={loading}
                    >
                      <IonLabel position="stacked" className={styles.formLabel}>Preferred Position</IonLabel>
                      <IonInput
                        value={formData.preferredPosition ? getPositionDisplayName(formData.preferredPosition) : ''}
                        placeholder="Select position"
                        readonly
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.preferredPosition && touched.preferredPosition && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.preferredPosition}
                      </IonText>
                    )}
                  </IonCol>
                  <IonCol size="12" sizeMd="6">
                    <IonItem 
                      className={`${styles.formItem} ${errors.currentTeam && touched.currentTeam ? styles.error : ''}`}
                      button
                      onClick={() => setTeamActionSheetOpen(true)}
                      disabled={loading}
                    >
                      <IonLabel position="stacked" className={styles.formLabel}>Current Team</IonLabel>
                      <IonInput
                        value={formData.currentTeam}
                        placeholder="Select team"
                        readonly
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.currentTeam && touched.currentTeam && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.currentTeam}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Personal Details Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={calendar} className={styles.sectionIcon} />
                Personal Details
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    {renderDatePicker('Date of Birth', 'dateOfBirth')}
                    {errors.dateOfBirth && touched.dateOfBirth && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.dateOfBirth}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Notes Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={document} className={styles.sectionIcon} />
                Additional Notes
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.notes && touched.notes ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Notes</IonLabel>
                      <IonTextarea
                        value={formData.notes}
                        onIonInput={(e) => handleInputChange('notes', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('notes')}
                        placeholder="Any additional information about the player..."
                        rows={3}
                        maxlength={1000}
                        disabled={loading}
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.notes && touched.notes && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.notes}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
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
              color="indigo" 
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
                  {mode === 'edit' ? 'Update Player' : 'Create Player'}
                </>
              )}
            </IonButton>
          </div>
        </div>

        {/* Position Selection Action Sheet */}
        <IonActionSheet
          isOpen={positionActionSheetOpen}
          onDidDismiss={() => setPositionActionSheetOpen(false)}
          header="Select Position"
          buttons={[
            ...POSITIONS.map(position => ({
              text: `${position.name} (${position.code})`,
              handler: () => handlePositionSelect(position.code)
            })),
            {
              text: 'Cancel',
              role: 'cancel'
            }
          ]}
        />

        {/* Team Selection Action Sheet */}
        <IonActionSheet
          isOpen={teamActionSheetOpen}
          onDidDismiss={() => setTeamActionSheetOpen(false)}
          header="Select Team"
          buttons={[
            ...teams.map(team => ({
              text: team.name,
              handler: () => handleTeamSelect(team.name)
            })),
            {
              text: 'No Team',
              handler: () => handleTeamSelect('')
            },
            {
              text: 'Cancel',
              role: 'cancel'
            }
          ]}
        />

      </IonContent>
    </IonModal>
  );
};

export default CreatePlayerModal;