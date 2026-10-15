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
import { useOwnedDiscovery } from '../hooks/useOwnedDiscovery';
import { useInitialSync } from '../hooks/useInitialSync';
import { matchesApi } from '../services/api/matchesApi';
import type { Match, Team, MatchState } from '@shared/types';
import './PageStyles.css';
import './MatchesPage.css';
import useDeepLinkScrollHighlight from '../hooks/useDeepLinkScrollHighlight';

interface MatchesPageProps {
  onNavigate?: (page: string) => void;
}

type MatchCategory = 'live' | 'upcoming' | 'past' | 'completed';

const MatchesPage: React.FC<MatchesPageProps> = ({ onNavigate }) => {
  // Trigger initial sync from server for authenticated users
  useInitialSync();

  const discovery = useOwnedDiscovery();
  const { matches: rawMatches, teams: teamsList, matchStates: localMatchStates, loading } = discovery;
  const matchStates = localMatchStates as unknown as MatchState[];

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
        homeTeam: teamsCache.get(match.homeTeamId || match.home_team_id),
        awayTeam: teamsCache.get(match.awayTeamId || match.away_team_id),
      }))
      .sort((a: any, b: any) =>
        new Date(a.kickoffTime || a.kickoff_time).getTime() - new Date(b.kickoffTime || b.kickoff_time).getTime()
      ) as Match[];
  }, [rawMatches, teamsCache]);

  const statesMap = useMemo(() => new Map(matchStates.map(state => [state.matchId, state])), [localMatchStates]);
  const categoryForMatch = (match: Match): MatchCategory => {
    const status = statesMap.get(match.id)?.status;
    if (status === 'LIVE' || status === 'PAUSED') return 'live';
    if (status === 'COMPLETED' || status === 'CANCELLED') return 'completed';
    if (status === 'SCHEDULED' || status === 'POSTPONED') return 'upcoming';
    return new Date(match.kickoffTime).getTime() < Date.now() ? 'past' : 'upcoming';
  };
  const matchGroups: Record<MatchCategory, Match[]> = { live: [], upcoming: [], past: [], completed: [] };
  matches.forEach(match => matchGroups[categoryForMatch(match)].push(match));

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // UpcomingMatchesList state
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  // CompletedMatchesList state
  const [expandedCompletedMatches, setExpandedCompletedMatches] = useState<Set<string>>(new Set());

  // Edit match state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const [selectionSession, setSelectionSession] = useState(discovery.sessionKey);
  const selectionCurrent = selectionSession === discovery.sessionKey;
  useEffect(() => {
    setCreateModalOpen(false);
    setSelectedDate(null);
    setEditingMatch(null);
    setExpandedMatches(new Set());
    setExpandedCompletedMatches(new Set());
    setSelectionSession(discovery.sessionKey);
  }, [discovery.sessionKey]);

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
    if (!discovery.isCurrent()) return;
    setSelectedDate(date);
    setCreateModalOpen(true);
  };

  const contentRef = useRef<any>(null);

  const handleMatchClick = async (matchId: string) => {
    if (!discovery.canAccessMatch(matchId)) return;
    // Locate the match card in the lists (avoid matching the calendar indicators)
    const matchMeta = matches.find(m => m.id === matchId);
    const category = matchMeta ? categoryForMatch(matchMeta) : undefined;
    const upcomingSelector = `.upcoming-matches-list [data-match-id="${matchId}"]`;
    const completedSelector = `.completed-matches-list [data-match-id="${matchId}"]`;
    const pastSelector = `.matches-past-section [data-match-id="${matchId}"]`;
    const liveSelector = `.matches-live-section [data-match-id="${matchId}"]`;
    const selectors = { upcoming: upcomingSelector, completed: completedSelector, past: pastSelector, live: liveSelector };
    const preferredSelector = category === undefined
      ? `${upcomingSelector}, ${completedSelector}`
      : selectors[category];

    let matchElement = document.querySelector(preferredSelector) as HTMLElement | null;
    if (!matchElement) {
      matchElement = document.querySelector(`${upcomingSelector}, ${completedSelector}, ${pastSelector}, ${liveSelector}`) as HTMLElement | null;
    }

    if (matchElement) {
      // Prefer scrolling the IonContent scroll container for cross-browser reliability
      try {
        if (contentRef.current && (contentRef.current as any).getScrollElement) {
          const scrollEl = await (contentRef.current as any).getScrollElement();
          if (!discovery.canAccessMatch(matchId)) return;
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
        if (discovery.canAccessMatch(matchId)) matchElement.focus();
      }, 100);

      // Remove highlight after 1.5s
      setTimeout(() => {
        matchElement.classList.remove('match-highlighted');
      }, 1500);
    } else {
      // If match element not found, try to determine if it's upcoming or completed
      const match = matches.find(m => m.id === matchId);
      if (match) {
        // Scroll to the appropriate section as fallback
        const sectionSelector = `.matches-${categoryForMatch(match)}-section`;
        const section = document.querySelector(sectionSelector) as HTMLElement;
        if (section) {
          section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });

          // Set focus to the section for accessibility
          setTimeout(() => {
            if (discovery.canAccessMatch(matchId)) section.focus();
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
    if (!discovery.canAccessMatch(matchId)) return;
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
    if (!discovery.canAccessMatch(match.id)) return;
    setEditingMatch(match);
    setCreateModalOpen(true);
  };

  // CompletedMatchesList event handlers
  const handleToggleExpandCompleted = (matchId: string) => {
    if (!discovery.canAccessMatch(matchId)) return;
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
    if (!discovery.canAccessMatch(match.id)) return;
    if (onNavigate) onNavigate(`/live/${match.id}`);
  };

  const handleLiveMatch = (match: Match) => {
    if (!discovery.canAccessMatch(match.id)) return;
    if (onNavigate) onNavigate(`/live/${match.id}`);
  };

  const handleDeleteMatch = async (match: Match) => {
    if (!discovery.canAccessMatch(match.id)) return;
    const confirmed = window.confirm('Delete this match? This cannot be undone.');
    if (!confirmed || !discovery.canAccessMatch(match.id)) return;
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
        disabled={!discovery.ownerId}
        onClick={() => { if (discovery.isCurrent()) setCreateModalOpen(true); }}
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
              selectedDate={selectionCurrent ? selectedDate : null}
              onDateClick={handleDateClick}
              onMatchClick={handleMatchClick}
              loading={loading}
              teamsCache={teamsCache}
              primaryTeamId={primaryTeamId}
            />
          </div>

          {/* Live Matches Section below calendar, styled like lists */}
          {(() => {
            const liveMatches = matchGroups.live;
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

          {/* Upcoming Matches Section (SCHEDULED/POSTPONED or unstarted matches) */}
          <div className="matches-upcoming-section" tabIndex={-1}>
            <h2 className="section-title">Upcoming Matches</h2>
            <UpcomingMatchesList
              matches={matchGroups.upcoming}
              expandedMatches={selectionCurrent ? expandedMatches : new Set()}
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

          {matchGroups.past.length > 0 && (
            <div className="matches-past-section" tabIndex={-1}>
              <h2 className="section-title">Past matches</h2>
              <p>No saved match status is available. Open a match to view details or record it.</p>
              <UpcomingMatchesList
                matches={matchGroups.past}
                expandedMatches={selectionCurrent ? expandedMatches : new Set()}
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
          )}

          {/* Completed Matches Section (COMPLETED/CANCELLED) */}
          <div className="matches-completed-section" tabIndex={-1}>
            <h2 className="section-title">Completed Matches</h2>
            <CompletedMatchesList
              matches={matchGroups.completed}
              expandedMatches={selectionCurrent ? expandedCompletedMatches : new Set()}
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
          key={discovery.sessionKey}
          isOpen={selectionCurrent && createModalOpen && !!discovery.ownerId && (!editingMatch || discovery.canAccessMatch(editingMatch.id))}
          onDidDismiss={() => {
            setCreateModalOpen(false);
            setSelectedDate(null);
            setEditingMatch(null);
          }}
          preselectedDate={selectionCurrent ? selectedDate || undefined : undefined}
          onMatchCreated={handleMatchCreated}
          editingMatch={selectionCurrent && editingMatch && discovery.canAccessMatch(editingMatch.id) ? editingMatch : null}
          onMatchUpdated={handleMatchUpdated}
        />
      </IonContent>
    </IonPage>
  );
};

export default MatchesPage;
