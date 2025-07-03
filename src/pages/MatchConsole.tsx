import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonToast } from '@ionic/react';
import { play, pause, refresh, trash } from 'ionicons/icons';
import React, { useState, useEffect, useRef } from 'react';
import { useMatchContext } from '../contexts/MatchContext';
import { useTicker } from '../hooks/useTicker';
import EventModal from '../components/EventModal';
import { db } from '../db/indexedDB';
import { EVENT_METADATA } from '../types/events';
import type { EventKind } from '../types/events';
import { useToast } from '../contexts/ToastContext';

const pad = (n: number) => n.toString().padStart(2, '0');

// Use centralized event metadata
const EVENT_BUTTONS = Object.values(EVENT_METADATA);

const ANONYMOUS_PLAYER = { id: 'anon', full_name: 'Anonymous' };

const MatchConsole: React.FC = () => {
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEventKind, setSelectedEventKind] = useState<EventKind>('goal');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showTeamSelect, setShowTeamSelect] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const { clock, startClock, pauseClock, resetClock } = useMatchContext();
  const [eventLog, setEventLog] = useState<Array<{ kind: string; team: string; player: string; ts: number }>>([]);
  const { showSuccess, showError, clearAllToasts } = useToast();
  const handleEventSaved = (newEvent: { kind: string; team: string; player: string; ts: number }) => {
    setEventLog(prev => [newEvent, ...prev]);
    setShowToast(true);
  };

  const handleDeleteEvent = (eventIndex: number) => {
    // Get the event to delete
    const sortedEvents = [...eventLog].sort((a, b) => b.ts - a.ts);
    const eventToDelete = sortedEvents[eventIndex];
    
    if (!eventToDelete) return;

    // Clear any existing toasts to prevent stacking
    clearAllToasts();

    // Show confirmation toast with action buttons
    const eventMeta = EVENT_METADATA[eventToDelete.kind as EventKind];
    const teamObj = teams.find(t => t.id === eventToDelete.team);
    const teamName = teamObj ? teamObj.name : eventToDelete.team;
    const playerObj = teamObj?.players.find(p => p.id === eventToDelete.player);
    const playerName = playerObj ? playerObj.full_name : eventToDelete.player;
    
    showError(
      `Delete ${eventMeta?.label || eventToDelete.kind} by ${playerName} (${teamName})?`,
      {
        label: 'Delete',
        handler: () => confirmDeleteEvent(eventToDelete)
      },
      0 // Don't auto-dismiss
    );
  };

  const confirmDeleteEvent = async (eventToDelete: { kind: string; team: string; player: string; ts: number }) => {
    try {
      // Get all events from database to find the matching one
      const result = await db.getEnhancedMatchEvents('1');
      if (result.success && result.data) {
        // Find the database event that matches our display event
        const dbEvent = result.data.find(dbEvent => 
          dbEvent.kind === eventToDelete.kind &&
          dbEvent.team_id === eventToDelete.team &&
          dbEvent.player_id === eventToDelete.player &&
          dbEvent.clock_ms === eventToDelete.ts
        );

        if (dbEvent && dbEvent.id) {
          // Delete from database
          const deleteResult = await db.deleteEnhancedEvent(dbEvent.id);
          
          if (deleteResult.success) {
            // Refresh the event log
            await loadEventLog();
            showSuccess('Event deleted successfully');
          } else {
            throw new Error(deleteResult.error || 'Failed to delete event');
          }
        } else {
          throw new Error('Event not found in database');
        }
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      showError('Failed to delete event. Please try again.');
    }
  };

  const loadEventLog = async () => {
    try {
      const result = await db.getEnhancedMatchEvents('1');
      if (result.success && result.data) {
        setEventLog(
          result.data.map(log => ({
            kind: log.kind,
            team: log.team_id,
            player: log.player_id,
            ts: log.clock_ms,
          }))
        );
      } else if (!result.success) {
        console.warn('Failed to load match events:', result.error);
      }
    } catch (error) {
      console.error('Error loading match events:', error);
    }
  };

  useEffect(() => {
    loadEventLog();
  }, []);

  const eventsContainerRef = useRef<HTMLDivElement | null>(null);
  // After eventLog changes, scroll to top
  useEffect(() => {
    if (eventsContainerRef.current) {
      eventsContainerRef.current.scrollTop = 0;
    }
  }, [eventLog]);

  useTicker(1000);
  const elapsedMs = clock.running
    ? clock.offset_ms + Date.now() - (clock.start_ts ?? 0)
    : clock.offset_ms;

  const mm   = Math.floor(elapsedMs / 60000);
  const ss   = Math.floor((elapsedMs % 60000) / 1000);
  const time = `${pad(mm)}:${pad(ss)}`;

  const isZero   = elapsedMs === 0;
  const isRun    = clock.running;
  const handleToggle = () => (isRun ? pauseClock() : startClock());
  const toggleContent = isZero && !isRun
    ? <span style={{ color: 'white' }}>Kickoff</span>
    : <IonIcon icon={isRun ? pause : play} style={{ fontSize: '24px', color: 'white' }} />;

  // Add anonymous player to each team
  const ourTeam = { id: '1', name: 'Old Wilsonians', players: [
    { id: "1", full_name: "Zane", is_active: true }, 
    { id: "2", full_name: "Marco", is_active: true }, 
    { ...ANONYMOUS_PLAYER, is_active: true }
  ] };
  const oppTeam = { id: '2', name: 'Unity', players: [{ ...ANONYMOUS_PLAYER, is_active: true }] };
  const teams = [ourTeam, oppTeam];
  const currentMatchId = '1';
  const currentSeasonId = '2025'; // Replace with actual season id if available
  const currentPeriod = 1;

  // When an event is clicked, prompt for team selection
  const openEventModal = (eventKind: EventKind) => {
    setSelectedEventKind(eventKind);
    setShowTeamSelect(true);
  };

  // After team is selected, show the event modal
  const handleTeamSelect = (teamId: string) => {
    setSelectedTeamId(teamId);
    setShowTeamSelect(false);
    setShowEventModal(true);
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId)!;

  // Split buttons into logical groups for layout
  const positiveEvents = EVENT_BUTTONS.filter(e => e.category === 'positive');
  const neutralEvents  = EVENT_BUTTONS.filter(e => e.category === 'neutral');
  const negativeEvents = EVENT_BUTTONS.filter(e => e.category === 'negative');

  return (
    <IonPage data-testid="match-console">
      <IonHeader>
        <IonToolbar color="primary" className="ion-justify-content-between">
          <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IonButton
              shape="round"
              fill="clear"
              onClick={resetClock}
              slot="start"
            >
              <IonIcon icon={refresh} style={{ fontSize: '24px', color: 'white' }}/>
            </IonButton>
            <IonButton
              shape="round"
              fill="clear"
              onClick={handleToggle}
            >
              {toggleContent}
            </IonButton>
            <IonTitle style={{ margin: 0 }}>{time}</IonTitle>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" style={{ boxSizing: 'border-box', padding: 16, minHeight: '100vh' }}>
        <div style={{ margin: 8 }}>
          {/* Positive Events */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 16 }}>
            {positiveEvents.map((eventMeta) => (
              <IonButton key={eventMeta.kind} color={eventMeta.color} onClick={() => openEventModal(eventMeta.kind)} style={{ flex: '1 1 180px', minWidth: 140 }}>
                <IonIcon icon={eventMeta.icon} slot="start" style={{ marginRight: 8 }} />
                {eventMeta.label}
              </IonButton>
            ))}
          </div>
          {/* Neutral Events */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {neutralEvents.map((eventMeta) => (
              <IonButton key={eventMeta.kind} color={eventMeta.color} onClick={() => openEventModal(eventMeta.kind)} style={{ flex: '1 1 180px', minWidth: 140 }}>
                <IonIcon icon={eventMeta.icon} slot="start" style={{ marginRight: 8 }} />
                {eventMeta.label}
              </IonButton>
            ))}
          </div>
          {/* Negative Events */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {negativeEvents.map((eventMeta) => (
              <IonButton key={eventMeta.kind} color={eventMeta.color} onClick={() => openEventModal(eventMeta.kind)} style={{ flex: '1 1 180px', minWidth: 140 }}>
                <IonIcon icon={eventMeta.icon} slot="start" style={{ marginRight: 8 }} />
                {eventMeta.label}
              </IonButton>
            ))}
          </div>
        </div>

        {/* Team selector modal */}
        {showTeamSelect && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 250 }}>
              <h3>Select Team</h3>
              {teams.map(t => (
                <IonButton key={t.id} expand="block" onClick={() => handleTeamSelect(t.id)}>
                  {t.name}
                </IonButton>
              ))}
              <IonButton expand="block" color="medium" onClick={() => setShowTeamSelect(false)}>
                Cancel
              </IonButton>
            </div>
          </div>
        )}

        <IonToast
          isOpen={showToast}
          message="Event logged locally"
          duration={1500}
          onDidDismiss={() => setShowToast(false)}
        />

        {selectedTeamId && (
          <EventModal
            isOpen={showEventModal}
            onDidDismiss={() => { setShowEventModal(false); setSelectedTeamId(null); }}
            eventKind={selectedEventKind}
            team={selectedTeam}
            matchId={currentMatchId}
            seasonId={currentSeasonId}
            period={currentPeriod}
            defaultPlayerId="anon"
            onEventSaved={handleEventSaved}
          />
        )}

        {/* Events section at the bottom */}
        <div style={{
          marginTop: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
            <div style={{
              fontWeight: 500,
              fontSize: 18,
              marginBottom: 8,
              textAlign: 'center',
              letterSpacing: 1
            }}>
              Match Console - Match Events
            </div>
            <div 
              ref={eventsContainerRef}
              style={{
              width: '100%',
              maxWidth: 600,
              background: 'var(--ion-background-color, #fff)',
              borderRadius: 16,
              padding: 16,
              minHeight: 100,
              maxHeight: 320,
              overflowY: 'auto',
              boxShadow: '0 4px 16px 0 rgba(44,62,80,0.10), 0 1.5px 4px 0 rgba(44,62,80,0.08)',
              border: '1.5px solid var(--ion-color-light-shade, #e0e0e0)',
              transition: 'box-shadow 0.2s'
            }}>
              {eventLog.length === 0 && <div style={{ color: '#888', textAlign: 'center' }}>No events yet.</div>}
              {[...eventLog]
                .sort((a, b) => b.ts - a.ts)
                .map((ev, idx) => {
                  const eventMeta = EVENT_METADATA[ev.kind as EventKind];
                  const teamObj = teams.find(t => t.id === ev.team);
                  const teamName = teamObj ? teamObj.name : ev.team;
                  const playerObj = teamObj?.players.find(p => p.id === ev.player);
                  const playerName = playerObj ? playerObj.full_name : ev.player;
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 8,
                      padding: '6px 0',
                      borderBottom: idx !== eventLog.length - 1 ? '1px solid #f0f0f0' : 'none',
                      color: `var(--ion-color-${eventMeta?.color ?? 'medium'})`,
                      background: idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                    }}>
                      <IonIcon icon={eventMeta?.icon} style={{ marginRight: 10, fontSize: 20 }} />
                      <span style={{ fontWeight: 500, minWidth: 90 }}>{eventMeta?.label || ev.kind}</span>
                      <span style={{ marginLeft: 12, fontSize: 14, color: '#444', minWidth: 120 }}>
                        {teamName}
                      </span>
                      <span style={{ marginLeft: 12, fontSize: 14, color: '#666', minWidth: 100 }}>
                        {playerName}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                        {pad(Math.floor(ev.ts / 60000))}:{pad(Math.floor((ev.ts % 60000) / 1000))}
                      </span>
                      <IonButton 
                        fill="clear" 
                        size="small"
                        color="danger"
                        onClick={() => handleDeleteEvent(idx)}
                        style={{ 
                          marginLeft: 8, 
                          minWidth: 'auto',
                          '--padding-start': '4px',
                          '--padding-end': '4px',
                          opacity: 0.6
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                      >
                        <IonIcon icon={trash} style={{ fontSize: 16 }} />
                      </IonButton>
                    </div>
                  );
                })}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default MatchConsole;
