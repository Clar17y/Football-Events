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
import { personAddOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';
// useHistory removed - using state-based navigation
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface LoginPageProps {
  onNavigate?: (page: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  const { login } = useAuth();
  const { showSuccess } = useToast();
  
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    console.log('Login attempt started', { email, password: '***' });
    
    if (!validateForm()) {
      console.log('Validation failed');
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      console.log('Calling login API...');
      const result = await login(email.trim(), password);
      console.log('Login result:', result);
      
      if (result.success) {
        showSuccess('Welcome back! Login successful.');
        navigate('home');
      } else {
        setErrors({ general: result.error || 'Login failed. Please try again.' });
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const goToRegister = () => {
    navigate('register');
  };

  return (
    <IonPage>
      <PageHeader onNavigate={navigate} />
      
      <IonContent className="home-content">
        {/* Hero Section */}
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">Welcome Back!</h1>
            <p className="hero-subtitle">
              Sign in to access your teams, players, and match data
            </p>
          </div>
        </div>

        {/* Login Form Section */}
        <div className="navigation-section">
          <IonCard className="nav-card">
            <IonCardHeader>
              <IonCardTitle style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center' }}>Sign In</IonCardTitle>
            </IonCardHeader>
            
            <IonCardContent>
              <form onSubmit={handleLogin}>
                <IonItem className={errors.email ? 'ion-invalid' : ''}>
                  <IonLabel position="stacked" className="grassroots-form-label">Email</IonLabel>
                  <IonInput
                    type="email"
                    value={email}
                    onIonInput={(e) => setEmail(e.detail.value!)}
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
                    value={password}
                    onIonInput={(e) => setPassword(e.detail.value!)}
                    placeholder="Enter your password"
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
                      handleLogin();
                    }}
                  >
                    {isLoading ? (
                      <>
                        <IonSpinner name="crescent" />
                        <span style={{ marginLeft: '8px' }}>Signing In...</span>
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </IonButton>
                </div>

                <div className="ion-text-center ion-padding-top">
                  <IonText color="medium">
                    <p>
                      Don't have an account?{' '}
                      <IonButton
                        fill="clear"
                        size="small"
                        onClick={goToRegister}
                        disabled={isLoading}
                      >
                        <IonIcon icon={personAddOutline} slot="start" />
                        Sign Up
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

export default LoginPage;