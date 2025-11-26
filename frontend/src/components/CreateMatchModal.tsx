/**
 * Create Match Modal Component
 * Beautiful form for creating new matches with team selection and validation
 */

import React, { useState, useEffect } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonInput,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonText,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonDatetime,
  IonTextarea
} from '@ionic/react';
import {
  close,
  checkmark,
  calendar,
  time,
  location,
  people,
  trophy,
  football
} from 'ionicons/icons';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs, { Dayjs } from 'dayjs';
import { matchesApi, type QuickStartPayload } from '../services/api/matchesApi';
import { teamsApi } from '../services/api/teamsApi';
import { seasonsApi } from '../services/api/seasonsApi';
import { useTeams } from '../hooks/useTeams';
import { useSeasons } from '../hooks/useSeasons';
import { useToast } from '../contexts/ToastContext';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import CreateTeamModal from './CreateTeamModal';
import type { Match, Team, Season } from '@shared/types';
import styles from './FormSection.module.css';
import { canCreateMatch } from '../utils/guestQuota';
import { authApi } from '../services/api/authApi';

interface CreateMatchModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  preselectedDate?: Date;
  onMatchCreated?: (match: Match) => void;
  editingMatch?: Match | null;
  onMatchUpdated?: (match: Match) => void;
}

interface FormData {
  myTeamId: string;
  opponentName: string;
  isHome: boolean;
  kickoffDate: Dayjs | null;
  kickoffTime: Dayjs | null;
  seasonId: string;
  competition: string;
  venue: string;
  durationMinutes: number;
  periodFormat: 'quarter' | 'half' | 'whole';
  notes: string;
}

interface FormErrors {
  myTeamId?: string;
  opponentName?: string;
  kickoffDate?: string;
  kickoffTime?: string;
  seasonId?: string;
  durationMinutes?: string;
}

const CreateMatchModal: React.FC<CreateMatchModalProps> = ({
  isOpen,
  onDidDismiss,
  preselectedDate,
  onMatchCreated,
  editingMatch,
  onMatchUpdated
}) => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [seasons, setSeasonsState] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  // Opponent search with debouncing
  const [opponentOptions, setOpponentOptions] = useState<string[]>([]);
  const {
    searchText: opponentText,
    setSearchText: setOpponentText,
    showSpinner: opponentLoading
  } = useDebouncedSearch({
    delay: 250,
    minLength: 2,
    onSearch: async (term: string) => {
      if (!term) {
        setOpponentOptions([]);
        return;
      }
      try {
        const list = await teamsApi.getOpponentTeams(term.trim());
        setOpponentOptions(list.map(t => t.name));
      } catch {
        setOpponentOptions([]);
      }
    }
  });

  const defaultKickoffIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
  const defaultMiddayTime = dayjs().hour(12).minute(0).second(0).millisecond(0);
  const [formData, setFormData] = useState<FormData>({
    myTeamId: '',
    opponentName: '',
    isHome: true,
    kickoffDate: dayjs(defaultKickoffIso),
    kickoffTime: defaultMiddayTime,
    seasonId: '',
    competition: '',
    venue: '',
    durationMinutes: 90,
    periodFormat: 'half',
    notes: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Initialize form data when editing a match
  useEffect(() => {
    if (editingMatch && isOpen) {
      const kickoffDate = dayjs(editingMatch.kickoffTime);
      const kickoffTime = dayjs(editingMatch.kickoffTime);
      
      // Determine which team is "my team" and which is opponent
      const isHomeMatch = editingMatch.homeTeam && !editingMatch.homeTeam.is_opponent;
      const myTeam = isHomeMatch ? editingMatch.homeTeam : editingMatch.awayTeam;
      const opponentTeam = isHomeMatch ? editingMatch.awayTeam : editingMatch.homeTeam;
      
      // Initialize opponent input text when editing so button enablement works
      setOpponentText(opponentTeam?.name || '');

      setFormData({
        myTeamId: myTeam?.id || '',
        opponentName: opponentTeam?.name || '',
        isHome: isHomeMatch,
        kickoffDate,
        kickoffTime,
        seasonId: editingMatch.seasonId,
        competition: editingMatch.competition || '',
        venue: editingMatch.venue || '',
        durationMinutes: editingMatch.durationMinutes,
        periodFormat: editingMatch.periodFormat as 'quarter' | 'half' | 'whole',
        notes: editingMatch.notes || ''
      });
    } else if (!editingMatch && isOpen) {
      // Reset form for new match
      const defaultKickoffIso = preselectedDate 
        ? preselectedDate.toISOString()
        : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
      const defaultMiddayTime = dayjs().hour(12).minute(0).second(0).millisecond(0);
      
      setFormData({
        myTeamId: '',
        opponentName: '',
        isHome: true,
        kickoffDate: dayjs(defaultKickoffIso),
        kickoffTime: defaultMiddayTime,
        seasonId: '',
        competition: '',
        venue: '',
        durationMinutes: 90,
        periodFormat: 'half',
        notes: ''
      });
    }
  }, [editingMatch, isOpen, preselectedDate]);

  // Load teams when modal opens
  useEffect(() => {
    const loadTeams = async () => {
      try {
        setTeamsLoading(true);
        const res = await teamsApi.getTeams({ page: 1, limit: 100 });
        setTeams(res.data || []);
        if (res.data && res.data.length && !formData.myTeamId) {
          setFormData(prev => ({ ...prev, myTeamId: res.data[0].id }));
        }
      } finally {
        setTeamsLoading(false);
      }
    };

    const loadSeasons = async () => {
      // Guests skip server seasons; creation handled locally in guest quick match flow
      if (!authApi.isAuthenticated()) {
        setSeasonsState([]);
        return;
      }
      try {
        setSeasonsLoading(true);
        const res = await seasonsApi.getSeasons({ page: 1, limit: 100 });
        setSeasonsState(res.data || []);

        // Find current season or create one if none exists
        const currentSeason = res.data?.find(s => s.isCurrent);
        if (currentSeason) {
          setFormData(prev => ({ ...prev, seasonId: currentSeason.id }));
        } else if (res.data && res.data.length === 0) {
          // Create a default season if none exists
          try {
            const newSeason = await seasonsApi.createSeason({
              label: `${new Date().getFullYear()}-${new Date().getFullYear() + 1} Season`,
              startDate: `${new Date().getFullYear()}-08-01`,
              endDate: `${new Date().getFullYear() + 1}-07-31`,
              isCurrent: true,
              description: 'Default season'
            });
            setSeasonsState([newSeason.data]);
            setFormData(prev => ({ ...prev, seasonId: newSeason.data.id }));
          } catch (error) {
            console.error('Failed to create default season:', error);
          }
        }
      } finally {
        setSeasonsLoading(false);
      }
    };

    if (isOpen) {
      loadTeams();
      loadSeasons();

      // Set preselected date if provided
      if (preselectedDate) {
        const preselectedDayjs = dayjs(preselectedDate);
        const defaultMiddayTime = dayjs().hour(12).minute(0).second(0).millisecond(0);
        setFormData(prev => ({
          ...prev,
          kickoffDate: preselectedDayjs,
          kickoffTime: defaultMiddayTime  // Always use midday time, not the preselected date's time
        }));
      }
    } else {
      // Reset form when modal closes
      const defaultKickoffIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
      const defaultMiddayTime = dayjs().hour(12).minute(0).second(0).millisecond(0);
      setFormData({
        myTeamId: '',
        opponentName: '',
        isHome: true,
        kickoffDate: dayjs(defaultKickoffIso),
        kickoffTime: defaultMiddayTime,
        seasonId: '',
        competition: '',
        venue: '',
        durationMinutes: 90,
        periodFormat: 'half',
        notes: ''
      });
      setOpponentText('');
      setErrors({});
      setTouched({});
    }
  }, [isOpen, preselectedDate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Team validation
    if (!formData.myTeamId) {
      newErrors.myTeamId = 'Please select your team';
    }

    if (!opponentText.trim()) {
      newErrors.opponentName = 'Opponent name is required';
    } else if (opponentText.trim().length < 2) {
      newErrors.opponentName = 'Opponent name must be at least 2 characters';
    }

    // Date/time validation
    if (!formData.kickoffDate) {
      newErrors.kickoffDate = 'Kickoff date is required';
    }

    if (!formData.kickoffTime) {
      newErrors.kickoffTime = 'Kickoff time is required';
    }

    // Season validation
    if (authApi.isAuthenticated() && !formData.seasonId) {
      newErrors.seasonId = 'Please select a season';
    }

    // Duration validation
    if (formData.durationMinutes < 1 || formData.durationMinutes > 300) {
      newErrors.durationMinutes = 'Duration must be between 1 and 300 minutes';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleInputBlur = (field: keyof FormData) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateForm();
  };

  const handleSubmit = async () => {
    // Mark all fields as touched
    const allFields = Object.keys(formData) as (keyof FormData)[];
    setTouched(allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}));

    if (!validateForm()) {
      return;
    }

    // Guest quota guard for matches
    if (!authApi.isAuthenticated() && !editingMatch) {
      try {
        const allowed = await canCreateMatch();
        if (!allowed.ok) {
          showToast({ message: allowed.reason || 'Guest limit reached: 1 match', severity: 'error' });
          return;
        }
      } catch {}
    }

    setLoading(true);

    try {
      // Merge date and time into ISO string
      const kickoffDateTime = (() => {
        const d = formData.kickoffDate || dayjs();
        const t = formData.kickoffTime || dayjs();
        const merged = d.hour(t.hour()).minute(t.minute()).second(0).millisecond(0);
        return merged.toDate().toISOString();
      })();

      let result: Match;

      if (editingMatch) {
        // Update existing match
        const updatePayload = {
          seasonId: formData.seasonId,
          kickoffTime: new Date(kickoffDateTime),
          competition: formData.competition || undefined,
          venue: formData.venue || undefined,
          durationMinutes: formData.durationMinutes,
          periodFormat: formData.periodFormat,
          notes: formData.notes || undefined
        };

        if (!authApi.isAuthenticated()) {
          const { db } = await import('../db/indexedDB');
          await db.matches.update(editingMatch.id, {
            season_id: updatePayload.seasonId,
            kickoff_ts: (updatePayload.kickoffTime as Date).toISOString(),
            competition: updatePayload.competition,
            venue: updatePayload.venue,
            duration_mins: updatePayload.durationMinutes,
            period_format: updatePayload.periodFormat,
            notes: updatePayload.notes,
            updated_at: Date.now()
          } as any);
          const updated = await db.matches.get(editingMatch.id);
          result = updated ? await (await import('../services/guestQuickMatch')).getLocalMatch(editingMatch.id) as any : editingMatch;
          showToast({ message: 'Match updated locally', severity: 'success' });
        } else {
          result = await matchesApi.updateMatch(editingMatch.id, updatePayload);
          showToast({ message: 'Match updated successfully', severity: 'success' });
        }
      } else {
        // Create new match
        const payload: QuickStartPayload = {
          myTeamId: formData.myTeamId,
          opponentName: opponentText.trim(),
          isHome: formData.isHome,
          kickoffTime: kickoffDateTime,
          seasonId: formData.seasonId,
          competition: formData.competition || undefined,
          venue: formData.venue || undefined,
          durationMinutes: formData.durationMinutes,
          periodFormat: formData.periodFormat,
          notes: formData.notes || undefined
        };

        if (!authApi.isAuthenticated()) {
          const { createLocalQuickMatch, getLocalMatch } = await import('../services/guestQuickMatch');
          const local = await createLocalQuickMatch(payload as any);
          result = local?.id ? await getLocalMatch(local.id) as any : undefined;
          showToast({ message: 'Match created locally', severity: 'success' });
        } else {
          result = await matchesApi.quickStart(payload);
          showToast({ message: 'Match created successfully', severity: 'success' });
        }
      }

      if (result) {
        if (editingMatch) {
          // For updates, just notify with the updated match
          if (onMatchUpdated) {
            onMatchUpdated(result);
          }
        } else {
          // For new matches, enrich with team objects using local knowledge
          try {
            const enriched = { ...result } as Match;
            const myTeam = teams.find(t => t.id === formData.myTeamId) || null;
            const opponentName = opponentText.trim();
            const isHomeSel = formData.isHome;

            // Attach MY TEAM object if available
            if (myTeam) {
              if (isHomeSel) {
                enriched.homeTeam = myTeam;
              } else {
                enriched.awayTeam = myTeam;
              }
            }

            // Attach OPPONENT team object with provided name if API did not include it
            const opponentId = isHomeSel ? enriched.awayTeamId : enriched.homeTeamId;
            if (opponentId && (!isHomeSel ? !enriched.homeTeam : !enriched.awayTeam)) {
              const opponentTeam: Team = {
                id: opponentId,
                name: opponentName,
                createdAt: new Date(),
                created_by_user_id: '',
                is_deleted: false,
                is_opponent: true
              } as Team;
              if (isHomeSel) {
                enriched.awayTeam = opponentTeam;
              } else {
                enriched.homeTeam = opponentTeam;
              }
            }

            // Notify parent component with enriched match
            if (onMatchCreated) {
              onMatchCreated(enriched);
            }
          } catch {
            // Fallback to raw result if enrichment fails for any reason
            if (onMatchCreated) {
              onMatchCreated(result);
            }
          }
        }

        // Reset form and close modal
        const defaultKickoffIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
        setFormData({
          myTeamId: '',
          opponentName: '',
          isHome: true,
          kickoffDate: dayjs(defaultKickoffIso),
          kickoffTime: defaultMiddayTime,
          seasonId: '',
          competition: '',
          venue: '',
          durationMinutes: 90,
          periodFormat: 'half',
          notes: ''
        });
        setOpponentText('');
        setErrors({});
        setTouched({});
        onDidDismiss();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create match';
      showToast({ message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form state
    const defaultKickoffIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
    const defaultMiddayTime = dayjs().hour(12).minute(0).second(0).millisecond(0);
    setFormData({
      myTeamId: '',
      opponentName: '',
      isHome: true,
      kickoffDate: dayjs(defaultKickoffIso),
      kickoffTime: defaultMiddayTime,
      seasonId: '',
      competition: '',
      venue: '',
      durationMinutes: 90,
      periodFormat: 'half',
      notes: ''
    });
    setOpponentText('');
    setErrors({});
    setTouched({});
    onDidDismiss();
  };



  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDidDismiss}
      className={styles.modal}
      data-theme="match"
    >
      <IonHeader>
        <IonToolbar color="emerald">
          <IonTitle>{editingMatch ? 'Edit Match' : 'Create New Match'}</IonTitle>
          <IonButton
            fill="clear"
            slot="end"
            onClick={handleCancel}
            disabled={loading}
            style={{ color: 'white' }}
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent className={styles.content}>
        <div className={styles.container}>
          {/* Teams Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={people} className={styles.sectionIcon} />
                Teams
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>My Team</label>
                      <div>
                        {teams.length > 0 ? (
                          <Autocomplete
                            options={teams}
                            getOptionLabel={(opt) => opt.name}
                            value={teams.find(t => t.id === formData.myTeamId) || null}
                            onChange={(_, val) => setFormData(prev => ({ ...prev, myTeamId: val?.id || '' }))}
                            loading={teamsLoading}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                placeholder="Select your team"
                                size="small"
                                className="quickstart-input"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                                InputProps={{
                                  ...params.InputProps,
                                  endAdornment: (
                                    <>
                                      {teamsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                                      {params.InputProps.endAdornment}
                                    </>
                                  ),
                                }}
                              />
                            )}
                            fullWidth
                          />
                        ) : (
                          <IonButton expand="block" onClick={() => setShowCreateTeam(true)}>Create Team</IonButton>
                        )}
                      </div>
                      {errors.myTeamId && touched.myTeamId && (
                        <IonText color="danger" className={styles.errorText}>
                          {errors.myTeamId}
                        </IonText>
                      )}
                    </div>
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Opponent Team</label>
                      <Autocomplete
                        freeSolo
                        options={opponentOptions}
                        loading={opponentLoading}
                        inputValue={opponentText}
                        onInputChange={(_, value) => setOpponentText(value)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Opponent team"
                            size="small"
                            className="quickstart-input"
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {opponentLoading ? <CircularProgress color="inherit" size={16} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        fullWidth
                      />
                      {errors.opponentName && touched.opponentName && (
                        <IonText color="danger" className={styles.errorText}>
                          {errors.opponentName}
                        </IonText>
                      )}
                    </div>
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Venue</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <IonButton fill={formData.isHome ? 'solid' : 'outline'} color="emerald" onClick={() => setFormData(prev => ({ ...prev, isHome: true }))}>Home</IonButton>
                        <IonButton fill={!formData.isHome ? 'solid' : 'outline'} color="emerald" onClick={() => setFormData(prev => ({ ...prev, isHome: false }))}>Away</IonButton>
                      </div>
                    </div>
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Match Details Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={calendar} className={styles.sectionIcon} />
                Match Details
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Kickoff *</label>
                      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
                        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr' }}>
                          <DatePicker
                            label="Date"
                            value={formData.kickoffDate}
                            onChange={(newVal) => setFormData(prev => ({ ...prev, kickoffDate: newVal }))}
                            slotProps={{ textField: { fullWidth: true, className: 'quickstart-input' } }}
                          />
                          <TimePicker
                            label="Time"
                            value={formData.kickoffTime}
                            onChange={(newVal) => setFormData(prev => ({ ...prev, kickoffTime: newVal }))}
                            slotProps={{ textField: { fullWidth: true, className: 'quickstart-input' } }}
                          />
                        </div>
                      </LocalizationProvider>
                      {(errors.kickoffDate || errors.kickoffTime) && (touched.kickoffDate || touched.kickoffTime) && (
                        <IonText color="danger" className={styles.errorText}>
                          {errors.kickoffDate || errors.kickoffTime}
                        </IonText>
                      )}
                    </div>
                  </IonCol>
                </IonRow>
                {authApi.isAuthenticated() && (
                  <IonRow>
                    <IonCol size="12">
                      <div className="form-row">
                        <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Season *</label>
                        <IonSelect
                          value={formData.seasonId}
                          onIonChange={(e) => setFormData(prev => ({ ...prev, seasonId: e.detail.value }))}
                          placeholder="Select season"
                          disabled={loading || seasonsLoading}
                          className={styles.formInput}
                        >
                          {seasons.map(season => (
                            <IonSelectOption key={season.id} value={season.id}>
                              {season.label} {season.isCurrent ? '(Current)' : ''}
                            </IonSelectOption>
                          ))}
                        </IonSelect>
                        {errors.seasonId && touched.seasonId && (
                          <IonText color="danger" className={styles.errorText}>
                            {errors.seasonId}
                          </IonText>
                        )}
                      </div>
                    </IonCol>
                  </IonRow>
                )}

                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Venue</label>
                      <IonInput
                        value={formData.venue}
                        onIonInput={(e) => setFormData(prev => ({ ...prev, venue: e.detail.value! }))}
                        placeholder="e.g., Wembley Stadium, Emirates, Home Ground"
                        disabled={loading}
                        className={styles.formInput}
                        style={{
                          '--background': 'transparent',
                          '--border-radius': 'var(--grassroots-radius-sm)',
                          '--border-color': 'var(--theme-surface-variant)',
                          '--border-style': 'solid',
                          '--border-width': '1px',
                          '--padding-start': 'var(--grassroots-space-sm)',
                          '--padding-end': 'var(--grassroots-space-sm)',
                          '--padding-top': 'var(--grassroots-space-xs)',
                          '--padding-bottom': 'var(--grassroots-space-xs)'
                        }}
                      />
                      <small style={{ color: 'var(--theme-on-surface-variant)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                        Optional - stadium name, ground name, or address where the match is played
                      </small>
                    </div>
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Match Format Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={football} className={styles.sectionIcon} />
                Match Format
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Duration (mins)</label>
                      <IonInput
                        type="number"
                        min={1}
                        max={200}
                        value={formData.durationMinutes}
                        onIonInput={(e) => setFormData(prev => ({ ...prev, durationMinutes: Number(e.detail.value!) || 90 }))}
                        disabled={loading}
                        className={styles.formInput}
                        style={{
                          '--background': 'transparent',
                          '--border-radius': 'var(--grassroots-radius-sm)',
                          '--border-color': 'var(--theme-surface-variant)',
                          '--border-style': 'solid',
                          '--border-width': '1px',
                          '--padding-start': 'var(--grassroots-space-sm)',
                          '--padding-end': 'var(--grassroots-space-sm)',
                          '--padding-top': 'var(--grassroots-space-xs)',
                          '--padding-bottom': 'var(--grassroots-space-xs)'
                        }}
                      />
                      {errors.durationMinutes && touched.durationMinutes && (
                        <IonText color="danger" className={styles.errorText}>
                          {errors.durationMinutes}
                        </IonText>
                      )}
                    </div>
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Periods</label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <IonButton fill={formData.periodFormat === 'quarter' ? 'solid' : 'outline'} color="emerald" onClick={() => setFormData(prev => ({ ...prev, periodFormat: 'quarter' }))}>Quarters</IonButton>
                        <IonButton fill={formData.periodFormat === 'half' ? 'solid' : 'outline'} color="emerald" onClick={() => setFormData(prev => ({ ...prev, periodFormat: 'half' }))}>Halves</IonButton>
                        <IonButton fill={formData.periodFormat === 'whole' ? 'solid' : 'outline'} color="emerald" onClick={() => setFormData(prev => ({ ...prev, periodFormat: 'whole' }))}>Whole</IonButton>
                      </div>
                    </div>
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Notes Section */}
          <IonCard className={styles.sectionCard}>
            <IonCardHeader className={styles.sectionHeader}>
              <IonCardTitle className={styles.sectionTitle}>
                <IonIcon icon={checkmark} className={styles.sectionIcon} />
                Additional Information
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent className={styles.sectionContent}>
              <IonGrid>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Competition</label>
                      <IonInput
                        value={formData.competition}
                        onIonInput={(e) => setFormData(prev => ({ ...prev, competition: e.detail.value! }))}
                        placeholder="e.g., Premier League, Cup Final, Tournament"
                        disabled={loading}
                        className={styles.formInput}
                        style={{
                          '--background': 'transparent',
                          '--border-radius': 'var(--grassroots-radius-sm)',
                          '--border-color': 'var(--theme-surface-variant)',
                          '--border-style': 'solid',
                          '--border-width': '1px',
                          '--padding-start': 'var(--grassroots-space-sm)',
                          '--padding-end': 'var(--grassroots-space-sm)',
                          '--padding-top': 'var(--grassroots-space-xs)',
                          '--padding-bottom': 'var(--grassroots-space-xs)'
                        }}
                      />
                      <small style={{ color: 'var(--theme-on-surface-variant)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                        Optional - specify the competition or tournament this match is part of
                      </small>
                    </div>
                  </IonCol>
                </IonRow>
                <IonRow>
                  <IonCol size="12">
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Notes</label>
                      <IonTextarea
                        value={formData.notes}
                        onIonInput={(e) => setFormData(prev => ({ ...prev, notes: e.detail.value! }))}
                        placeholder="Add any additional notes about this match..."
                        rows={3}
                        maxlength={500}
                        disabled={loading}
                        className={styles.formInput}
                        style={{
                          '--background': 'transparent',
                          '--border-radius': 'var(--grassroots-radius-sm)',
                          '--border-color': 'var(--theme-surface-variant)',
                          '--border-style': 'solid',
                          '--border-width': '1px',
                          '--padding-start': 'var(--grassroots-space-sm)',
                          '--padding-end': 'var(--grassroots-space-sm)',
                          '--padding-top': 'var(--grassroots-space-sm)',
                          '--padding-bottom': 'var(--grassroots-space-sm)'
                        }}
                      />
                      <small style={{ color: 'var(--theme-on-surface-variant)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                        Optional - any additional information about the match (max 500 characters)
                      </small>
                    </div>
                  </IonCol>
                </IonRow>
              </IonGrid>
            </IonCardContent>
          </IonCard>

          {/* Action Buttons */}
          <div className={styles.formActions}>
            <IonButton
              expand="block"
              fill="clear"
              onClick={handleCancel}
              disabled={loading}
              className={styles.cancelButton}
            >
              Cancel
            </IonButton>
            <IonButton
              expand="block"
              color="emerald"
              onClick={handleSubmit}
              disabled={loading || !formData.myTeamId || !opponentText.trim() || (authApi.isAuthenticated() && !formData.seasonId)}
              className={styles.submitButton}
            >
              {loading ? (
                <>
                  <IonSpinner name="crescent" />
                  <span style={{ marginLeft: '8px' }}>Creating...</span>
                </>
              ) : (
                <>
                  <IonIcon icon={checkmark} slot="start" />
                  {editingMatch ? 'Update Match' : 'Create Match'}
                </>
              )}
            </IonButton>
          </div>
        </div>

        {/* Create Team Modal */}
        <CreateTeamModal
          isOpen={showCreateTeam}
          onDidDismiss={() => setShowCreateTeam(false)}
          onCreated={(team) => {
            setTeams(prev => {
              const exists = prev.some(t => t.id === team.id);
              return exists ? prev.map(t => (t.id === team.id ? team : t)) : [team, ...prev];
            });
            setFormData(prev => ({ ...prev, myTeamId: team.id }));
            setShowCreateTeam(false);
          }}
        />
      </IonContent>
    </IonModal>
  );
};

export default CreateMatchModal;
