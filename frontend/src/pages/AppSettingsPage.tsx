import React, { useState, useEffect } from 'react';
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonButtons,
    IonInput
} from '@ionic/react';
import { football, colorPaletteOutline, timerOutline } from 'ionicons/icons';
import { Select, MenuItem, FormControl } from '@mui/material';
import UserProfile from '../components/UserProfile';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';
import './AppSettingsPage.css';

interface AppSettingsPageProps {
    onNavigate?: (page: string) => void;
}

const APP_SETTINGS_KEY = 'matchmaster_app_settings';

interface AppSettings {
    theme: 'light' | 'dark' | 'system';
    defaultDurationMins: number;
    defaultPeriodFormat: 'quarter' | 'half' | 'whole';
    defaultLineupSize: number;
    defaultCompetition: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'system',
    defaultDurationMins: 50,
    defaultPeriodFormat: 'quarter',
    defaultLineupSize: 7,
    defaultCompetition: ''
};

const AppSettingsPage: React.FC<AppSettingsPageProps> = ({ onNavigate }) => {
    const { setTheme } = useTheme();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

    // Load settings on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(APP_SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch (error) {
            console.error('Failed to load app settings:', error);
        }
    }, []);

    // Save settings whenever they change
    const saveSettings = (newSettings: AppSettings) => {
        setSettings(newSettings);
        try {
            localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (error) {
            console.error('Failed to save app settings:', error);
        }
    };

    const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
        saveSettings({ ...settings, theme: value });
        // Use ThemeContext to apply theme - keeps toggle button in sync
        setTheme(value);
    };

    const handleDurationChange = (value: number) => {
        saveSettings({ ...settings, defaultDurationMins: value });
    };

    const handlePeriodFormatChange = (value: 'quarter' | 'half' | 'whole') => {
        saveSettings({ ...settings, defaultPeriodFormat: value });
    };

    const handleLineupSizeChange = (value: number) => {
        saveSettings({ ...settings, defaultLineupSize: Math.min(11, Math.max(5, value)) });
    };

    const handleCompetitionChange = (value: string) => {
        saveSettings({ ...settings, defaultCompetition: value });
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

            <IonContent className="app-settings-content">
                <div className="settings-container">
                    <h1 className="page-title">App Settings</h1>

                    {/* Appearance */}
                    <IonList className="settings-section">
                        <IonListHeader>
                            <IonIcon icon={colorPaletteOutline} />
                            <IonLabel>Appearance</IonLabel>
                        </IonListHeader>

                        <IonItem>
                            <IonLabel>Theme</IonLabel>
                            <FormControl slot="end" size="small" sx={{ minWidth: 220 }}>
                                <Select
                                    value={settings.theme}
                                    onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark' | 'system')}
                                >
                                    <MenuItem value="light">Light</MenuItem>
                                    <MenuItem value="dark">Dark</MenuItem>
                                    <MenuItem value="system">System</MenuItem>
                                </Select>
                            </FormControl>
                        </IonItem>
                    </IonList>

                    {/* Match Defaults */}
                    <IonList className="settings-section">
                        <IonListHeader>
                            <IonIcon icon={timerOutline} />
                            <IonLabel>Default Match Settings</IonLabel>
                        </IonListHeader>
                        <p className="section-description">
                            These defaults are used when creating new matches. Team-specific defaults (if set) will override these.
                        </p>

                        <IonItem>
                            <IonLabel>Match Duration</IonLabel>
                            <FormControl slot="end" size="small" sx={{ minWidth: 220 }}>
                                <Select
                                    value={settings.defaultDurationMins}
                                    onChange={(e) => handleDurationChange(e.target.value as number)}
                                >
                                    <MenuItem value={20}>20 mins</MenuItem>
                                    <MenuItem value={24}>24 mins</MenuItem>
                                    <MenuItem value={30}>30 mins</MenuItem>
                                    <MenuItem value={40}>40 mins</MenuItem>
                                    <MenuItem value={48}>48 mins</MenuItem>
                                    <MenuItem value={50}>50 mins</MenuItem>
                                    <MenuItem value={60}>60 mins</MenuItem>
                                    <MenuItem value={70}>70 mins</MenuItem>
                                    <MenuItem value={80}>80 mins</MenuItem>
                                    <MenuItem value={90}>90 mins</MenuItem>
                                </Select>
                            </FormControl>
                        </IonItem>

                        <IonItem>
                            <IonLabel>Period Format</IonLabel>
                            <FormControl slot="end" size="small" sx={{ minWidth: 220 }}>
                                <Select
                                    value={settings.defaultPeriodFormat}
                                    onChange={(e) => handlePeriodFormatChange(e.target.value as 'quarter' | 'half' | 'whole')}
                                >
                                    <MenuItem value="quarter">Quarters (4 periods)</MenuItem>
                                    <MenuItem value="half">Halves (2 periods)</MenuItem>
                                    <MenuItem value="whole">Whole Match (1 period)</MenuItem>
                                </Select>
                            </FormControl>
                        </IonItem>

                        <IonItem>
                            <IonLabel>Default Lineup Size</IonLabel>
                            <FormControl slot="end" size="small" sx={{ minWidth: 220 }}>
                                <Select
                                    value={settings.defaultLineupSize}
                                    onChange={(e) => handleLineupSizeChange(e.target.value as number)}
                                >
                                    <MenuItem value={5}>5v5</MenuItem>
                                    <MenuItem value={7}>7v7</MenuItem>
                                    <MenuItem value={9}>9v9</MenuItem>
                                    <MenuItem value={11}>11v11</MenuItem>
                                </Select>
                            </FormControl>
                        </IonItem>

                        <IonItem>
                            <IonLabel>Default Competition</IonLabel>
                            <IonInput
                                className="settings-input"
                                slot="end"
                                value={settings.defaultCompetition}
                                onIonInput={(e) => handleCompetitionChange((e.detail.value ?? "").toString())}
                                placeholder="e.g., Academy League, Sunday Cup"
                            />
                        </IonItem>
                    </IonList>
                </div>
            </IonContent>
        </IonPage>
    );
};

export default AppSettingsPage;
