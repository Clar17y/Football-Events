import React, { useState } from 'react';
import {
  IonContent,
  IonPage,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonText,
  IonSpinner,
  IonIcon
} from '@ionic/react';
import PageHeader from '../components/PageHeader';
import { eyeOutline, eyeOffOutline, logInOutline } from 'ionicons/icons';
// useHistory removed - using state-based navigation
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface RegisterPageProps {
  onNavigate?: (page: string) => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  const { register } = useAuth();
  const { showSuccess } = useToast();
  
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
    }

    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    console.log('Registration attempt started', { formData: { ...formData, password: '***', confirmPassword: '***' } });
    
    if (!validateForm()) {
      console.log('Validation failed');
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      console.log('Calling register API...');
      const result = await register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });
      console.log('Registration result:', result);
      
      if (result.success) {
        showSuccess('Account created successfully! Welcome to MatchMaster.');
        navigate('home');
      } else {
        setErrors({ general: result.error || 'Registration failed. Please try again.' });
      }
    } catch (error) {
      console.error('Registration error:', error);
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field-specific error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const goToLogin = () => {
    navigate('login');
  };

  return (
    <IonPage>
      <PageHeader onNavigate={navigate} />
      
      <IonContent className="home-content">
        {/* Hero Section */}
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">Join MatchMaster!</h1>
            <p className="hero-subtitle">
              Create your account to start managing teams and tracking player progress
            </p>
          </div>
        </div>

        {/* Register Form Section */}
        <div className="navigation-section">
          <IonCard className="nav-card">
            <IonCardHeader>
              <IonCardTitle style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center' }}>Create Account</IonCardTitle>
            </IonCardHeader>
            
            <IonCardContent>
              <form onSubmit={handleRegister}>
                <IonItem className={errors.firstName ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">First Name</IonLabel>
                  <IonInput
                    type="text"
                    value={formData.firstName}
                    onIonInput={(e) => updateFormData('firstName', e.detail.value!)}
                    placeholder="Enter your first name"
                    required
                    disabled={isLoading}
                  />
                </IonItem>
                {errors.firstName && (
                  <IonText className="grassroots-form-error ion-padding-start">
                    {errors.firstName}
                  </IonText>
                )}

                <IonItem className={errors.lastName ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">Last Name</IonLabel>
                  <IonInput
                    type="text"
                    value={formData.lastName}
                    onIonInput={(e) => updateFormData('lastName', e.detail.value!)}
                    placeholder="Enter your last name"
                    required
                    disabled={isLoading}
                  />
                </IonItem>
                {errors.lastName && (
                  <IonText className="grassroots-form-error ion-padding-start">
                    {errors.lastName}
                  </IonText>
                )}

                <IonItem className={errors.email ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">Email</IonLabel>
                  <IonInput
                    type="email"
                    value={formData.email}
                    onIonInput={(e) => updateFormData('email', e.detail.value!)}
                    placeholder="Enter your email"
                    required
                    disabled={isLoading}
                  />
                </IonItem>
                {errors.email && (
                  <IonText className="grassroots-form-error ion-padding-start">
                    {errors.email}
                  </IonText>
                )}

                <IonItem className={errors.password ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">Password</IonLabel>
                  <IonInput
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onIonInput={(e) => updateFormData('password', e.detail.value!)}
                    placeholder="Create a strong password"
                    required
                    disabled={isLoading}
                  />
                  <IonButton
                    fill="clear"
                    slot="end"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                  </IonButton>
                </IonItem>
                {errors.password && (
                  <IonText className="grassroots-form-error ion-padding-start">
                    {errors.password}
                  </IonText>
                )}

                <IonItem className={errors.confirmPassword ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">Confirm Password</IonLabel>
                  <IonInput
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onIonInput={(e) => updateFormData('confirmPassword', e.detail.value!)}
                    placeholder="Confirm your password"
                    required
                    disabled={isLoading}
                  />
                  <IonButton
                    fill="clear"
                    slot="end"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                  >
                    <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                  </IonButton>
                </IonItem>
                {errors.confirmPassword && (
                  <IonText className="grassroots-form-error ion-padding-start">
                    {errors.confirmPassword}
                  </IonText>
                )}

                {errors.general && (
                  <IonText color="danger" className="ion-text-center ion-padding">
                    <p>{errors.general}</p>
                  </IonText>
                )}

                <div className="ion-padding-top">
                  <IonButton
                    expand="block"
                    type="submit"
                    disabled={isLoading}
                    onClick={(e) => {
                      e.preventDefault();
                      handleRegister();
                    }}
                  >
                    {isLoading ? (
                      <>
                        <IonSpinner name="crescent" />
                        <span style={{ marginLeft: '8px' }}>Creating Account...</span>
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </IonButton>
                </div>

                <div className="ion-text-center ion-padding-top">
                  <IonText color="medium">
                    <p>
                      Already have an account?{' '}
                      <IonButton
                        fill="clear"
                        size="small"
                        onClick={goToLogin}
                        disabled={isLoading}
                      >
                        <IonIcon icon={logInOutline} slot="start" />
                        Sign In
                      </IonButton>
                    </p>
                  </IonText>
                </div>
              </form>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default RegisterPage;