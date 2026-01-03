import React, { useMemo } from 'react';
import { formatPeriodFormat } from '../utils/formatters';
import {
  IonIcon,
  IonChip,
  IonButton,
  IonGrid,
  IonRow,
  IonCol
} from '@ionic/react';
import {
  chevronDown,
  chevronUp,
  calendar,
  time,
  location,
  football,
  stopwatch,
  trophy,
  create,
  play
} from 'ionicons/icons';
import type { Match, Team } from '@shared/types';
import './MatchesListShared.css';
import { isHomeMatch as isHomeMatchFn, getMatchColors, formatMatchDateTime } from './matchUtils';

interface UpcomingMatchesListProps {
  matches: Match[];
  expandedMatches: Set<string>;
  onToggleExpand: (matchId: string) => void;
  onMatchSelect: (matchId: string) => void;
  onEditMatch?: (match: Match) => void;
  onLiveMatch?: (match: Match) => void;
  onDeleteMatch?: (match: Match) => void;
  loading?: boolean;
  teamsCache?: Map<string, Team>;
  primaryTeamId?: string;
}

const UpcomingMatchesList: React.FC<UpcomingMatchesListProps> = ({
  matches,
  expandedMatches,
  onToggleExpand,
  onMatchSelect,
  onEditMatch,
  onLiveMatch,
  onDeleteMatch,
  loading = false,
  teamsCache = new Map(),
  primaryTeamId
}) => {
  // Sort upcoming matches chronologically (earliest first)
  const upcomingMatches = useMemo(() => {
    return [...matches].sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());
  }, [matches]);

  

  // Render individual match item
  const renderMatchItem = (match: Match) => {
    const isExpanded = expandedMatches.has(match.id);
    const isHome = isHomeMatchFn(match, primaryTeamId);
    const { dateStr, timeStr } = formatMatchDateTime(new Date(match.kickoffTime), 'upcoming');
    const { ourTeamColor, opponentTeamColor, opponentUsingDefaults } = getMatchColors(match, primaryTeamId);

    // Get team names with fallbacks - use isOpponent flag to determine which is ours
    const homeTeamName = match.homeTeam?.name || 'Home Team';
    const awayTeamName = match.awayTeam?.name || 'Away Team';
    
    // Determine our team and opponent based on isOpponent flag
    let ourTeamName: string;
    let opponentTeamName: string;
    
    if (match.homeTeam && !match.homeTeam.isOpponent) {
      // Our team is home
      ourTeamName = homeTeamName;
      opponentTeamName = awayTeamName;
    } else if (match.awayTeam && !match.awayTeam.isOpponent) {
      // Our team is away
      ourTeamName = awayTeamName;
      opponentTeamName = homeTeamName;
    } else {
      // Fallback to old logic if isOpponent flags are not available
      ourTeamName = isHome ? homeTeamName : awayTeamName;
      opponentTeamName = isHome ? awayTeamName : homeTeamName;
    }

    return (
      <div 
        key={match.id}
        className="upcoming-match-item"
        data-match-id={match.id}
        tabIndex={-1}
        onClick={() => onMatchSelect(match.id)}
      >
        {/* Match Header - Always Visible */}
        <div className="match-header" onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(match.id);
        }}>
          <IonGrid className="match-header-grid">
            <IonRow className="ion-align-items-center">
              <IonCol className="match-teams-col">
                <div className="match-teams">
                  <div className="team-info">
                    <div 
                      className="team-color-indicator"
                      style={{ backgroundColor: ourTeamColor }}
                    />
                    <span className="team-name our-team">{ourTeamName}</span>
                    <span className="match-location">{isHome ? '(H)' : '(A)'}</span>
                  </div>
                  <div className="match-vs">vs</div>
                  <div className="team-info">
                    <div 
                      className={`team-color-indicator ${opponentUsingDefaults ? 'transparent' : ''}`}
                      style={{ 
                        backgroundColor: opponentUsingDefaults ? 'transparent' : opponentTeamColor,
                        border: opponentUsingDefaults ? '1px solid var(--grassroots-surface-variant)' : undefined
                      }}
                    />
                    <span className="team-name opponent-team">{opponentTeamName}</span>
                  </div>
                </div>
              </IonCol>
              <IonCol size="auto" className="match-summary-col">
                <div className="match-summary">
                  <div className="match-datetime">
                    <IonChip color="medium" className="date-chip">
                      <IonIcon icon={calendar} />
                      <span>{dateStr}</span>
                    </IonChip>
                    <IonChip color="medium" className="time-chip">
                      <IonIcon icon={time} />
                      <span>{timeStr}</span>
                    </IonChip>
                    <IonIcon 
                      icon={isExpanded ? chevronUp : chevronDown} 
                      className="expand-chevron"
                    />
                  </div>
                </div>
              </IonCol>
            </IonRow>
          </IonGrid>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="match-details">
            <IonGrid className="details-info-grid">
              <IonRow>
                {match.venue && (
                  <IonCol size="12" sizeMd="6">
                    <div className="detail-item">
                      <IonIcon icon={location} className="detail-icon" />
                      <div className="detail-content">
                        <span className="detail-label">Venue</span>
                        <span className="detail-value">{match.venue}</span>
                      </div>
                    </div>
                  </IonCol>
                )}

                {match.competition && (
                  <IonCol size="12" sizeMd="6">
                    <div className="detail-item">
                      <IonIcon icon={trophy} className="detail-icon" />
                      <div className="detail-content">
                        <span className="detail-label">Competition</span>
                        <span className="detail-value">{match.competition}</span>
                      </div>
                    </div>
                  </IonCol>
                )}

                <IonCol size="12" sizeMd="6">
                  <div className="detail-item">
                    <IonIcon icon={stopwatch} className="detail-icon" />
                    <div className="detail-content">
                      <span className="detail-label">Duration</span>
                      <span className="detail-value">{match.durationMinutes} minutes</span>
                    </div>
                  </div>
                </IonCol>

                <IonCol size="12" sizeMd="6">
                  <div className="detail-item">
                    <IonIcon icon={football} className="detail-icon" />
                    <div className="detail-content">
                      <span className="detail-label">Format</span>
                      <span className="detail-value">{formatPeriodFormat(match.periodFormat)}</span>
                    </div>
                  </div>
                </IonCol>
              </IonRow>
            </IonGrid>

            {match.notes && (
              <div className="match-notes">
                <h4 className="notes-title">Notes</h4>
                <p className="notes-content">{match.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="match-actions">
              <IonGrid>
                <IonRow className="ion-justify-content-end">
                  <IonCol size="auto">
                    <IonButton
                      fill="outline"
                      size="small"
                      color="primary"
                      className="live-match-button"
                      onClick={(e) => { e.stopPropagation(); onLiveMatch && onLiveMatch(match); }}
                    >
                      <IonIcon icon={play} slot="start" />
                      Live Match
                    </IonButton>
                  </IonCol>
                  {onEditMatch && (
                    <IonCol size="auto">
                      <IonButton
                        fill="solid"
                        size="small"
                        color="emerald"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditMatch(match);
                        }}
                        className="edit-match-button"
                      >
                        <IonIcon icon={create} slot="start" />
                        Edit Match
                      </IonButton>
                    </IonCol>
                  )}
                  {onDeleteMatch && (
                    <IonCol size="auto">
                      <IonButton
                        fill="outline"
                        size="small"
                        color="danger"
                        onClick={(e) => { e.stopPropagation(); onDeleteMatch(match); }}
                      >
                        Delete Match
                      </IonButton>
                    </IonCol>
                  )}
                </IonRow>
              </IonGrid>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="upcoming-matches-loading" data-testid="upcoming-matches-loading">
        <div className="loading-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-match-item" data-testid="skeleton-match-item">
              <div className="skeleton-header">
                <div className="skeleton-teams" />
                <div className="skeleton-datetime" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (upcomingMatches.length === 0) {
    return (
      <div className="upcoming-matches-empty">
        <IonIcon icon={calendar} className="empty-icon" />
        <h3 className="empty-title">No Upcoming Matches</h3>
        <p className="empty-subtitle">
          Schedule your next match to see it appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="upcoming-matches-list">
      {upcomingMatches.map(renderMatchItem)}
    </div>
  );
};

export default UpcomingMatchesList;
