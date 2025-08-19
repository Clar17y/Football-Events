import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { matchesApi } from '../services/api/matchesApi';
import { teamsApi } from '../services/api/teamsApi';
import type { Match, Team } from '@shared/types';
import './PageStyles.css';
import './MatchesPage.css';

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

  const handleMatchClick = (matchId: string) => {
    // Scroll to match in the appropriate list section
    const matchElement = document.querySelector(`[data-match-id="${matchId}"]`);
    if (matchElement) {
      matchElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Add highlight animation
      matchElement.classList.add('match-highlighted');
      setTimeout(() => {
        matchElement.classList.remove('match-highlighted');
      }, 2000);
    } else {
      // If match element not found, scroll to upcoming matches section as fallback
      const upcomingSection = document.querySelector('.matches-upcoming-section');
      if (upcomingSection) {
        upcomingSection.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  };

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
    // Stub for future Live Events page navigation
    console.log('View events for match:', match.id);
    // TODO: Navigate to Live Events page when implemented
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

      <IonContent>
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

          {/* Upcoming Matches Section */}
          <div className="matches-upcoming-section">
            <h2 className="section-title">Upcoming Matches</h2>
            <UpcomingMatchesList
              matches={matches}
              expandedMatches={expandedMatches}
              onToggleExpand={handleToggleExpand}
              onMatchSelect={handleMatchSelect}
              onEditMatch={handleEditMatch}
              loading={loading}
              teamsCache={teamsCache}
              primaryTeamId={primaryTeamId}
            />
          </div>

          {/* Completed Matches Section */}
          <div className="matches-completed-section">
            <h2 className="section-title">Completed Matches</h2>
            <CompletedMatchesList
              matches={matches}
              expandedMatches={expandedCompletedMatches}
              onToggleExpand={handleToggleExpandCompleted}
              onMatchSelect={handleCompletedMatchSelect}
              onViewEvents={handleViewEvents}
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
