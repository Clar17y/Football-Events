/**
 * Create Team Modal Component
 * Beautiful form for creating new teams with color pickers and validation
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
  IonSpinner
} from '@ionic/react';
import {
  close,
  checkmark,
  colorPalette,
  image,
  shirt
} from 'ionicons/icons';
import { useTeams } from '../hooks/useTeams';
import ColorPickerModal from './ColorPickerModal';
import type { Team, TeamCreateRequest } from '@shared/types';
import styles from './FormSection.module.css';

interface CreateTeamModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  editTeam?: Team | null;
  mode?: 'create' | 'edit';
  onCreated?: (team: Team) => void;
}

interface FormData {
  name: string;
  homeKitPrimary: string;
  homeKitSecondary: string;
  awayKitPrimary: string;
  awayKitSecondary: string;
  logoUrl: string;
}

interface FormErrors {
  name?: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
}

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ 
  isOpen, 
  onDidDismiss, 
  editTeam = null, 
  mode = 'create',
  onCreated
}) => {
  const { createTeam, updateTeam, loading } = useTeams();
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    homeKitPrimary: '',
    homeKitSecondary: '',
    awayKitPrimary: '',
    awayKitSecondary: '',
    logoUrl: ''
  });

  // Initialize form data when editing
  React.useEffect(() => {
    if (mode === 'edit' && editTeam) {
      setFormData({
        name: editTeam.name || '',
        homeKitPrimary: editTeam.homeKitPrimary || '',
        homeKitSecondary: editTeam.homeKitSecondary || '',
        awayKitPrimary: editTeam.awayKitPrimary || '',
        awayKitSecondary: editTeam.awayKitSecondary || '',
        logoUrl: editTeam.logoUrl || ''
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        name: '',
        homeKitPrimary: '',
        homeKitSecondary: '',
        awayKitPrimary: '',
        awayKitSecondary: '',
        logoUrl: ''
      });
    }
  }, [mode, editTeam, isOpen]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [activeColorField, setActiveColorField] = useState<keyof FormData | null>(null);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Team name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Team name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Team name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Team name must be less than 100 characters';
    }

    // Color validation (hex format)
    const hexColorRegex = /^#[0-9A-F]{6}$/i;
    
    if (formData.homeKitPrimary && !hexColorRegex.test(formData.homeKitPrimary)) {
      newErrors.homeKitPrimary = 'Must be a valid hex color (e.g., #FF0000)';
    }
    
    if (formData.homeKitSecondary && !hexColorRegex.test(formData.homeKitSecondary)) {
      newErrors.homeKitSecondary = 'Must be a valid hex color (e.g., #FFFFFF)';
    }
    
    if (formData.awayKitPrimary && !hexColorRegex.test(formData.awayKitPrimary)) {
      newErrors.awayKitPrimary = 'Must be a valid hex color (e.g., #0000FF)';
    }
    
    if (formData.awayKitSecondary && !hexColorRegex.test(formData.awayKitSecondary)) {
      newErrors.awayKitSecondary = 'Must be a valid hex color (e.g., #FFFFFF)';
    }

    // Logo URL validation
    if (formData.logoUrl) {
      try {
        new URL(formData.logoUrl);
      } catch {
        newErrors.logoUrl = 'Must be a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
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

    const teamData = {
      name: formData.name.trim(),
      homeKitPrimary: formData.homeKitPrimary || undefined,
      homeKitSecondary: formData.homeKitSecondary || undefined,
      awayKitPrimary: formData.awayKitPrimary || undefined,
      awayKitSecondary: formData.awayKitSecondary || undefined,
      logoUrl: formData.logoUrl || undefined
    };

    let result;
    if (mode === 'edit' && editTeam) {
      console.log('Updating team with ID:', editTeam.id, 'and data:', teamData);
      result = await updateTeam(editTeam.id, teamData);
    } else {
      console.log('Creating new team with data:', teamData);
      result = await createTeam(teamData);
    }
    
    if (result) {
      // Notify parent on create for immediate UI updates
      if (mode === 'create' && onCreated) {
        try {
          onCreated(result as Team);
        } catch (e) {
          // no-op; parent handler optional
        }
      }

      // Reset form and close modal
      setFormData({
        name: '',
        homeKitPrimary: '',
        homeKitSecondary: '',
        awayKitPrimary: '',
        awayKitSecondary: '',
        logoUrl: ''
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
      homeKitPrimary: '',
      homeKitSecondary: '',
      awayKitPrimary: '',
      awayKitSecondary: '',
      logoUrl: ''
    });
    setErrors({});
    setTouched({});
    onDidDismiss();
  };

  const handleColorPickerOpen = (field: keyof FormData) => {
    setActiveColorField(field);
    setColorPickerOpen(true);
  };

  const handleColorSelect = (color: string) => {
    if (activeColorField) {
      handleInputChange(activeColorField, color);
    }
    setColorPickerOpen(false);
    setActiveColorField(null);
  };

  const getColorPickerTitle = () => {
    if (!activeColorField) return 'Select Color';
    
    const fieldLabels: Record<string, string> = {
      homeKitPrimary: 'Home Kit Primary Color',
      homeKitSecondary: 'Home Kit Secondary Color',
      awayKitPrimary: 'Away Kit Primary Color',
      awayKitSecondary: 'Away Kit Secondary Color'
    };
    
    return fieldLabels[activeColorField] || 'Select Color';
  };

  const renderColorPreview = (color: string, label: string, field: keyof FormData) => (
    <div className={styles.colorPreview}>
      <div 
        className={styles.colorPreviewDot}
        style={{ 
          backgroundColor: color || '#f0f0f0',
          border: color ? '2px solid var(--theme-surface-variant, var(--grassroots-surface-variant))' : '2px dashed var(--theme-on-surface-variant, var(--grassroots-text-tertiary))'
        }}
        onClick={() => handleColorPickerOpen(field)}
        title={`Click to choose ${label.toLowerCase()} color`}
      />
      <span className={styles.colorPreviewLabel}>{label}</span>
    </div>
  );

  return (
    <IonModal 
      isOpen={isOpen} 
      onDidDismiss={onDidDismiss} 
      className={styles.modal}
      data-theme="team"
    >
      <IonHeader>
        <IonToolbar color="teal">
          <IonTitle>{mode === 'edit' ? 'Edit Team' : 'Create New Team'}</IonTitle>
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
          {/* Team Name Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={shirt} className={styles.sectionIcon} />
                Team Information
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.name && touched.name ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Team Name *</IonLabel>
                      <IonInput
                        value={formData.name}
                        onIonInput={(e) => handleInputChange('name', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('name')}
                        placeholder="Enter team name"
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

          {/* Home Kit Colors */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={colorPalette} className={styles.sectionIcon} />
                Home Kit Colors
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.homeKitPrimary && touched.homeKitPrimary ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Primary Color</IonLabel>
                      <div className={styles.colorInputRow}>
                        <IonInput
                          value={formData.homeKitPrimary}
                          onIonInput={(e) => handleInputChange('homeKitPrimary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('homeKitPrimary')}
                          placeholder="#FF0000"
                          disabled={loading}
                          className={styles.formInput}
                        />
                        {renderColorPreview(formData.homeKitPrimary, 'Pick', 'homeKitPrimary')}
                      </div>
                    </IonItem>
                    {errors.homeKitPrimary && touched.homeKitPrimary && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.homeKitPrimary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.homeKitSecondary && touched.homeKitSecondary ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Secondary Color</IonLabel>
                      <div className={styles.colorInputRow}>
                        <IonInput
                          value={formData.homeKitSecondary}
                          onIonInput={(e) => handleInputChange('homeKitSecondary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('homeKitSecondary')}
                          placeholder="#FFFFFF"
                          disabled={loading}
                          className={styles.formInput}
                        />
                        {renderColorPreview(formData.homeKitSecondary, 'Pick', 'homeKitSecondary')}
                      </div>
                    </IonItem>
                    {errors.homeKitSecondary && touched.homeKitSecondary && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.homeKitSecondary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Away Kit Colors */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={colorPalette} className={styles.sectionIcon} />
                Away Kit Colors
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.awayKitPrimary && touched.awayKitPrimary ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Primary Color</IonLabel>
                      <div className={styles.colorInputRow}>
                        <IonInput
                          value={formData.awayKitPrimary}
                          onIonInput={(e) => handleInputChange('awayKitPrimary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('awayKitPrimary')}
                          placeholder="#0000FF"
                          disabled={loading}
                          className={styles.formInput}
                        />
                        {renderColorPreview(formData.awayKitPrimary, 'Pick', 'awayKitPrimary')}
                      </div>
                    </IonItem>
                    {errors.awayKitPrimary && touched.awayKitPrimary && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.awayKitPrimary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.awayKitSecondary && touched.awayKitSecondary ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Secondary Color</IonLabel>
                      <div className={styles.colorInputRow}>
                        <IonInput
                          value={formData.awayKitSecondary}
                          onIonInput={(e) => handleInputChange('awayKitSecondary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('awayKitSecondary')}
                          placeholder="#FFFFFF"
                          disabled={loading}
                          className={styles.formInput}
                        />
                        {renderColorPreview(formData.awayKitSecondary, 'Pick', 'awayKitSecondary')}
                      </div>
                    </IonItem>
                    {errors.awayKitSecondary && touched.awayKitSecondary && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.awayKitSecondary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Team Logo */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={image} className={styles.sectionIcon} />
                Team Logo (Optional)
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`${styles.formItem} ${errors.logoUrl && touched.logoUrl ? styles.error : ''}`}>
                      <IonLabel position="stacked" className={styles.formLabel}>Logo URL</IonLabel>
                      <IonInput
                        value={formData.logoUrl}
                        onIonInput={(e) => handleInputChange('logoUrl', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('logoUrl')}
                        placeholder="https://example.com/logo.png"
                        disabled={loading}
                        className={styles.formInput}
                      />
                    </IonItem>
                    {errors.logoUrl && touched.logoUrl && (
                      <IonText color="danger" className={styles.errorText}>
                        {errors.logoUrl}
                      </IonText>
                    )}
                    {formData.logoUrl && !errors.logoUrl && (
                      <div className={styles.logoPreview}>
                        <img 
                          src={formData.logoUrl} 
                          alt="Team logo preview" 
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      </div>
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
              color="teal" 
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
                  {mode === 'edit' ? 'Update Team' : 'Create Team'}
                </>
              )}
            </IonButton>
          </div>
        </div>

        {/* Beautiful Color Picker Modal */}
        <ColorPickerModal
          isOpen={colorPickerOpen}
          onDidDismiss={() => {
            setColorPickerOpen(false);
            setActiveColorField(null);
          }}
          onColorSelect={handleColorSelect}
          initialColor={activeColorField ? formData[activeColorField] || '#3182ce' : '#3182ce'}
          title={getColorPickerTitle()}
        />
      </IonContent>
    </IonModal>
  );
};

export default CreateTeamModal;