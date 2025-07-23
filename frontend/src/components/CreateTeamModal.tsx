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
import type { TeamCreateRequest } from '@shared/types';
import './CreateTeamModal.css';

interface CreateTeamModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
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

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ isOpen, onDidDismiss }) => {
  const { createTeam, loading } = useTeams();
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    homeKitPrimary: '',
    homeKitSecondary: '',
    awayKitPrimary: '',
    awayKitSecondary: '',
    logoUrl: ''
  });

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

    const teamData: TeamCreateRequest = {
      name: formData.name.trim(),
      homeKitPrimary: formData.homeKitPrimary || undefined,
      homeKitSecondary: formData.homeKitSecondary || undefined,
      awayKitPrimary: formData.awayKitPrimary || undefined,
      awayKitSecondary: formData.awayKitSecondary || undefined,
      logoUrl: formData.logoUrl || undefined
    };

    const result = await createTeam(teamData);
    
    if (result) {
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
      
      // Refresh the teams list to show the new team
      // This is handled automatically by the useTeams hook's optimistic updates
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
    <div className="color-preview">
      <div 
        className="color-preview-dot"
        style={{ 
          backgroundColor: color || '#f0f0f0',
          border: color ? '2px solid var(--grassroots-surface-variant)' : '2px dashed var(--grassroots-text-tertiary)'
        }}
        onClick={() => handleColorPickerOpen(field)}
        title={`Click to choose ${label.toLowerCase()} color`}
      />
      <span className="color-preview-label">{label}</span>
    </div>
  );

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDidDismiss} className="create-team-modal">
      <IonHeader>
        <IonToolbar color="secondary">
          <IonTitle>Create New Team</IonTitle>
          <IonButton 
            fill="clear" 
            slot="end" 
            onClick={handleCancel}
            disabled={loading}
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="create-team-content">
        <div className="form-container">
          {/* Team Name Section */}
          <IonCard className="form-section">
            <IonCardHeader>
              <IonCardTitle>
                <IonIcon icon={shirt} className="section-icon" />
                Team Information
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`form-item ${errors.name && touched.name ? 'error' : ''}`}>
                      <IonLabel position="stacked">Team Name *</IonLabel>
                      <IonInput
                        value={formData.name}
                        onIonInput={(e) => handleInputChange('name', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('name')}
                        placeholder="Enter team name"
                        maxlength={100}
                        disabled={loading}
                      />
                    </IonItem>
                    {errors.name && touched.name && (
                      <IonText color="danger" className="error-text">
                        {errors.name}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Home Kit Colors */}
          <IonCard className="form-section">
            <IonCardHeader>
              <IonCardTitle>
                <IonIcon icon={colorPalette} className="section-icon" />
                Home Kit Colors
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    <IonItem className={`form-item ${errors.homeKitPrimary && touched.homeKitPrimary ? 'error' : ''}`}>
                      <IonLabel position="stacked">Primary Color</IonLabel>
                      <div className="color-input-row">
                        <IonInput
                          value={formData.homeKitPrimary}
                          onIonInput={(e) => handleInputChange('homeKitPrimary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('homeKitPrimary')}
                          placeholder="#FF0000"
                          disabled={loading}
                          className="color-input"
                        />
                        {renderColorPreview(formData.homeKitPrimary, 'Pick', 'homeKitPrimary')}
                      </div>
                    </IonItem>
                    {errors.homeKitPrimary && touched.homeKitPrimary && (
                      <IonText color="danger" className="error-text">
                        {errors.homeKitPrimary}
                      </IonText>
                    )}
                  </IonCol>
                  <IonCol size="12" sizeMd="6">
                    <IonItem className={`form-item ${errors.homeKitSecondary && touched.homeKitSecondary ? 'error' : ''}`}>
                      <IonLabel position="stacked">Secondary Color</IonLabel>
                      <div className="color-input-row">
                        <IonInput
                          value={formData.homeKitSecondary}
                          onIonInput={(e) => handleInputChange('homeKitSecondary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('homeKitSecondary')}
                          placeholder="#FFFFFF"
                          disabled={loading}
                          className="color-input"
                        />
                        {renderColorPreview(formData.homeKitSecondary, 'Pick', 'homeKitSecondary')}
                      </div>
                    </IonItem>
                    {errors.homeKitSecondary && touched.homeKitSecondary && (
                      <IonText color="danger" className="error-text">
                        {errors.homeKitSecondary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Away Kit Colors */}
          <IonCard className="form-section">
            <IonCardHeader>
              <IonCardTitle>
                <IonIcon icon={colorPalette} className="section-icon" />
                Away Kit Colors
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonGrid>
                <IonRow>
                  <IonCol size="12" sizeMd="6">
                    <IonItem className={`form-item ${errors.awayKitPrimary && touched.awayKitPrimary ? 'error' : ''}`}>
                      <IonLabel position="stacked">Primary Color</IonLabel>
                      <div className="color-input-row">
                        <IonInput
                          value={formData.awayKitPrimary}
                          onIonInput={(e) => handleInputChange('awayKitPrimary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('awayKitPrimary')}
                          placeholder="#0000FF"
                          disabled={loading}
                          className="color-input"
                        />
                        {renderColorPreview(formData.awayKitPrimary, 'Pick', 'awayKitPrimary')}
                      </div>
                    </IonItem>
                    {errors.awayKitPrimary && touched.awayKitPrimary && (
                      <IonText color="danger" className="error-text">
                        {errors.awayKitPrimary}
                      </IonText>
                    )}
                  </IonCol>
                  <IonCol size="12" sizeMd="6">
                    <IonItem className={`form-item ${errors.awayKitSecondary && touched.awayKitSecondary ? 'error' : ''}`}>
                      <IonLabel position="stacked">Secondary Color</IonLabel>
                      <div className="color-input-row">
                        <IonInput
                          value={formData.awayKitSecondary}
                          onIonInput={(e) => handleInputChange('awayKitSecondary', e.detail.value!)}
                          onIonBlur={() => handleInputBlur('awayKitSecondary')}
                          placeholder="#FFFFFF"
                          disabled={loading}
                          className="color-input"
                        />
                        {renderColorPreview(formData.awayKitSecondary, 'Pick', 'awayKitSecondary')}
                      </div>
                    </IonItem>
                    {errors.awayKitSecondary && touched.awayKitSecondary && (
                      <IonText color="danger" className="error-text">
                        {errors.awayKitSecondary}
                      </IonText>
                    )}
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Team Logo */}
          <IonCard className="form-section">
            <IonCardHeader>
              <IonCardTitle>
                <IonIcon icon={image} className="section-icon" />
                Team Logo (Optional)
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <IonItem className={`form-item ${errors.logoUrl && touched.logoUrl ? 'error' : ''}`}>
                      <IonLabel position="stacked">Logo URL</IonLabel>
                      <IonInput
                        value={formData.logoUrl}
                        onIonInput={(e) => handleInputChange('logoUrl', e.detail.value!)}
                        onIonBlur={() => handleInputBlur('logoUrl')}
                        placeholder="https://example.com/logo.png"
                        disabled={loading}
                      />
                    </IonItem>
                    {errors.logoUrl && touched.logoUrl && (
                      <IonText color="danger" className="error-text">
                        {errors.logoUrl}
                      </IonText>
                    )}
                    {formData.logoUrl && !errors.logoUrl && (
                      <div className="logo-preview">
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
          <div className="form-actions">
            <IonButton 
              expand="block" 
              fill="clear" 
              onClick={handleCancel}
              disabled={loading}
              className="cancel-button"
            >
              Cancel
            </IonButton>
            <IonButton 
              expand="block" 
              color="secondary" 
              onClick={handleSubmit}
              disabled={loading || !formData.name.trim()}
              className="submit-button"
            >
              {loading ? (
                <>
                  <IonSpinner name="crescent" />
                  <span style={{ marginLeft: '8px' }}>Creating...</span>
                </>
              ) : (
                <>
                  <IonIcon icon={checkmark} slot="start" />
                  Create Team
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