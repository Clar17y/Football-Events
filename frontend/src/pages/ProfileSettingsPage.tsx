import React, { useState, useEffect } from 'react';
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonList,
    IonListHeader,
    IonLabel,
    IonButtons,
    IonAlert
} from '@ionic/react';
import { football, personOutline, lockClosedOutline, trashOutline } from 'ionicons/icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { authApi } from '../services/api/authApi';
import UserProfile from '../components/UserProfile';
import ThemeToggle from '../components/ThemeToggle';
import './ProfileSettingsPage.css';

interface ProfileSettingsPageProps {
    onNavigate?: (page: string) => void;
}

const ProfileSettingsPage: React.FC<ProfileSettingsPageProps> = ({ onNavigate }) => {
    const { user, refreshUser, logout } = useAuth();
    const { showSuccess, showError } = useToast();

    // Profile form state
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [profileLoading, setProfileLoading] = useState(false);

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Delete account
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Load user data and settings
    useEffect(() => {
        if (user) {
            setFirstName(user.first_name || '');
            setLastName(user.last_name || '');
        }
        loadSettings();
    }, [user]);

    const loadSettings = async () => {
        try {
            const response = await authApi.getSettings();
            if (response.success && response.data) {
                setDisplayName(response.data.display_name || '');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const handleSaveProfile = async () => {
        setProfileLoading(true);
        try {
            const profileResponse = await authApi.updateProfile({
                firstName,
                lastName
            });

            const settingsResponse = await authApi.updateSettings({
                display_name: displayName || null
            });

            if (profileResponse.success && settingsResponse.success) {
                showSuccess('Profile updated successfully');
                refreshUser();
            } else {
                showError('Failed to update profile');
            }
        } catch (error: any) {
            let errorMessage = 'Failed to update profile';
            if (error.response?.details?.[0]?.message) {
                errorMessage = error.response.details[0].message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            showError(errorMessage);
        } finally {
            setProfileLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            showError('New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            showError('Password must be at least 8 characters');
            return;
        }

        setPasswordLoading(true);
        try {
            const response = await authApi.changePassword({
                currentPassword,
                newPassword
            });

            if (response.success) {
                showSuccess('Password changed successfully');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                showError('Failed to change password. Check your current password.');
            }
        } catch (error: any) {
            let errorMessage = 'Failed to change password. Check your current password.';
            if (error.response?.data?.details?.[0]?.message) {
                errorMessage = error.response.data.details[0].message;
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            showError(errorMessage);
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        try {
            const response = await authApi.deleteAccount();
            if (response.success) {
                showSuccess('Account deleted successfully');
                await logout();
                onNavigate?.('home');
            } else {
                showError('Failed to delete account');
            }
        } catch (error) {
            showError('Failed to delete account');
        } finally {
            setDeleteLoading(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="home-toolbar">
                    <IonTitle className="home-title">
                        <div
                            className="title-container"
                            onClick={() => onNavigate?.('home')}
                            style={{ cursor: 'pointer' }}
                            title="Back to Dashboard"
                        >
                            <IonIcon icon={football} className="title-icon" />
                            <span>MatchMaster</span>
                        </div>
                    </IonTitle>
                    <IonButtons slot="end" style={{ gap: 8 }}>
                        <ThemeToggle />
                        <UserProfile onNavigate={onNavigate} />
                    </IonButtons>
                </IonToolbar>
            </IonHeader>

            <IonContent className="profile-settings-content">
                <div className="settings-container">
                    <h1 className="page-title">Profile Settings</h1>

                    {/* Profile Information */}
                    <IonList className="settings-section">
                        <IonListHeader>
                            <IonIcon icon={personOutline} />
                            <IonLabel>Profile Information</IonLabel>
                        </IonListHeader>

                        <div className="form-group">
                            <label className="form-label">First Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Enter first name"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Last Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Enter last name"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Display Name (optional)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="What should we call you?"
                            />
                        </div>

                        <div className="section-actions">
                            <IonButton
                                expand="block"
                                onClick={handleSaveProfile}
                                disabled={profileLoading}
                            >
                                {profileLoading ? 'Saving...' : 'Save Profile'}
                            </IonButton>
                        </div>
                    </IonList>

                    {/* Change Password */}
                    <IonList className="settings-section">
                        <IonListHeader>
                            <IonIcon icon={lockClosedOutline} />
                            <IonLabel>Change Password</IonLabel>
                        </IonListHeader>

                        <div className="form-group">
                            <label className="form-label">Current Password</label>
                            <input
                                type="password"
                                className="form-input"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">New Password</label>
                            <input
                                type="password"
                                className="form-input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm New Password</label>
                            <input
                                type="password"
                                className="form-input"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                            />
                        </div>

                        <div className="section-actions">
                            <IonButton
                                expand="block"
                                onClick={handleChangePassword}
                                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                            >
                                {passwordLoading ? 'Changing...' : 'Change Password'}
                            </IonButton>
                        </div>
                    </IonList>

                    {/* Danger Zone */}
                    <IonList className="settings-section danger-zone">
                        <IonListHeader>
                            <IonIcon icon={trashOutline} color="danger" />
                            <IonLabel color="danger">Danger Zone</IonLabel>
                        </IonListHeader>

                        <div className="section-actions">
                            <IonButton
                                expand="block"
                                color="danger"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={deleteLoading}
                            >
                                Delete Account
                            </IonButton>
                        </div>
                    </IonList>
                </div>

                <IonAlert
                    isOpen={showDeleteConfirm}
                    onDidDismiss={() => setShowDeleteConfirm(false)}
                    header="Delete Account"
                    message="Are you sure you want to delete your account? This action cannot be undone."
                    buttons={[
                        {
                            text: 'Cancel',
                            role: 'cancel'
                        },
                        {
                            text: 'Delete',
                            role: 'destructive',
                            handler: handleDeleteAccount
                        }
                    ]}
                />
            </IonContent>
        </IonPage>
    );
};

export default ProfileSettingsPage;
