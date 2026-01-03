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
  IonTextarea
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
import { authApi } from '../services/api/authApi';
import { canAddPlayer } from '../utils/quotas';
import TeamSelectionModal from './TeamSelectionModal';
import PositionSelectionModal from './PositionSelectionModal';
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
  currentTeams: string[]; // Changed to array for multiple teams
}

interface FormErrors {
  name?: string;
  squadNumber?: string;
  preferredPosition?: string;
  dateOfBirth?: string;
  notes?: string;
  currentTeams?: string;
}


const CreatePlayerModal: React.FC<CreatePlayerModalProps> = ({ 
  isOpen, 
  onDidDismiss, 
  editPlayer = null, 
  mode = 'create' 
}) => {
  const { createPlayer, updatePlayer, loading } = usePlayers();
  const { teams, loadTeams } = useTeams();
  const [submitting, setSubmitting] = useState(false); // Guard against double submissions
  const submittingRef = React.useRef(false); // Synchronous guard (refs update immediately)
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    squadNumber: '',
    preferredPosition: '',
    dateOfBirth: null,
    notes: '',
    currentTeams: []
  });

  // Initialize form data when editing
  React.useEffect(() => {
    if (mode === 'edit' && editPlayer) {
      console.log('[CreatePlayerModal] Editing player:', editPlayer);
      console.log('[CreatePlayerModal] editPlayer.currentTeam:', editPlayer.currentTeam);
      
      // Split currentTeam string back into array
      const currentTeamsArray = editPlayer.currentTeam 
        ? editPlayer.currentTeam.split(', ').filter(team => team.trim() !== '')
        : [];
      
      console.log('[CreatePlayerModal] Converted to teams array:', currentTeamsArray);
      
      setFormData({
        name: editPlayer.name || '',
        squadNumber: editPlayer.squadNumber?.toString() || '',
        preferredPosition: editPlayer.preferredPosition || '',
        dateOfBirth: editPlayer.dateOfBirth ? dayjs(editPlayer.dateOfBirth) : null,
        notes: editPlayer.notes || '',
        currentTeams: currentTeamsArray
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        name: '',
        squadNumber: '',
        preferredPosition: '',
        dateOfBirth: null,
        notes: '',
        currentTeams: []
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
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

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

    // Position validation - removed since PositionSelectionModal handles validation

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

  const handleInputChange = (field: keyof FormData, value: string | string[] | Dayjs | null) => {
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
    // Guard against double submissions using ref (synchronous check)
    if (submittingRef.current) {
      console.log('[CreatePlayerModal] Already submitting (ref), ignoring duplicate call');
      return;
    }
    submittingRef.current = true; // Set immediately (synchronous)
    
    // Mark all fields as touched
    const allFields = Object.keys(formData) as (keyof FormData)[];
    setTouched(allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}));

    if (!validateForm()) {
      submittingRef.current = false;
      return;
    }
    
    setSubmitting(true);

    // Find team IDs from team names
    const selectedTeams = teams.filter(team => formData.currentTeams.includes(team.name));

    // Guest quota check for new players with team assignment
    if (mode === 'create' && !authApi.isAuthenticated() && selectedTeams.length > 0) {
      const quota = await canAddPlayer(selectedTeams[0].id);
      if (!quota.ok) {
        setErrors(prev => ({ ...prev, currentTeams: quota.reason }));
        return;
      }
    }

    const playerData: PlayerCreateRequest & { teamIds?: string[] } = {
      name: formData.name.trim(),
      squadNumber: formData.squadNumber ? parseInt(formData.squadNumber, 10) : undefined,
      preferredPosition: formData.preferredPosition || undefined,
      dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth.format('YYYY-MM-DD') : undefined,
      notes: formData.notes || undefined,
      currentTeam: formData.currentTeams.join(', ') || undefined, // Join team names for backward compatibility
      teamIds: selectedTeams.map(team => team.id) // Add team IDs array
    };

    let result;
    try {
      if (mode === 'edit' && editPlayer) {
        console.log('Updating player with ID:', editPlayer.id, 'and data:', playerData);
        // For updates, include teamIds to handle team changes
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
          dateOfBirth: null,
          notes: '',
          currentTeams: []
        });
        setErrors({});
        setTouched({});
        onDidDismiss();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
      currentTeams: []
    });
    setErrors({});
    setTouched({});
    onDidDismiss();
  };

  const handlePositionSelect = (position: string) => {
    handleInputChange('preferredPosition', position);
    setPositionModalOpen(false);
  };

  const handleTeamSelect = (teamName: string) => {
    if (teamName === '') {
      // "No Team" selected - clear all teams
      handleInputChange('currentTeams', []);
    } else {
      // Toggle team selection
      const currentTeams = formData.currentTeams;
      const isSelected = currentTeams.includes(teamName);
      
      if (isSelected) {
        // Remove team from selection
        handleInputChange('currentTeams', currentTeams.filter(team => team !== teamName));
      } else {
        // Add team to selection
        handleInputChange('currentTeams', [...currentTeams, teamName]);
      }
    }
    // Don't close modal immediately - allow multiple selections
  };

  const getPositionDisplayName = (code: string) => {
    // Simple display format - the PositionSelectionModal handles the full position data
    return code ? `${code}` : '';
  };

  const getTeamsDisplayText = () => {
    const teamCount = formData.currentTeams.length;
    if (teamCount === 0) {
      return '';
    } else if (teamCount === 1) {
      return formData.currentTeams[0];
    } else {
      return `${teamCount} teams`;
    }
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
                Position & Team(s)
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    <IonItem 
                      className={`${styles.formItem} ${errors.preferredPosition && touched.preferredPosition ? styles.error : ''}`}
                      button
                      onClick={() => setPositionModalOpen(true)}
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
                      className={`${styles.formItem} ${errors.currentTeams && touched.currentTeams ? styles.error : ''}`}
                      button
                      onClick={() => setTeamModalOpen(true)}
                      disabled={loading}
                    >
                      <IonLabel position="stacked" className={styles.formLabel}>Current Team(s)</IonLabel>
                      <IonInput
                        value={getTeamsDisplayText()}
                        placeholder="Select team(s)"
                        readonly
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.currentTeams && touched.currentTeams && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.currentTeams}
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
              disabled={loading || submitting || !formData.name.trim()}
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

        {/* Position Selection Modal */}
        <PositionSelectionModal
          isOpen={positionModalOpen}
          onDidDismiss={() => setPositionModalOpen(false)}
          onPositionSelect={handlePositionSelect}
          selectedPosition={formData.preferredPosition}
          title="Select Position"
        />

        {/* Team Selection Modal */}
        <TeamSelectionModal
          isOpen={teamModalOpen}
          onDidDismiss={() => setTeamModalOpen(false)}
          onTeamSelect={handleTeamSelect}
          selectedTeams={formData.currentTeams}
          title="Select Team(s)"
          allowMultiple={true}
          hideNoTeamOption={true}
        />

      </IonContent>
    </IonModal>
  );
};

export default CreatePlayerModal;
