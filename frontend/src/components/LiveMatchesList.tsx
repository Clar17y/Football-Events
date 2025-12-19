import React, { useMemo } from 'react';
import {
  IonIcon,
  IonChip,
  IonButton,
  IonGrid,
  IonRow,
  IonCol
} from '@ionic/react';
import { flash, shieldCheckmark } from 'ionicons/icons';
import type { Match, MatchState, Team } from '@shared/types';
import './MatchesListShared.css';
import { isHomeMatch as isHomeMatchFn, getMatchColors, getPerspectiveScores } from './matchUtils';

interface LiveMatchesListProps {
  matches: Match[];
  statesMap: Map<string, MatchState>;
  onToggleExpand?: (matchId: string) => void;
  expandedMatches?: Set<string>;
  onMatchSelect: (matchId: string) => void;
  onOpenLive: (match: Match) => void;
  onDeleteMatch?: (match: Match) => void;
  loading?: boolean;
  teamsCache?: Map<string, Team>;
  primaryTeamId?: string;
}

const LiveMatchesList: React.FC<LiveMatchesListProps> = ({
  matches,
  statesMap,
  onToggleExpand,
  expandedMatches = new Set(),
  onMatchSelect,
  onOpenLive,
  onDeleteMatch,
  loading = false,
  teamsCache = new Map(),
  primaryTeamId
}) => {
  const liveMatches = useMemo(() => {
    return matches.sort((a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime());
  }, [matches]);

  if (loading) {
    return (
      <div className="completed-matches-loading" data-testid="live-matches-loading">
        <div className="loading-skeleton">
          {[1, 2].map(i => (
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

  if (liveMatches.length === 0) {
    return null;
  }

  const renderMatchItem = (match: Match) => {
    const isExpanded = expandedMatches.has(match.id);
    const isHome = isHomeMatchFn(match, primaryTeamId);
    const { ourTeamColor, opponentTeamColor, opponentUsingDefaults } = getMatchColors(match, primaryTeamId);
    const st = statesMap.get(match.id);
    const status = st?.status || 'LIVE';
    const { our, opponent } = getPerspectiveScores(match, primaryTeamId);

    // Determine team labels similar to other lists
    const homeTeamName = match.homeTeam?.name || 'Home Team';
    const awayTeamName = match.awayTeam?.name || 'Away Team';
    let ourTeamName: string; let opponentTeamName: string;
    if (match.homeTeam && !match.homeTeam.isOpponent) {
      ourTeamName = homeTeamName; opponentTeamName = awayTeamName;
    } else if (match.awayTeam && !match.awayTeam.isOpponent) {
      ourTeamName = awayTeamName; opponentTeamName = homeTeamName;
    } else {
      ourTeamName = isHome ? homeTeamName : awayTeamName;
      opponentTeamName = isHome ? awayTeamName : homeTeamName;
    }

    // Optional period label
    const periodLabel = (() => {
      if (!st) return '';
      const n = st.currentPeriod;
      const t = (st.currentPeriodType || 'REGULAR');
      if (t === 'EXTRA_TIME') return n ? `ET${n}` : 'ET';
      if (t === 'PENALTY_SHOOTOUT') return 'PENS';
      const fmt = (match.periodFormat || '').toLowerCase();
      if (fmt.includes('half')) return n === 1 ? '1st Half' : n === 2 ? '2nd Half' : (n ? `P${n}` : '');
      if (fmt.includes('quarter')) return n ? `Q${n}` : '';
      return n ? `P${n}` : '';
    })();

    return (
      <div
        key={match.id}
        className={`completed-match-item live`}
        data-match-id={match.id}
        tabIndex={-1}
        onClick={() => onMatchSelect(match.id)}
      >
        {/* No result indicator for live */}

        {/* Match Header */}
        <div className="match-header" onClick={(e) => { e.stopPropagation(); onToggleExpand && onToggleExpand(match.id); }}>
          <IonGrid className="match-header-grid">
            <IonRow className="ion-align-items-center">
              <IonCol className="match-teams-col">
                <div className="match-teams">
                  <div className="team-info">
                    <div className="team-color-indicator" style={{ backgroundColor: ourTeamColor }} />
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
                    <span className={`score-display live`}>{our} - {opponent}</span>
                  </div>
                  <div className="match-datetime">
                    <IonChip color={status === 'PAUSED' ? 'warning' : 'danger'} className="date-chip">
                      <IonIcon icon={status === 'PAUSED' ? shieldCheckmark : flash} />
                      <span>{periodLabel ? `${status} — ${periodLabel}` : status}</span>
                    </IonChip>
                    <IonButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); onOpenLive(match); }}>
                      Open Live
                    </IonButton>
                  </div>
                </div>
              </IonCol>
            </IonRow>
          </IonGrid>
        </div>

        {/* Expanded details match Completed style */}
        {isExpanded && (
          <div className="match-details">
            <IonGrid className="details-info-grid">
              <IonRow>
                {match.venue && (
                  <IonCol size="12" sizeMd="6">
                    <div className="detail-item">
                      <span className="detail-label">Venue</span>
                      <span className="detail-value">{match.venue}</span>
                    </div>
                  </IonCol>
                )}
                {match.competition && (
                  <IonCol size="12" sizeMd="6">
                    <div className="detail-item">
                      <span className="detail-label">Competition</span>
                      <span className="detail-value">{match.competition}</span>
                    </div>
                  </IonCol>
                )}
              </IonRow>
            </IonGrid>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="completed-matches-list">
      {liveMatches.map(renderMatchItem)}
    </div>
  );
};

export default LiveMatchesList;

