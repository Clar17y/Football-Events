/**
 * Developer Settings Page
 * 
 * Hidden page for development/testing purposes.
 * Only accessible in development builds.
 * 
 * Supports two seeding modes:
 * - IndexedDB (Guest Mode): Local-only seeding for testing guest quotas
 * - PostgreSQL (Authenticated Mode): Server-side seeding for testing authenticated flows
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
    IonIcon,
    IonProgressBar,
    IonAlert,
    IonBackButton,
    IonButtons,
    IonBadge,
} from '@ionic/react';
import {
    downloadOutline,
    trashOutline,
    refreshOutline,
    checkmarkCircleOutline,
    alertCircleOutline,
    footballOutline,
    cloudUploadOutline,
    cloudDownloadOutline,
    personOutline,
    serverOutline,
    phonePortraitOutline,
} from 'ionicons/icons';
import {
    seedPremierLeagueData,
    clearAllData,
    getDataCounts,
    type SeedingProgress,
    type SeedingStats,
} from '../db/seed/seedTestData';
import './DevSettingsPage.css';

// API base URL for dev endpoints
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface TestUser {
    email: string;
    password: string;
    teamName: string;
}

interface PostgresStats {
    users: number;
    seasons: number;
    teams: number;
    players: number;
    playerTeams: number;
    matches: number;
    events: number;
}

const DevSettingsPage: React.FC = () => {
    // IndexedDB seeding state
    const [isSeeding, setIsSeeding] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [progress, setProgress] = useState<SeedingProgress | null>(null);
    const [stats, setStats] = useState<SeedingStats | null>(null);
    const [showClearAlert, setShowClearAlert] = useState(false);

    // PostgreSQL seeding state
    const [isSeedingPostgres, setIsSeedingPostgres] = useState(false);
    const [isClearingPostgres, setIsClearingPostgres] = useState(false);
    const [showClearPostgresAlert, setShowClearPostgresAlert] = useState(false);
    const [testUsers, setTestUsers] = useState<TestUser[]>([]);
    const [postgresStats, setPostgresStats] = useState<PostgresStats | null>(null);

    // Common state
    const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

    const loadStats = useCallback(async () => {
        try {
            const counts = await getDataCounts();
            setStats(counts);
        } catch (error) {
            console.error('Failed to load IndexedDB stats:', error);
        }
    }, []);

    const loadPostgresUsers = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/v1/dev/users`);
            if (response.ok) {
                const data = await response.json();
                setTestUsers(data.users.map((u: { email: string; teamName: string }) => ({
                    ...u,
                    password: data.password || 'password'
                })));
            }
        } catch (error) {
            console.error('Failed to load PostgreSQL users:', error);
        }
    }, []);

    useEffect(() => {
        loadStats();
        loadPostgresUsers();
    }, [loadStats, loadPostgresUsers]);

    // IndexedDB handlers
    const handleSeedIndexedDB = async () => {
        setIsSeeding(true);
        setProgress({ stage: 'idle', current: 0, total: 0, message: 'Starting...' });
        setLastResult(null);

        try {
            const result = await seedPremierLeagueData((p) => setProgress(p));
            setLastResult({
                success: true,
                message: `IndexedDB: Seeded ${result.teams} teams, ${result.players} players, ${result.matches} matches, ${result.events} events!`
            });
            await loadStats();
        } catch (error) {
            setLastResult({
                success: false,
                message: `IndexedDB seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsSeeding(false);
            setProgress(null);
        }
    };

    const handleClearIndexedDB = async () => {
        setIsClearing(true);
        setLastResult(null);

        try {
            await clearAllData();
            setLastResult({ success: true, message: 'IndexedDB: All data cleared successfully!' });
            await loadStats();
        } catch (error) {
            setLastResult({
                success: false,
                message: `IndexedDB clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsClearing(false);
            setShowClearAlert(false);
        }
    };

    // PostgreSQL handlers
    const handleSeedPostgres = async () => {
        setIsSeedingPostgres(true);
        setLastResult(null);

        try {
            const response = await fetch(`${API_BASE}/api/v1/dev/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();

            if (data.success) {
                setTestUsers(data.users || []);
                setPostgresStats(data.stats);
                setLastResult({
                    success: true,
                    message: `PostgreSQL: Created ${data.stats.users} users, ${data.stats.teams} teams, ${data.stats.matches} matches!`
                });
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            setLastResult({
                success: false,
                message: `PostgreSQL seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsSeedingPostgres(false);
            await loadPostgresUsers();
        }
    };

    const handleClearPostgres = async () => {
        setIsClearingPostgres(true);
        setLastResult(null);

        try {
            const response = await fetch(`${API_BASE}/api/v1/dev/seed`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (data.success) {
                setTestUsers([]);
                setPostgresStats(null);
                setLastResult({
                    success: true,
                    message: `PostgreSQL: Deleted ${data.deleted?.users || 0} users and all related data!`
                });
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            setLastResult({
                success: false,
                message: `PostgreSQL clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsClearingPostgres(false);
            setShowClearPostgresAlert(false);
        }
    };

    const progressPercent = progress
        ? (progress.total > 0 ? progress.current / progress.total : 0)
        : 0;

    const isAnyActionRunning = isSeeding || isClearing || isSeedingPostgres || isClearingPostgres;

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/home" />
                    </IonButtons>
                    <IonTitle>
                        <IonIcon icon={footballOutline} style={{ marginRight: 8 }} />
                        Developer Settings
                    </IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dev-settings-page">
                <div className="dev-settings-container">
                    {/* Warning Banner */}
                    <div className="dev-warning-banner">
                        ⚠️ Development Mode Only - This page is not available in production builds
                    </div>

                    {/* Result Message */}
                    {lastResult && (
                        <div className={`result-message ${lastResult.success ? 'success' : 'error'}`}>
                            <IonIcon icon={lastResult.success ? checkmarkCircleOutline : alertCircleOutline} />
                            <span>{lastResult.message}</span>
                        </div>
                    )}

                    {/* Progress Card */}
                    {isSeeding && progress && (
                        <IonCard className="progress-card">
                            <IonCardHeader>
                                <IonCardTitle>
                                    <IonSpinner name="crescent" /> Seeding in Progress...
                                </IonCardTitle>
                            </IonCardHeader>
                            <IonCardContent>
                                <p className="progress-message">{progress.message}</p>
                                <IonProgressBar value={progressPercent} />
                                <p className="progress-detail">
                                    {progress.current} / {progress.total} teams processed
                                </p>
                            </IonCardContent>
                        </IonCard>
                    )}

                    {/* PostgreSQL Seeding Card */}
                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>
                                <IonIcon icon={serverOutline} style={{ marginRight: 8 }} />
                                PostgreSQL Seeding
                                <IonBadge color="primary" style={{ marginLeft: 8 }}>Authenticated</IonBadge>
                            </IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p style={{ marginBottom: 16, color: 'var(--ion-color-medium)' }}>
                                Creates real users in the database. Login with <code>email@test.com</code> / <code>password</code>
                            </p>
                            <div className="action-buttons">
                                <IonButton
                                    expand="block"
                                    color="success"
                                    onClick={handleSeedPostgres}
                                    disabled={isAnyActionRunning}
                                >
                                    <IonIcon slot="start" icon={cloudUploadOutline} />
                                    {isSeedingPostgres ? 'Seeding PostgreSQL...' : 'Seed PostgreSQL'}
                                </IonButton>

                                <IonButton
                                    expand="block"
                                    color="danger"
                                    fill="outline"
                                    onClick={() => setShowClearPostgresAlert(true)}
                                    disabled={isAnyActionRunning}
                                >
                                    <IonIcon slot="start" icon={trashOutline} />
                                    {isClearingPostgres ? 'Clearing...' : 'Clear PostgreSQL Data'}
                                </IonButton>
                            </div>

                            {/* Test Users List */}
                            {testUsers.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <h4 style={{ marginBottom: 8 }}>
                                        <IonIcon icon={personOutline} style={{ marginRight: 4 }} />
                                        Test Users ({testUsers.length})
                                    </h4>
                                    <IonList lines="none" style={{ maxHeight: 200, overflow: 'auto' }}>
                                        {testUsers.slice(0, 5).map(user => (
                                            <IonItem key={user.email}>
                                                <IonLabel>
                                                    <h3>{user.teamName}</h3>
                                                    <p>{user.email}</p>
                                                </IonLabel>
                                            </IonItem>
                                        ))}
                                        {testUsers.length > 5 && (
                                            <IonItem>
                                                <IonLabel color="medium">
                                                    ...and {testUsers.length - 5} more
                                                </IonLabel>
                                            </IonItem>
                                        )}
                                    </IonList>
                                </div>
                            )}
                        </IonCardContent>
                    </IonCard>

                    {/* IndexedDB Seeding Card */}
                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>
                                <IonIcon icon={phonePortraitOutline} style={{ marginRight: 8 }} />
                                IndexedDB Seeding
                                <IonBadge color="warning" style={{ marginLeft: 8 }}>Guest Mode</IonBadge>
                            </IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p style={{ marginBottom: 16, color: 'var(--ion-color-medium)' }}>
                                Seeds data directly into IndexedDB for testing guest mode and quotas.
                            </p>
                            <div className="action-buttons">
                                <IonButton
                                    expand="block"
                                    color="primary"
                                    onClick={handleSeedIndexedDB}
                                    disabled={isAnyActionRunning}
                                >
                                    <IonIcon slot="start" icon={downloadOutline} />
                                    {isSeeding ? 'Seeding IndexedDB...' : 'Seed IndexedDB'}
                                </IonButton>

                                <IonButton
                                    expand="block"
                                    color="danger"
                                    fill="outline"
                                    onClick={() => setShowClearAlert(true)}
                                    disabled={isAnyActionRunning}
                                >
                                    <IonIcon slot="start" icon={trashOutline} />
                                    {isClearing ? 'Clearing...' : 'Clear IndexedDB'}
                                </IonButton>

                                <IonButton
                                    expand="block"
                                    color="medium"
                                    fill="clear"
                                    onClick={loadStats}
                                    disabled={isAnyActionRunning}
                                >
                                    <IonIcon slot="start" icon={refreshOutline} />
                                    Refresh Stats
                                </IonButton>
                            </div>
                        </IonCardContent>
                    </IonCard>

                    {/* Stats Card */}
                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>Current IndexedDB Stats</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            {stats ? (
                                <IonList lines="full">
                                    <IonItem>
                                        <IonLabel>Seasons</IonLabel>
                                        <IonLabel slot="end" className="stat-value">{stats.seasons.toLocaleString()}</IonLabel>
                                    </IonItem>
                                    <IonItem>
                                        <IonLabel>Teams</IonLabel>
                                        <IonLabel slot="end" className="stat-value">{stats.teams.toLocaleString()}</IonLabel>
                                    </IonItem>
                                    <IonItem>
                                        <IonLabel>Players</IonLabel>
                                        <IonLabel slot="end" className="stat-value">{stats.players.toLocaleString()}</IonLabel>
                                    </IonItem>
                                    <IonItem>
                                        <IonLabel>Matches</IonLabel>
                                        <IonLabel slot="end" className="stat-value">{stats.matches.toLocaleString()}</IonLabel>
                                    </IonItem>
                                    <IonItem>
                                        <IonLabel>Events</IonLabel>
                                        <IonLabel slot="end" className="stat-value">{stats.events.toLocaleString()}</IonLabel>
                                    </IonItem>
                                </IonList>
                            ) : (
                                <div className="loading-stats">
                                    <IonSpinner name="dots" />
                                    <span>Loading stats...</span>
                                </div>
                            )}
                        </IonCardContent>
                    </IonCard>

                    {/* Info Card */}
                    <IonCard>
                        <IonCardHeader>
                            <IonCardTitle>About Test Data</IonCardTitle>
                        </IonCardHeader>
                        <IonCardContent>
                            <p>
                                Seeds the database with real Premier League data from 2023-24 and 2024-25 seasons.
                            </p>
                            <ul>
                                <li><strong>20 test users</strong> - Login: <code>arsenal@test.com</code>, Password: <code>password</code></li>
                                <li><strong>20 managed teams</strong> - One per user (Arsenal, Liverpool, etc.)</li>
                                <li><strong>380 opponent teams</strong> - 19 opponent copies per user</li>
                                <li><strong>~760 matches</strong> - 2 seasons of real fixtures</li>
                            </ul>
                            <p className="data-source">
                                Data source: <a href="https://www.football-data.org/" target="_blank" rel="noopener noreferrer">football-data.org</a>
                            </p>
                        </IonCardContent>
                    </IonCard>
                </div>

                {/* Clear IndexedDB Alert */}
                <IonAlert
                    isOpen={showClearAlert}
                    onDidDismiss={() => setShowClearAlert(false)}
                    header="Clear IndexedDB?"
                    message="This will permanently delete ALL data from the local database. This action cannot be undone."
                    buttons={[
                        { text: 'Cancel', role: 'cancel' },
                        { text: 'Clear All', role: 'destructive', handler: handleClearIndexedDB },
                    ]}
                />

                {/* Clear PostgreSQL Alert */}
                <IonAlert
                    isOpen={showClearPostgresAlert}
                    onDidDismiss={() => setShowClearPostgresAlert(false)}
                    header="Clear PostgreSQL Data?"
                    message="This will delete ALL test users and their data from the server database. This action cannot be undone."
                    buttons={[
                        { text: 'Cancel', role: 'cancel' },
                        { text: 'Clear All', role: 'destructive', handler: handleClearPostgres },
                    ]}
                />
            </IonContent>
        </IonPage>
    );
};

export default DevSettingsPage;
