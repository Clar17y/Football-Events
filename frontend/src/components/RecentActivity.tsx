import React, { useState } from 'react';
import {
    IonCard,
    IonCardContent,
    IonIcon,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSkeletonText,
    IonChip,
    IonRefresher,
    IonRefresherContent
} from '@ionic/react';
import {
    trophy,
    people,
    person,
    calendar,
    football,
    ribbon,
    play,
    time,
    refresh as refreshIcon,
    chevronDown,
    chevronUp,
    footballOutline,
    swapHorizontalOutline,
    navigateOutline,
    shieldCheckmarkOutline,
    handLeftOutline,
    bodyOutline,
    alertCircleOutline,
    flagOutline,
    flashOutline,
    exitOutline
} from 'ionicons/icons';
import { useRecentActivity } from '../hooks/useRecentActivity';
import { ActivityItem } from '../services/api/activityApi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './RecentActivity.css';

interface RecentActivityProps {
    onNavigate?: (page: string, entityId?: string) => void;
    limit?: number;
    days?: number;
}

const RecentActivity: React.FC<RecentActivityProps> = ({
    onNavigate,
    limit = 10,
    days = 30
}) => {
    const { user } = useAuth();
    const { isDarkMode } = useTheme();
    const { activities, loading, error, pagination, refresh, goToPage } = useRecentActivity({ limit, days });
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const isGroup = (a: ActivityItem) => a.type === 'event' && a.action === 'period_summary' && !!(a as any).metadata?.children?.length;
    const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const getEventKindIcon = (kind: string) => {
        // Mirror live match page icons
        switch (kind) {
            case 'goal':
            case 'own_goal':
                return footballOutline;
            case 'assist':
                return swapHorizontalOutline;
            case 'key_pass':
                return navigateOutline;
            case 'save':
                return shieldCheckmarkOutline;
            case 'interception':
                return handLeftOutline;
            case 'tackle':
                return bodyOutline;
            case 'foul':
                return alertCircleOutline;
            case 'penalty':
                return flagOutline;
            case 'free_kick':
                return flashOutline;
            case 'ball_out':
                return exitOutline;
            // Not defined on live icons yet; fallbacks
            case 'shot_on':
            case 'shot_off':
                return navigateOutline;
            case 'yellow_card':
            case 'red_card':
                return alertCircleOutline;
            default:
                return play;
        }
    };

    // Early return if no user
    if (!user) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
                    </div>
                    <div className="activity-placeholder">
                        <IonIcon icon={trophy} className="activity-icon" />
                        <h3>Sign in to see activity</h3>
                        <p>Sign in to track your teams, players, and matches</p>
                    </div>
                </IonCardContent>
            </IonCard>
        );
    }

    const getActivityIcon = (type: ActivityItem['type']) => {
        switch (type) {
            case 'team': return people;
            case 'player': return person;
            case 'season': return calendar;
            case 'match': return football;
            case 'award': return ribbon;
            case 'event': return play;
            case 'lineup': return football;
            default: return trophy;
        }
    };

    const getActivityColor = (type: ActivityItem['type']) => {
        switch (type) {
            case 'season': return 'primary';    // Blue - matches seasons page
            case 'team': return 'teal';         // Teal - matches teams page
            case 'player': return 'indigo';     // Indigo - matches players page
            case 'award': return 'rose';        // Rose - matches awards page
            case 'match': return 'amber';       // Amber - matches live/active sections
            case 'event': return 'secondary';   // Green - for match events
            case 'lineup': return 'sky';        // Sky - matches lineup management
            default: return 'medium';
        }
    };

    const handleActivityClick = (activity: ActivityItem) => {
        if (!onNavigate) return;
        if (isGroup(activity)) { toggleExpand(activity.id); return; }

        switch (activity.type) {
            case 'team':
                onNavigate(`teams?teamId=${encodeURIComponent(activity.entityId || '')}`);
                break;
            case 'player':
                onNavigate(`players?playerId=${encodeURIComponent(activity.entityId || '')}`);
                break;
            case 'season':
                onNavigate(`seasons?seasonId=${encodeURIComponent(activity.entityId || '')}`);
                break;
            case 'match':
                // Deep link to matches page with matchId so it can scroll/highlight
                if (activity.entityId) {
                    onNavigate(`matches?matchId=${encodeURIComponent(activity.entityId)}`);
                } else {
                    onNavigate('matches');
                }
                break;
            case 'award':
                onNavigate('awards');
                break;
            case 'event':
                // Navigate to live match if available
                if (activity.metadata?.matchId) {
                    onNavigate(`live/${activity.metadata.matchId}`);
                }
                break;
            case 'lineup': {
                const teamId = activity.metadata?.teamId || activity.entityId;
                if (teamId) onNavigate(`lineup-management?teamId=${encodeURIComponent(teamId)}`);
                else onNavigate('lineup-management');
                break;
            }
        }
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    };

    const handleRefresh = async (event: CustomEvent) => {
        await refresh();
        event.detail.complete();
    };

    if (loading && (!activities || activities.length === 0)) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
                        <IonButton fill="clear" size="small" disabled>
                            <IonIcon icon={refreshIcon} />
                        </IonButton>
                    </div>
                    <IonList>
                        {[1, 2, 3].map((i) => (
                            <IonItem key={i}>
                                <IonIcon icon={trophy} slot="start" />
                                <IonLabel>
                                    <IonSkeletonText animated style={{ width: '80%' }} />
                                    <IonSkeletonText animated style={{ width: '40%' }} />
                                </IonLabel>
                            </IonItem>
                        ))}
                    </IonList>
                </IonCardContent>
            </IonCard>
        );
    }

    if (error) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
                        <IonButton fill="clear" size="small" onClick={refresh}>
                            <IonIcon icon={refreshIcon} />
                        </IonButton>
                    </div>
                    <div className="activity-error">
                        <IonIcon icon={trophy} className="activity-icon" />
                        <h3>Unable to load activity</h3>
                        <p>{error}</p>
                        <IonButton fill="outline" color="primary" onClick={refresh}>
                            Try Again
                        </IonButton>
                    </div>
                </IonCardContent>
            </IonCard>
        );
    }

    if (!activities || activities.length === 0) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
                        <IonButton fill="clear" size="small" onClick={refresh}>
                            <IonIcon icon={refreshIcon} />
                        </IonButton>
                    </div>
                    <div className="activity-placeholder">
                        <IonIcon icon={trophy} className="activity-icon" />
                        <h3>No recent activity</h3>
                        <p>Start by creating a season or adding teams to see activity here</p>
                        <IonButton
                            fill="outline"
                            color="primary"
                            onClick={() => onNavigate?.('seasons')}
                        >
                            Get Started
                        </IonButton>
                    </div>
                </IonCardContent>
            </IonCard>
        );
    }

    return (
        <IonCard className="activity-card">
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
                <IonRefresherContent />
            </IonRefresher>

            <IonCardContent>
                <div className="activity-header">
                    <h2 className="section-title">Recent Activity</h2>
                    <IonButton fill="clear" size="small" onClick={refresh} disabled={loading}>
                        <IonIcon icon={refreshIcon} />
                    </IonButton>
                </div>

                <IonList className="activity-list">
                    {activities?.map((activity) => (
                        <React.Fragment key={activity.id}>
                            <IonItem
                                button
                                onClick={() => handleActivityClick(activity)}
                                className="activity-item"
                            >
                                <IonIcon
                                    icon={getActivityIcon(activity.type)}
                                    slot="start"
                                    color={getActivityColor(activity.type)}
                                    className="activity-item-icon"
                                />
                            <IonLabel>
                                <h3 className="activity-description">
                                    {activity.title || activity.description}
                                </h3>
                                <div className="activity-meta">
                                    <IonChip
                                        color={getActivityColor(activity.type)}
                                        className="activity-type-chip"
                                    >
                                        {activity.type}
                                    </IonChip>
                                    <IonNote color="medium" className="activity-time">
                                        <IonIcon icon={time} />
                                        {formatTimeAgo(activity.createdAt)}
                                    </IonNote>
                                </div>
                            </IonLabel>
                            {isGroup(activity) && (
                                <IonIcon slot="end" icon={expanded[activity.id] ? chevronUp : chevronDown} />
                            )}
                        </IonItem>
                            {isGroup(activity) && expanded[activity.id] && (
                                <IonList className="activity-sublist">
                                    {(activity as any).metadata?.children?.map((child: any) => (
                                        <IonItem
                                            key={child.id}
                                            button
                                            onClick={() => onNavigate && (activity as any).metadata?.matchId && onNavigate(`live/${(activity as any).metadata.matchId}`)}
                                            className="activity-subitem"
                                        >
                                            <IonIcon slot="start" icon={getEventKindIcon(child.kind)} />
                                            <IonLabel>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {child.timeLabel && (
                                                        <IonChip color="medium" className="activity-time-chip">{child.timeLabel}</IonChip>
                                                    )}
                                                    <h3 className="activity-description" style={{ margin: 0 }}>{child.title}</h3>
                                                </div>
                                            </IonLabel>
                                        </IonItem>
                                    ))}
                                </IonList>
                            )}
                        </React.Fragment>
                    ))}
                </IonList>

                {pagination && (
                    <div className="activity-footer">
                        <div className="activity-pagination-info">
                            <IonNote color="medium">
                                Showing {activities.length} of {pagination.total} activities 
                                (Page {pagination.page} of {pagination.totalPages})
                            </IonNote>
                        </div>
                        
                        {(pagination.hasNext || pagination.hasPrev) && (
                            <div className="activity-pagination-controls">
                                <IonButton 
                                    fill="clear" 
                                    size="small" 
                                    disabled={!pagination.hasPrev || loading}
                                    onClick={() => goToPage(pagination.page - 1)}
                                >
                                    Previous
                                </IonButton>
                                
                                <IonButton 
                                    fill="clear" 
                                    size="small" 
                                    disabled={!pagination.hasNext || loading}
                                    onClick={() => goToPage(pagination.page + 1)}
                                >
                                    Next
                                </IonButton>
                            </div>
                        )}
                    </div>
                )}
            </IonCardContent>
        </IonCard>
    );
};

export default RecentActivity;
