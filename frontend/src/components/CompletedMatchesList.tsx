import React, { useMemo } from 'react';
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
  eye
} from 'ionicons/icons';
import type { Match, Team } from '@shared/types';
import './MatchesListShared.css';
import { isHomeMatch as isHomeMatchFn, getMatchColors, formatMatchDateTime, getMatchResult, getPerspectiveScores } from './matchUtils';

interface CompletedMatchesListProps {
  matches: Match[];
  expandedMatches: Set<string>;
  onToggleExpand: (matchId: string) => void;
  onMatchSelect: (matchId: string) => void;
  onViewEvents?: (match: Match) => void;
  onDeleteMatch?: (match: Match) => void;
  loading?: boolean;
  teamsCache?: Map<string, Team>;
  primaryTeamId?: string;
}

const CompletedMatchesList: React.FC<CompletedMatchesListProps> = ({
  matches,
  expandedMatches,
  onToggleExpand,
  onMatchSelect,
  onViewEvents,
  onDeleteMatch,
  loading = false,
  teamsCache = new Map(),
  primaryTeamId
}) => {
  // Sort completed matches chronologically (most recent first)
  const completedMatches = useMemo(() => {
    return [...matches].sort((a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime());
  }, [matches]);

  

  // Render individual match item
  const renderMatchItem = (match: Match) => {
    const isExpanded = expandedMatches.has(match.id);
    const isHome = isHomeMatchFn(match, primaryTeamId);
    const { dateStr, timeStr } = formatMatchDateTime(new Date(match.kickoffTime), 'completed');
    const { ourTeamColor, opponentTeamColor, opponentUsingDefaults } = getMatchColors(match, primaryTeamId);
    const result = getMatchResult(match);

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
        className={`completed-match-item ${result.type}`}
        data-match-id={match.id}
        tabIndex={-1}
        onClick={() => onMatchSelect(match.id)}
      >
        {/* Result Indicator */}
        <div className={`match-result-indicator ${result.type}`} />

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
                  <div className="match-score">
                    {(() => { const s = getPerspectiveScores(match, primaryTeamId); return (
                    <span className={`score-display ${result.type}`}>
                      {s.our} - {s.opponent}
                    </span>
                    ); })()}
                    <span className={`result-indicator ${result.type}`}>
                      {result.type === 'win' ? 'W' : result.type === 'loss' ? 'L' : 'D'}
                    </span>
                  </div>
                  <div className="match-datetime">
                    <IonChip color="medium" className="date-chip">
                      <IonIcon icon={calendar} />
                      <span>{dateStr}</span>
                    </IonChip>
                    <IonChip color="medium" className="time-chip">
                      <IonIcon icon={time} />
                      <span>{timeStr}</span>
                    </IonChip>
                  </div>
                  
                  <IonIcon 
                    icon={isExpanded ? chevronUp : chevronDown} 
                    className="expand-chevron"
                  />
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
                      <span className="detail-value">{match.periodFormat}</span>
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
                      className="show-events-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewEvents) onViewEvents(match);
                      }}
                    >
                      <IonIcon icon={eye} slot="start" />
                      Show Match Events
                    </IonButton>
                  </IonCol>
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
      <div className="completed-matches-loading" data-testid="completed-matches-loading">
        <div className="loading-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-match-item" data-testid="skeleton-match-item">
              <div className="skeleton-header">
                <div className="skeleton-teams" />
                <div className="skeleton-score" />
                <div className="skeleton-datetime" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (completedMatches.length === 0) {
    return (
      <div className="completed-matches-empty">
        <IonIcon icon={trophy} className="empty-icon" />
        <h3 className="empty-title">No Completed Matches</h3>
        <p className="empty-subtitle">
          Completed matches will appear here after they've been played.
        </p>
      </div>
    );
  }

  return (
    <div className="completed-matches-list">
      {completedMatches.map(renderMatchItem)}
    </div>
  );
};

export default CompletedMatchesList;
