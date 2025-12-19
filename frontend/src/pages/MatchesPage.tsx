import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent
} from '@ionic/react';
import {
  add,
  calendar,
  refresh,
  refreshOutline
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import GuestBanner from '../components/GuestBanner';
import MatchesCalendar from '../components/MatchesCalendar';
import CreateMatchModal from '../components/CreateMatchModal';
import UpcomingMatchesList from '../components/UpcomingMatchesList';
import CompletedMatchesList from '../components/CompletedMatchesList';
import LiveMatchesList from '../components/LiveMatchesList';
import { useLocalMatches, useLocalTeams, useLocalMatchState } from '../hooks/useLocalData';
import { useInitialSync } from '../hooks/useInitialSync';
import { matchesApi } from '../services/api/matchesApi';
import { authApi } from '../services/api/authApi';
import type { Match, Team, MatchState } from '@shared/types';
import './PageStyles.css';
import './MatchesPage.css';
import useDeepLinkScrollHighlight from '../hooks/useDeepLinkScrollHighlight';

interface MatchesPageProps {
  onNavigate?: (page: string) => void;
}

const MatchesPage: React.FC<MatchesPageProps> = ({ onNavigate }) => {
  // Trigger initial sync from server for authenticated users
  useInitialSync();

  // Reactive data from IndexedDB
  const { matches: rawMatches, loading } = useLocalMatches();
  const { teams: teamsList } = useLocalTeams({ includeOpponents: true });

  // For match states, we'll use the date-based fallback in the UI
  // since loading all states reactively would be complex
  const matchStates: MatchState[] = [];

  // Convert teams array to Map for quick lookup
  const teamsCache = useMemo(() => {
    const cache = new Map<string, Team>();
    teamsList.forEach((team: any) => {
      if (team.id) cache.set(team.id, team as Team);
    });
    return cache;
  }, [teamsList]);

  // Enrich matches with team data and sort
  const matches = useMemo(() => {
    return rawMatches
      .map((match: any) => ({
        ...match,
        homeTeam: match.homeTeam || teamsCache.get(match.homeTeamId || match.home_team_id),
        awayTeam: match.awayTeam || teamsCache.get(match.awayTeamId || match.away_team_id),
      }))
      .sort((a: any, b: any) =>
        new Date(a.kickoffTime || a.kickoff_time).getTime() - new Date(b.kickoffTime || b.kickoff_time).getTime()
      ) as Match[];
  }, [rawMatches, teamsCache]);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // UpcomingMatchesList state
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  // CompletedMatchesList state
  const [expandedCompletedMatches, setExpandedCompletedMatches] = useState<Set<string>>(new Set());

  // Edit match state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  // Derive the primary team (YOUR TEAM) for home/away determination
  const primaryTeamId = useMemo(() => {
    // Prefer the first non-opponent team available in the cache
    for (const [, team] of teamsCache) {
      if (!team.isOpponent) return team.id;
    }
    return undefined;
  }, [teamsCache]);

  // Handle refresh - trigger cache refresh in background
  const handleRefresh = async (event: CustomEvent) => {
    try {
      const { refreshCache } = await import('../services/cacheService');
      await refreshCache();
    } catch (e) {
      console.warn('Refresh failed:', e);
    }
    event.detail.complete();
  };

  // Calendar event handlers
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setCreateModalOpen(true);
  };

  const contentRef = useRef<any>(null);

  const handleMatchClick = async (matchId: string) => {
    // Locate the match card in the lists (avoid matching the calendar indicators)
    const matchMeta = matches.find(m => m.id === matchId);
    const now = new Date();
    const isUpcoming = matchMeta ? new Date(matchMeta.kickoffTime) >= now : undefined;
    const upcomingSelector = `.upcoming-matches-list [data-match-id="${matchId}"]`;
    const completedSelector = `.completed-matches-list [data-match-id="${matchId}"]`;
    const preferredSelector = isUpcoming === undefined
      ? `${upcomingSelector}, ${completedSelector}`
      : isUpcoming
        ? upcomingSelector
        : completedSelector;

    let matchElement = document.querySelector(preferredSelector) as HTMLElement | null;
    if (!matchElement) {
      matchElement = document.querySelector(`${upcomingSelector}, ${completedSelector}`) as HTMLElement | null;
    }

    if (matchElement) {
      // Prefer scrolling the IonContent scroll container for cross-browser reliability
      try {
        if (contentRef.current && (contentRef.current as any).getScrollElement) {
          const scrollEl = await (contentRef.current as any).getScrollElement();
          if (scrollEl) {
            const matchRect = matchElement.getBoundingClientRect();
            const scrollRect = scrollEl.getBoundingClientRect();
            const paddingOffset = 80; // provide visual context
            const top = matchRect.top - scrollRect.top + scrollEl.scrollTop - paddingOffset;
            scrollEl.scrollTo({ top, behavior: 'smooth' });
          } else {
            matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) {
        matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Clear any previous highlights so animation retriggers
      document
        .querySelectorAll('.upcoming-match-item.match-highlighted, .completed-match-item.match-highlighted')
        .forEach(el => el.classList.remove('match-highlighted'));

      // Add highlight animation to the visible match card
      matchElement.classList.add('match-highlighted');

      // Ensure focus for accessibility
      setTimeout(() => {
        matchElement.focus();
      }, 100);

      // Remove highlight after 1.5s
      setTimeout(() => {
        matchElement.classList.remove('match-highlighted');
      }, 1500);
    } else {
      // If match element not found, try to determine if it's upcoming or completed
      const match = matches.find(m => m.id === matchId);
      if (match) {
        const now = new Date();
        const isUpcoming = new Date(match.kickoffTime) >= now;

        // Scroll to the appropriate section as fallback
        const sectionSelector = isUpcoming ? '.matches-upcoming-section' : '.matches-completed-section';
        const section = document.querySelector(sectionSelector) as HTMLElement;
        if (section) {
          section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });

          // Set focus to the section for accessibility
          setTimeout(() => {
            section.focus();
          }, 100);
        }
      } else {
        // Ultimate fallback - scroll to upcoming matches section
        const upcomingSection = document.querySelector('.matches-upcoming-section') as HTMLElement;
        if (upcomingSection) {
          upcomingSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });

          setTimeout(() => {
            upcomingSection.focus();
          }, 100);
        }
      }
    }
  };

  // Deep-link: handle ?matchId=... using the shared hook
  useDeepLinkScrollHighlight({
    param: 'matchId',
    itemAttr: 'data-match-id',
    listSelector: '.upcoming-matches-list, .completed-matches-list',
    contentRef,
    ready: !loading && matches.length > 0,
    offset: 80,
    highlightClass: 'match-highlighted',
    durationMs: 1500,
  });

  // UpcomingMatchesList event handlers
  const handleToggleExpand = (matchId: string) => {
    setExpandedMatches(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const handleMatchSelect = (matchId: string) => {
    // For now, just expand/collapse the match
    // In the future, this could navigate to a detailed match view
    handleToggleExpand(matchId);
  };

  const handleEditMatch = (match: Match) => {
    setEditingMatch(match);
    setCreateModalOpen(true);
  };

  // CompletedMatchesList event handlers
  const handleToggleExpandCompleted = (matchId: string) => {
    setExpandedCompletedMatches(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const handleCompletedMatchSelect = (matchId: string) => {
    // For now, just expand/collapse the match
    // In the future, this could navigate to a detailed match view
    handleToggleExpandCompleted(matchId);
  };

  const handleViewEvents = (match: Match) => {
    if (onNavigate) onNavigate(`/live/${match.id}`);
  };

  const handleLiveMatch = (match: Match) => {
    if (onNavigate) onNavigate(`/live/${match.id}`);
  };

  const handleDeleteMatch = async (match: Match) => {
    const confirmed = window.confirm('Delete this match? This cannot be undone.');
    if (!confirmed) return;
    try {
      await matchesApi.deleteMatch(match.id);
      // Reactive data updates automatically from IndexedDB
    } catch (e) {
      console.error('Failed to delete match', e);
      // Local-first: errors are rare, just log them
    }
  };

  // Handle match created - with reactive hooks, data updates automatically
  const handleMatchCreated = (match: Match) => {
    console.log("🆕 New match created:", {
      id: match.id.slice(0, 8),
      homeTeam: match.homeTeam?.name || 'N/A',
      awayTeam: match.awayTeam?.name || 'N/A'
    });
    // Reactive data updates automatically from IndexedDB
  };

  // Handle match updated - with reactive hooks, data updates automatically
  const handleMatchUpdated = (updatedMatch: Match) => {
    console.log("✏️ Match updated:", {
      id: updatedMatch.id.slice(0, 8),
      homeTeam: updatedMatch.homeTeam?.name,
      awayTeam: updatedMatch.awayTeam?.name
    });
    // Reactive data updates automatically from IndexedDB
  };

  const renderEmptyState = () => (
    <div className="empty-state">
      <IonIcon icon={calendar} className="empty-icon" />
      <h3 className="empty-title">No Matches Yet</h3>
      <p className="empty-subtitle">
        Create your first match to start scheduling games and tracking results.
      </p>
      <IonButton
        expand="block"
        color="secondary"
        className="empty-action"
        onClick={() => setCreateModalOpen(true)}
      >
        <IonIcon icon={add} slot="start" />
        Schedule Your First Match
      </IonButton>
    </div>
  );

  return (
    <IonPage className="page" data-theme="match">
      <PageHeader
        onNavigate={navigate}
        additionalButtons={
          <IonButton
            fill="clear"
            onClick={handleRefresh as any}
            style={{ color: 'white' }}
            disabled={loading}
          >
            <IonIcon icon={refreshOutline} />
          </IonButton>
        }
      />

      <IonContent ref={contentRef}>
        <GuestBanner />
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent
            pullingIcon={refresh}
            pullingText="Pull to refresh matches"
            refreshingSpinner="circles"
            refreshingText="Loading matches..."
          />
        </IonRefresher>

        <div className="matches-header">
          <div className="matches-title-section">
            <div className="page-header-with-color" style={{ backgroundColor: 'var(--theme-primary, var(--ion-color-secondary))' }}>
              <h1 className="matches-main-title">Matches</h1>
            </div>
            <p className="matches-subtitle">
              Schedule matches and track your team's performance
            </p>
          </div>
        </div>

        <div className="matches-content">
          {/* Error Display - removed for offline-first approach */}

          {/* Calendar Section */}
          <div className="matches-calendar-section">
            <MatchesCalendar
              matches={matches}
              selectedDate={selectedDate}
              onDateClick={handleDateClick}
              onMatchClick={handleMatchClick}
              loading={loading}
              teamsCache={teamsCache}
              primaryTeamId={primaryTeamId}
            />
          </div>

          {/* Live Matches Section below calendar, styled like lists */}
          {(() => {
            const statesMap = new Map(matchStates.map(s => [s.matchId, s]));
            const liveIds = new Set(matchStates.filter(s => s.status === 'LIVE' || s.status === 'PAUSED').map(s => s.matchId));
            const liveMatches = matches.filter(m => liveIds.has(m.id));
            if (liveMatches.length === 0) return null;
            return (
              <div className="matches-live-section" tabIndex={-1}>
                <h2 className="section-title">Live Matches</h2>
                <LiveMatchesList
                  matches={liveMatches}
                  statesMap={statesMap}
                  onMatchSelect={handleCompletedMatchSelect}
                  onOpenLive={handleLiveMatch}
                  primaryTeamId={primaryTeamId}
                />
              </div>
            );
          })()}

          {/* Upcoming Matches Section (SCHEDULED/POSTPONED) */}
          <div className="matches-upcoming-section" tabIndex={-1}>
            <h2 className="section-title">Upcoming Matches</h2>
            <UpcomingMatchesList
              matches={(() => {
                if (!matchStates.length) {
                  const now = new Date();
                  const fallback = matches.filter(m => new Date(m.kickoffTime) >= now);
                  console.log('⚠️ Using fallback upcoming filter by date. Count:', fallback.length);
                  return fallback;
                }
                const states = new Map(matchStates.map(s => [s.matchId, s]));
                const list = matches.filter(m => {
                  const st = states.get(m.id) as any;
                  return st?.status === 'SCHEDULED' || st?.status === 'POSTPONED';
                });
                console.log('✅ Upcoming by status. Count:', list.length);
                return list;
              })()}
              expandedMatches={expandedMatches}
              onToggleExpand={handleToggleExpand}
              onMatchSelect={handleMatchSelect}
              onEditMatch={handleEditMatch}
              onLiveMatch={handleLiveMatch}
              onDeleteMatch={handleDeleteMatch}
              loading={loading}
              teamsCache={teamsCache}
              primaryTeamId={primaryTeamId}
            />
          </div>

          {/* Completed Matches Section (COMPLETED/CANCELLED) */}
          <div className="matches-completed-section" tabIndex={-1}>
            <h2 className="section-title">Completed Matches</h2>
            <CompletedMatchesList
              matches={(() => {
                if (!matchStates.length) {
                  const now = new Date();
                  const fallback = matches.filter(m => new Date(m.kickoffTime) < now);
                  console.log('⚠️ Using fallback completed filter by date. Count:', fallback.length);
                  return fallback;
                }
                const states = new Map(matchStates.map(s => [s.matchId, s]));
                const list = matches.filter(m => {
                  const st = states.get(m.id) as any;
                  return st?.status === 'COMPLETED' || st?.status === 'CANCELLED';
                });
                console.log('✅ Completed by status. Count:', list.length);
                return list;
              })()}
              expandedMatches={expandedCompletedMatches}
              onToggleExpand={handleToggleExpandCompleted}
              onMatchSelect={handleCompletedMatchSelect}
              onViewEvents={handleViewEvents}
              onDeleteMatch={handleDeleteMatch}
              loading={loading}
              teamsCache={teamsCache}
              primaryTeamId={primaryTeamId}
            />
          </div>

          {/* Show empty state if no matches */}
          {matches.length === 0 && !loading && renderEmptyState()}
        </div>

        {/* Create Match Modal */}
        <CreateMatchModal
          isOpen={createModalOpen}
          onDidDismiss={() => {
            setCreateModalOpen(false);
            setSelectedDate(null);
            setEditingMatch(null);
          }}
          preselectedDate={selectedDate || undefined}
          onMatchCreated={handleMatchCreated}
          editingMatch={editingMatch}
          onMatchUpdated={handleMatchUpdated}
        />
      </IonContent>
    </IonPage>
  );
};

export default MatchesPage;
