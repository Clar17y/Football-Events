import React, { useState, useEffect } from 'react';
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
    IonChip
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
import { useLocalRecentActivity } from '../hooks/useLocalRecentActivity';
import { type ActivityItem, type ActivityFilters, DEFAULT_ACTIVITY_FILTERS } from '../types/activity';
import './RecentActivity.css';

const APP_SETTINGS_KEY = 'matchmaster_app_settings';

interface RecentActivityProps {
    onNavigate?: (page: string, entityId?: string) => void;
    limit?: number;
    days?: number;
}

const RecentActivity: React.FC<RecentActivityProps> = ({
    onNavigate,
    limit: initialLimit = 20,
    days = 30
}) => {
    const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [limit, setLimit] = useState(initialLimit);

    const loadMore = () => setLimit(prev => prev + 20);

    // Load activity filters from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(APP_SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.activityFilters) {
                    setFilters({ ...DEFAULT_ACTIVITY_FILTERS, ...parsed.activityFilters });
                }
            }
        } catch {
            // Use defaults on error
        }

        // Listen for storage changes (when settings are updated)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === APP_SETTINGS_KEY && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed.activityFilters) {
                        setFilters({ ...DEFAULT_ACTIVITY_FILTERS, ...parsed.activityFilters });
                    }
                } catch {
                    // Ignore
                }
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const { activities, loading, hasMore } = useLocalRecentActivity({ limit, days, filters });

    const isGroup = (a: ActivityItem) => a.type === 'event' && a.action === 'period_summary' && !!(a.metadata as any)?.children?.length;
    const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const getEventKindIcon = (kind: string) => {
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

    const getActivityIcon = (type: ActivityItem['type']) => {
        switch (type) {
            case 'team': return people;
            case 'player': return person;
            case 'season': return calendar;
            case 'match': return football;
            case 'event': return play;
            case 'lineup': return football;
            default: return trophy;
        }
    };

    const getActivityColor = (type: ActivityItem['type']) => {
        switch (type) {
            case 'season': return 'primary';
            case 'team': return 'teal';
            case 'player': return 'indigo';
            case 'match': return 'amber';
            case 'event': return 'secondary';
            case 'lineup': return 'sky';
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
                if (activity.entityId) {
                    onNavigate(`matches?matchId=${encodeURIComponent(activity.entityId)}`);
                } else {
                    onNavigate('matches');
                }
                break;
            case 'event':
                if ((activity.metadata as any)?.matchId) {
                    onNavigate(`live/${(activity.metadata as any).matchId}`);
                }
                break;
            case 'lineup': {
                const teamId = (activity.metadata as any)?.teamId || activity.entityId;
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

    if (loading && activities.length === 0) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
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

    if (activities.length === 0) {
        return (
            <IonCard className="activity-card">
                <IonCardContent>
                    <div className="activity-header">
                        <h2 className="section-title">Recent Activity</h2>
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
            <IonCardContent>
                <div className="activity-header">
                    <h2 className="section-title">Recent Activity</h2>
                </div>

                <IonList className="activity-list">
                    {activities.map((activity) => (
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
                                    {((activity.metadata as any)?.children ?? []).map((child: any) => (
                                        <IonItem
                                            key={child.id}
                                            button
                                            onClick={() => onNavigate && (activity.metadata as any)?.matchId && onNavigate(`live/${(activity.metadata as any).matchId}`)}
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

                {hasMore && (
                    <div className="activity-load-more">
                        <IonButton
                            fill="clear"
                            expand="block"
                            onClick={loadMore}
                        >
                            Load More
                        </IonButton>
                    </div>
                )}
            </IonCardContent>
        </IonCard>
    );
};

export default RecentActivity;
