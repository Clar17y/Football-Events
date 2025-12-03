import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonCard, IonCardContent, IonSelect, IonSelectOption, IonText, IonSpinner } from '@ionic/react';
import { VisualPitchInterface, PlayerSelectionPanel, PlayerWithPosition, FormationData, PitchPosition } from './index';
import formationsApi, { FormationDataDTO } from '../../services/api/formationsApi';
import { defaultLineupsApi } from '../../services/api/defaultLineupsApi';
import teamsApi from '../../services/api/teamsApi';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  selectedTeamId: string;
  currentMinute?: number;
  onFormationChanged?: () => void;
};

const REASONS = ['Starting Lineup Adjustment', 'Playtime rotation', 'Injury', 'Formation Change', 'Power play', 'Power play x2'];

const LineupManagementModal: React.FC<Props> = ({ isOpen, onClose, matchId, selectedTeamId, currentMinute = 0, onFormationChanged }) => {
  const [loading, setLoading] = useState(false);
  const [roster, setRoster] = useState<PlayerWithPosition[]>([]);
  const [formation, setFormation] = useState<FormationData>({ players: [] });
  const [reason, setReason] = useState<string>('Playtime rotation');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const [teamRes, curr] = await Promise.all([
          selectedTeamId ? teamsApi.getTeamPlayers(selectedTeamId) : Promise.resolve({ data: [] }),
          matchId ? formationsApi.getCurrent(matchId) : Promise.resolve(null)
        ]);
        const players: PlayerWithPosition[] = (teamRes?.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          squadNumber: p.squadNumber,
          preferredPosition: p.preferredPosition,
        }));
        setRoster(players);
        if (curr && Array.isArray(curr.players) && curr.players.length > 0) {
          // Merge names from roster if missing
          const mappedPlayers: PlayerWithPosition[] = curr.players.map((fp: any) => ({
            id: fp.id,
            name: fp.name || players.find(pp => pp.id === fp.id)?.name || 'Player',
            squadNumber: fp.squadNumber ?? players.find(pp => pp.id === fp.id)?.squadNumber,
            preferredPosition: fp.preferredPosition ?? players.find(pp => pp.id === fp.id)?.preferredPosition,
            position: { x: fp.position?.x || 0, y: fp.position?.y || 0 }
          }));
          setFormation({ players: mappedPlayers });
        } else {
          // Fallback to default lineup for the selected team (pre‑kickoff case)
          if (selectedTeamId) {
            try {
              const dl = await defaultLineupsApi.getDefaultLineup(selectedTeamId);
              if (dl && Array.isArray(dl.formation)) {
                const mapped: PlayerWithPosition[] = dl.formation.map(fp => ({
                  id: fp.playerId,
                  name: players.find(p => p.id === fp.playerId)?.name || 'Player',
                  squadNumber: players.find(p => p.id === fp.playerId)?.squadNumber,
                  preferredPosition: players.find(p => p.id === fp.playerId)?.preferredPosition,
                  position: { x: fp.pitchX, y: fp.pitchY }
                }));
                setFormation({ players: mapped });
              } else {
                setFormation({ players: [] });
              }
            } catch {
              setFormation({ players: [] });
            }
          } else {
            setFormation({ players: [] });
          }
        }
      } catch (e) {
        console.warn('Failed to load formation/roster', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, matchId, selectedTeamId]);

  const onPlayerMove = useCallback((playerId: string, position: PitchPosition) => {
    setFormation(prev => ({
      players: prev.players.map(p => p.id === playerId ? { ...p, position } : p)
    }));
  }, []);

  const onPlayerRemove = useCallback((playerId: string) => {
    setFormation(prev => ({ players: prev.players.filter(p => p.id !== playerId) }));
  }, []);

  const addPlayerToFormation = useCallback((player: PlayerWithPosition) => {
    setFormation(prev => {
      if (prev.players.find(p => p.id === player.id)) return prev;
      return { players: [...prev.players, { ...player, position: { x: 50, y: 50 } }] };
    });
  }, []);

  const removePlayerFromPanel = useCallback((player: PlayerWithPosition) => {
    setFormation(prev => ({ players: prev.players.filter(p => p.id !== player.id) }));
  }, []);

  const applyChanges = async () => {
    try {
      setApplying(true);
      const dto: FormationDataDTO = {
        players: formation.players.map(p => ({ id: p.id, name: p.name, squadNumber: p.squadNumber, preferredPosition: p.preferredPosition, position: { x: p.position?.x || 0, y: p.position?.y || 0 } }))
      };
      await formationsApi.applyChange(matchId, currentMinute || 0, dto, reason);
      formationsApi.setCached(matchId, dto);
      try { (window as any).__toastApi?.current?.showSuccess?.('Formation updated'); } catch {}

      // Notify parent to reload events/timeline
      if (onFormationChanged) {
        onFormationChanged();
      }

      onClose();
    } catch (e: any) {
      console.error('Apply formation failed', e);
      try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to apply changes'); } catch {}
    } finally {
      setApplying(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Team Changes</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IonSpinner name="crescent" />
              <IonText>Loading current formation…</IonText>
            </div>
          ) : (
            <>
              <IonCard>
                <IonCardContent>
                  <VisualPitchInterface
                    players={roster}
                    formation={formation}
                    onPlayerMove={onPlayerMove}
                    onPlayerRemove={onPlayerRemove}
                    maxPlayers={11}
                  />
                </IonCardContent>
              </IonCard>
              <IonCard>
                <IonCardContent>
                  <PlayerSelectionPanel
                    players={roster}
                    onPlayerSelect={addPlayerToFormation}
                    onPlayerRemove={removePlayerFromPanel}
                    selectedPlayers={new Set(formation.players.map(p => p.id))}
                  />
                </IonCardContent>
              </IonCard>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px 12px' }}>
                <IonSelect interface="popover" value={reason} onIonChange={e => setReason(e.detail.value)} label="Reason" labelPlacement="stacked">
                  {REASONS.map(r => (
                    <IonSelectOption key={r} value={r}>{r}</IonSelectOption>
                  ))}
                </IonSelect>
                <IonButton 
                  color="primary" 
                  fill="solid" 
                  strong
                  onClick={applyChanges} 
                  style={{ marginLeft: 'auto' }}
                  disabled={applying || !matchId || formation.players.length === 0}
                >
                  {applying ? 'Applying…' : 'Apply Changes'}
                </IonButton>
              </div>
            </>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
};

export default LineupManagementModal;
