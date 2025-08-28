import React, { useEffect, useState, useRef, useMemo } from 'react';
import type { HTMLIonContentElement } from '@ionic/core/components';
import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToast
} from '@ionic/react';
import {
  add,
  calendar,
  refresh,
  refreshOutline
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import MatchesCalendar from '../components/MatchesCalendar';
import CreateMatchModal from '../components/CreateMatchModal';
import UpcomingMatchesList from '../components/UpcomingMatchesList';
import CompletedMatchesList from '../components/CompletedMatchesList';
import LiveMatchesList from '../components/LiveMatchesList';
import { matchesApi } from '../services/api/matchesApi';
import { teamsApi } from '../services/api/teamsApi';
import type { Match, Team, MatchState } from '@shared/types';
import './PageStyles.css';
import './MatchesPage.css';
import useDeepLinkScrollHighlight from '../hooks/useDeepLinkScrollHighlight';

interface MatchesPageProps {
  onNavigate?: (page: string) => void;
}

const MatchesPage: React.FC<MatchesPageProps> = ({ onNavigate }) => {
  // State management
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [teamsCache, setTeamsCache] = useState<Map<string, Team>>(new Map());
  const [matchStates, setMatchStates] = useState<MatchState[]>([]);

  // UpcomingMatchesList state
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  // CompletedMatchesList state
  const [expandedCompletedMatches, setExpandedCompletedMatches] = useState<Set<string>>(new Set());

  // Edit match state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  // Ref to prevent multiple concurrent API calls
  const loadingRef = useRef(false);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  // Derive the primary team (YOUR TEAM) for home/away determination
  const primaryTeamId = useMemo(() => {
    // Prefer the first non-opponent team available in the cache
    for (const [, team] of teamsCache) {
      if (!team.is_opponent) return team.id;
    }
    return undefined;
  }, [teamsCache]);

  // Load teams data for the cache
  const loadTeams = async () => {
    try {
      // Include opponent teams for calendar display
      const response = await teamsApi.getTeams({ limit: 100, includeOpponents: true });
      const newTeamsCache = new Map<string, Team>();
      response.data.forEach(team => {
        newTeamsCache.set(team.id, team);
      });
      setTeamsCache(newTeamsCache);
    } catch (err) {
      console.error('Error loading teams for cache:', err);
      // Don't show error to user for teams cache - it's not critical
    }
  };

  // Load matches data with loading state protection
  const loadMatches = async (showLoadingState = true) => {
    // Prevent multiple concurrent API calls
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    if (showLoadingState) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch all matches for the user (increased limit to get comprehensive data)
      const response = await matchesApi.getMatches({ limit: 500 });
      console.log("📊 Matches API Response:", response.data);

      // Debug: Log each match with team info
      response.data.forEach((match, index) => {
        console.log(`🏈 Match ${index + 1}:`, {
          id: match.id.slice(0, 8),
          homeTeam: match.homeTeam ? {
            name: match.homeTeam.name,
            id: match.homeTeam.id.slice(0, 8),
            is_opponent: match.homeTeam.is_opponent,
            homeKitPrimary: match.homeTeam.homeKitPrimary,
            awayKitPrimary: match.homeTeam.awayKitPrimary
          } : 'No homeTeam data',
          awayTeam: match.awayTeam ? {
            name: match.awayTeam.name,
            id: match.awayTeam.id.slice(0, 8),
            is_opponent: match.awayTeam.is_opponent,
            homeKitPrimary: match.awayTeam.homeKitPrimary,
            awayKitPrimary: match.awayTeam.awayKitPrimary
          } : 'No awayTeam data'
        });
      });

      setMatches(response.data);
      setError(null);
      // Fetch match states for status-driven sections
      try {
        const ids = (response.data || []).map(m => m.id);
        const states = await matchesApi.getMatchStates(1, 500, ids);
        const allStates = (states.data || []) as any[];
        console.log('🧭 Match states loaded:', allStates.length, allStates.slice(0, 3));
        setMatchStates(allStates as any);
      } catch (e) {
        console.warn('Failed to load match states', e);
        setMatchStates([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load matches';
      setError(errorMessage);
      console.error('Error loading matches:', err);

      // Show error toast for better user experience
      setShowErrorToast(true);

      // Don't clear matches on error - keep existing data if available
      // This provides better UX when there's a temporary network issue
    } finally {
      if (showLoadingState) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    // Load both matches and teams data
    loadMatches();
    loadTeams();
  }, []);

  useEffect(() => {
    console.log('📈 Matches loaded:', matches.length);
    if (matchStates.length) {
      const statusCounts = matchStates.reduce((acc: any, s) => { acc[s.status] = (acc[s.status]||0)+1; return acc; }, {});
      console.log('📊 MatchStates counts by status:', statusCounts);
    } else {
      console.log('📊 MatchStates empty; UI will use date-based fallback');
    }
  }, [matches, matchStates]);

  const handleRefresh = async (event: CustomEvent) => {
    try {
      // Use loadMatches without loading state to avoid UI flicker during pull-to-refresh
      await loadMatches(false);
    } catch (err) {
      console.error('Error during pull-to-refresh:', err);
    } finally {
      event.detail.complete();
    }
  };

  // Calendar event handlers
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setCreateModalOpen(true);
  };

  const contentRef = useRef<HTMLIonContentElement | null>(null);

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
      // Refresh lists and calendar
      await loadMatches(false);
    } catch (e) {
      console.error('Failed to delete match', e);
      setShowErrorToast(true);
      setError('Failed to delete match');
    }
  };

  const handleMatchCreated = (match: Match) => {
    console.log("🆕 New match created:", {
      id: match.id.slice(0, 8),
      homeTeamId: match.homeTeamId?.slice(0, 8),
      awayTeamId: match.awayTeamId?.slice(0, 8),
      homeTeam: match.homeTeam ? {
        id: match.homeTeam.id?.slice(0, 8),
        name: match.homeTeam.name
      } : 'No homeTeam data',
      awayTeam: match.awayTeam ? {
        id: match.awayTeam.id?.slice(0, 8),
        name: match.awayTeam.name
      } : 'No awayTeam data',
      teamsInCache: teamsCache.size
    });

    // Update teams cache optimistically with any embedded team data
    setTeamsCache(prev => {
      const next = new Map(prev);
      if (match.homeTeam && match.homeTeam.id) {
        next.set(match.homeTeam.id, match.homeTeam);
      }
      if (match.awayTeam && match.awayTeam.id) {
        next.set(match.awayTeam.id, match.awayTeam);
      }
      return next;
    });

    // Optimistic update: immediately add the new match to the existing array
    // This ensures the match appears on the calendar immediately without additional API calls
    setMatches(prev => {
      // Check if match already exists to avoid duplicates
      const existingMatch = prev.find(m => m.id === match.id);
      if (existingMatch) {
        return prev;
      }

      // Ensure the match has proper team data from the cache
      const enrichedMatch = { ...match };

      // Prefer embedded homeTeam; otherwise enrich from cache
      if (!enrichedMatch.homeTeam || !enrichedMatch.homeTeam.name) {
        const homeTeamId = enrichedMatch.homeTeamId;
        const cachedHomeTeam = teamsCache.get(homeTeamId);
        if (cachedHomeTeam) {
          console.log("✅ Enriched homeTeam from cache:", cachedHomeTeam.name);
          enrichedMatch.homeTeam = cachedHomeTeam;
        }
      }

      // Prefer embedded awayTeam; otherwise enrich from cache
      if (!enrichedMatch.awayTeam || !enrichedMatch.awayTeam.name) {
        const awayTeamId = enrichedMatch.awayTeamId;
        const cachedAwayTeam = teamsCache.get(awayTeamId);
        if (cachedAwayTeam) {
          console.log("✅ Enriched awayTeam from cache:", cachedAwayTeam.name);
          enrichedMatch.awayTeam = cachedAwayTeam;
        }
      }

      // Add new match and sort by kickoff time for proper ordering
      const updatedMatches = [...prev, enrichedMatch];
      return updatedMatches.sort((a, b) =>
        new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
      );
    });

    // Clear any existing errors since we successfully created a match
    setError(null);
  };

  const handleMatchUpdated = (updatedMatch: Match) => {
    console.log("✏️ Match updated:", {
      id: updatedMatch.id.slice(0, 8),
      homeTeam: updatedMatch.homeTeam?.name,
      awayTeam: updatedMatch.awayTeam?.name
    });

    // Update the match in the matches array
    setMatches(prev => {
      const updatedMatches = prev.map(match =>
        match.id === updatedMatch.id ? updatedMatch : match
      );
      return updatedMatches.sort((a, b) =>
        new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
      );
    });

    // Clear any existing errors
    setError(null);
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
            onClick={() => loadMatches()}
            style={{ color: 'white' }}
            disabled={loading}
          >
            <IonIcon icon={refreshOutline} />
          </IonButton>
        }
      />

      <IonContent ref={contentRef}>
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
          {/* Error Display */}
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <IonButton
                fill="clear"
                size="small"
                onClick={() => loadMatches()}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Try Again'}
              </IonButton>
            </div>
          )}

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

        {/* Error Toast */}
        <IonToast
          isOpen={showErrorToast}
          onDidDismiss={() => setShowErrorToast(false)}
          message={error || 'An error occurred while loading matches'}
          duration={4000}
          color="danger"
          position="top"
          buttons={[
            {
              text: 'Retry',
              role: 'cancel',
              handler: () => {
                setShowErrorToast(false);
                loadMatches();
              }
            },
            {
              text: 'Dismiss',
              role: 'cancel',
              handler: () => setShowErrorToast(false)
            }
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default MatchesPage;
