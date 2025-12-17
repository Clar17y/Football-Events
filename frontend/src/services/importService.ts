import apiClient from './api/baseApi';

/**
 * Helper to check if a user ID is a guest ID (format: "guest-...")
 */
export function isGuestId(id: string): boolean {
  return id != null && id.startsWith('guest-');
}

/**
 * Check if there is any guest data in local tables.
 * Checks: events, matches, teams, players, seasons, lineup, match_periods, match_state
 * Returns true if any record has `created_by_user_id` starting with 'guest-'
 * 
 * Requirements: 1.1
 */
export async function hasGuestData(): Promise<boolean> {
  const s = await getGuestDataSummary();
  return (
    s.seasons + s.teams + s.players + s.matches + s.events +
    s.lineups + s.matchPeriods + s.matchStates
  ) > 0;
}

export interface GuestDataSummary {
  seasons: number;
  teams: number;
  players: number;
  matches: number;
  events: number;
  lineups: number;
  matchPeriods: number;
  matchStates: number;
}

/**
 * Get a summary of guest data counts across all local tables.
 * Checks: events, matches, teams, players, seasons, lineup, match_periods, match_state
 * 
 * Requirements: 1.1
 */
export async function getGuestDataSummary(): Promise<GuestDataSummary> {
  try {
    const { db } = await import('../db/indexedDB');

    // Check all local tables for guest-formatted data
    const [
      allSeasons,
      allTeams,
      allPlayers,
      allMatches,
      allEvents,
      allLineups,
      allMatchPeriods,
      allMatchStates
    ] = await Promise.all([
      db.seasons.toArray(),
      db.teams.toArray(),
      db.players.toArray(),
      db.matches.toArray(),
      db.events.toArray(),
      db.lineup.toArray(),
      db.match_periods.toArray(),
      db.match_state.toArray(),
    ]);

    const seasons = allSeasons.filter(s => isGuestId(s.createdByUserId)).length;
    const teams = allTeams.filter(t => isGuestId(t.createdByUserId)).length;
    const players = allPlayers.filter(p => isGuestId(p.createdByUserId)).length;
    const matches = allMatches.filter(m => isGuestId(m.createdByUserId)).length;
    const events = allEvents.filter(e => isGuestId(e.createdByUserId)).length;
    const lineups = allLineups.filter(l => isGuestId(l.createdByUserId)).length;
    const matchPeriods = allMatchPeriods.filter(p => isGuestId(p.createdByUserId)).length;
    const matchStates = allMatchStates.filter(s => isGuestId(s.createdByUserId)).length;

    return {
      seasons,
      teams,
      players,
      matches,
      events,
      lineups,
      matchPeriods,
      matchStates,
    };
  } catch {
    return { seasons: 0, teams: 0, players: 0, matches: 0, events: 0, lineups: 0, matchPeriods: 0, matchStates: 0 };
  }
}

/**
 * Import result interface for tracking import progress and errors
 */
export interface ImportResult {
  success: boolean;
  importedCounts: {
    seasons: number;
    teams: number;
    players: number;
    matches: number;
    events: number;
    matchPeriods: number;
    matchStates: number;
    lineups: number;
  };
  errors: ImportError[];
}

export interface ImportError {
  table: string;
  recordId: string;
  error: string;
}

/**
 * Full import orchestrator: imports seasons, teams, players, matches, events, lineups, match periods, and match state.
 * 
 * Key changes from legacy implementation:
 * - Reads events from events table (not outbox) - Requirements: 1.2
 * - Reads match periods from match_periods table with preserved timestamps - Requirements: 1.3
 * - Reads match state from match_state table - Requirements: 1.4
 * - Uses new period import endpoint for periods with timestamp preservation
 * - Handles match state to trigger completion on server if needed
 * 
 * Requirements: 1.2, 1.3, 1.4
 */
export async function runImport(progress?: (p: { step: string; done: number; total: number }) => void): Promise<ImportResult> {
  const { db } = await import('../db/indexedDB');
  const { seasonsApi } = await import('./api/seasonsApi');
  const teamsApiModule = await import('./api/teamsApi');
  const playersApiModule = await import('./api/playersApi');
  const lineupsApiModule = await import('./api/lineupsApi');
  const matchesApiModule = await import('./api/matchesApi');
  const eventsApiModule = await import('./api/eventsApi');
  const defaultLineupsApiModule = await import('./api/defaultLineupsApi');
  const teamsApi = teamsApiModule.default || teamsApiModule.teamsApi;
  const playersApi = playersApiModule.default || playersApiModule.playersApi;
  const matchesApi = matchesApiModule.default || matchesApiModule.matchesApi;
  const eventsApi = eventsApiModule.default;
  const lineupsApi = lineupsApiModule.default || lineupsApiModule.lineupsApi;
  const defaultLineupsApi = defaultLineupsApiModule.default || defaultLineupsApiModule.defaultLineupsApi;

  const errors: ImportError[] = [];
  const importedCounts = {
    seasons: 0,
    teams: 0,
    players: 0,
    matches: 0,
    events: 0,
    matchPeriods: 0,
    matchStates: 0,
    lineups: 0,
  };

  // Get ALL guest data from local tables (any created_by_user_id starting with "guest-")
  // Requirements: 1.2 - Read events from events table (not outbox)
  // Requirements: 1.3 - Read match periods from match_periods table with preserved timestamps
  // Requirements: 1.4 - Read match state from match_state table
  const [
    allSeasons,
    allTeams,
    allPlayers,
    allMatches,
    allEvents,
    allLineups,
    allMatchPeriods,
    allMatchStates
  ] = await Promise.all([
    db.seasons.toArray(),
    db.teams.toArray(),
    db.players.toArray(),
    db.matches.toArray(),
    db.events.toArray(),
    db.lineup.toArray(),
    db.match_periods.toArray(),
    db.match_state.toArray(),
  ]);

  const seasons = allSeasons.filter(s => isGuestId(s.createdByUserId));
  const teams = allTeams.filter(t => isGuestId(t.createdByUserId));
  const players = allPlayers.filter(p => isGuestId(p.createdByUserId));
  const matches = allMatches.filter(m => isGuestId(m.createdByUserId));
  // Requirements: 1.2 - Read events from events table (not outbox)
  const events = allEvents.filter(e => isGuestId(e.createdByUserId));
  const lineups = allLineups.filter(l => isGuestId(l.createdByUserId));
  // Requirements: 1.3 - Read match periods from match_periods table with preserved timestamps
  const matchPeriods = allMatchPeriods.filter(p => isGuestId(p.createdByUserId));
  // Requirements: 1.4 - Read match state from match_state table
  const matchStates = allMatchStates.filter(s => isGuestId(s.createdByUserId));

  console.log(`[Import] Found guest data - Seasons: ${seasons.length}, Teams: ${teams.length}, Players: ${players.length}, Matches: ${matches.length}, Events: ${events.length}, Periods: ${matchPeriods.length}, States: ${matchStates.length}`);

  // Get all guest IDs for later cleanup
  const guestIds = new Set<string>();
  [...seasons, ...teams, ...players, ...matches, ...events, ...lineups, ...matchPeriods, ...matchStates].forEach(item => {
    if (isGuestId(item.createdByUserId)) {
      guestIds.add(item.createdByUserId);
    }
  });

  const total = seasons.length + teams.length + players.length + matches.length + events.length + matchPeriods.length + matchStates.length;
  let done = 0;

  const bump = (step: string) => progress?.({ step, done, total: Math.max(1, total) });

  // Determine primary team (most frequent home team, excluding isOpponent)
  // Note: primaryLocalTeam is available for future use if needed
  const primaryTeams = teams.filter((t: any) => !t.isOpponent);
  void (primaryTeams.length > 0 ? primaryTeams[0].id : null); // Suppress unused variable warning

  // Import seasons with proper year-based naming
  const seasonMap = new Map<string, string>(); // local -> server
  for (const s of seasons) {
    bump(`Importing season ${s.label}`);
    try {
      // Transform "Demo Season" to proper year-based name
      let label = s.label;
      if (label === 'Demo Season') {
        const year = new Date().getFullYear();
        label = `${year}-${year + 1} Season`;
      }
      const res = await seasonsApi.createSeason({
        label,
        startDate: (s as any).start_date || new Date().toISOString().slice(0, 10),
        endDate: (s as any).end_date || new Date().toISOString().slice(0, 10),
        isCurrent: !!(s as any).is_current,
        description: (s as any).description
      });
      const localId = (s as any).seasonId || (s as any).id;
      const serverId = (res.data as any)?.id || (res.data as any)?.seasonId;
      if (serverId) {
        seasonMap.set(localId, serverId);
      }
      importedCounts.seasons++;
    } catch (err) {
      errors.push({ table: 'seasons', recordId: s.seasonId || (s as any).id, error: String(err) });
    }
    done++;
  }

  // Import teams with colors and isOpponent flag
  const teamMap = new Map<string, string>(); // local -> server
  for (const t of teams) {
    bump(`Importing team ${t.name}`);
    try {
      const teamData: any = {
        name: t.name,
        homeKitPrimary: (t as any).colorPrimary,
        homeKitSecondary: (t as any).colorSecondary,
        awayKitPrimary: (t as any).awayColorPrimary,
        awayKitSecondary: (t as any).awayColorSecondary,
        logoUrl: (t as any).logoUrl,
        isOpponent: !!(t as any).isOpponent,
      };
      const res = await teamsApi.createTeam(teamData);
      teamMap.set(t.id as any, res.data.id);
      importedCounts.teams++;
    } catch (err) {
      errors.push({ table: 'teams', recordId: t.id, error: String(err) });
    }
    done++;
  }

  // Import players with team assignment mapping
  const playerMap = new Map<string, string>(); // local -> server
  for (const p of players) {
    bump(`Importing player ${p.fullName}`);
    try {
      const serverTeamId = p.currentTeam ? teamMap.get(p.currentTeam as any) : undefined;
      let res;
      if (serverTeamId) {
        res = await playersApi.createPlayerWithTeam({
          name: p.fullName,
          squadNumber: p.squadNumber,
          preferredPosition: p.preferredPos,
          teamId: serverTeamId
        } as any);
      } else {
        res = await playersApi.createPlayer({
          name: p.fullName,
          squadNumber: p.squadNumber,
          preferredPosition: p.preferredPos
        } as any);
      }
      playerMap.set(p.id as any, res.data.id);
      importedCounts.players++;
    } catch (err) {
      errors.push({ table: 'players', recordId: p.id, error: String(err) });
    }
    done++;
  }

  // Import default lineups from default_lineups table
  const allDefaultLineups = await db.default_lineups.filter((dl: any) => !dl.isDeleted).toArray();
  const guestDefaultLineups = allDefaultLineups.filter((dl: any) => isGuestId(dl.createdByUserId));
  
  for (const defaultLineup of guestDefaultLineups) {
    const serverTeamId = teamMap.get(defaultLineup.teamId);
    
    if (!serverTeamId) {
      console.warn(`[Import] Skipping default lineup - no server team ID for local team ${defaultLineup.teamId}`);
      continue;
    }
    
    bump(`Importing default lineup for team`);
    try {
      if (defaultLineup.formation && Array.isArray(defaultLineup.formation)) {
        // Map local player IDs to server player IDs
        const mappedFormation = defaultLineup.formation.map((p: any) => ({
          ...p,
          playerId: playerMap.get(p.playerId) || p.playerId
        }));
        
        await defaultLineupsApi.saveDefaultLineup({
          teamId: serverTeamId,
          formation: mappedFormation
        });
        console.log(`[Import] Successfully imported default lineup for team ${serverTeamId}`);
      }
    } catch (err) {
      console.error(`[Import] Failed to import default lineup for team ${defaultLineup.teamId}:`, err);
      errors.push({ table: 'default_lineups', recordId: defaultLineup.id, error: String(err) });
    }
  }

  // Import matches using regular creation (not quickStart) to avoid duplicate opponents
  const matchMap = new Map<string, string>(); // local match -> server match id
  for (const m of matches) {
    const home = await db.teams.get(m.homeTeamId);
    const away = await db.teams.get(m.awayTeamId);
    const homeName = home?.name || 'Home';
    const awayName = away?.name || 'Away';

    // Map local team IDs to server team IDs
    const serverHomeTeamId = teamMap.get(m.homeTeamId);
    const serverAwayTeamId = teamMap.get(m.awayTeamId);

    if (!serverHomeTeamId || !serverAwayTeamId) {
      console.warn(`[Import] Skipping match ${homeName} vs ${awayName} - missing team mappings`);
      errors.push({ table: 'matches', recordId: m.id, error: 'Missing team mappings' });
      done++;
      continue;
    }

    bump(`Importing match ${homeName} vs ${awayName}`);
    try {
      // Map local season ID to server season ID
      const serverSeasonId = seasonMap.get(m.seasonId);
      if (!serverSeasonId) {
        console.warn(`[Import] Skipping match ${homeName} vs ${awayName} - missing season mapping for ${m.seasonId}`);
        errors.push({ table: 'matches', recordId: m.id, error: 'Missing season mapping' });
        done++;
        continue;
      }

      // Use the regular matches API endpoint instead of quickStart to avoid duplicate opponents
      const response = await apiClient.post<any>('/matches', {
        seasonId: serverSeasonId,
        kickoffTime: m.kickoffTs,
        homeTeamId: serverHomeTeamId,
        awayTeamId: serverAwayTeamId,
        competition: m.competition,
        venue: m.venue,
        durationMinutes: m.durationMins,
        periodFormat: m.periodFormat || 'quarter',
        notes: m.notes,
      });
      const serverId = response.data.id || response.data.matchId;
      matchMap.set(m.id as any, serverId);
      importedCounts.matches++;
      console.log(`[Import] Created match ${serverId} (local: ${m.id}, home: ${homeName}, away: ${awayName})`);

      // Requirements: 1.3 - Import match periods from match_periods table with preserved timestamps
      // Get periods for this match from the match_periods table
      const periodsForMatch = matchPeriods.filter(p => p.matchId === m.id);
      
      if (periodsForMatch.length > 0) {
        // Start the match on server first
        try {
          await matchesApi.startMatch(serverId);
          console.log(`[Import] Started match ${serverId}`);
        } catch (err) {
          console.error(`[Import] Failed to start match ${serverId}:`, err);
        }

        // Import periods using the new import endpoint with preserved timestamps
        for (const period of periodsForMatch) {
          bump(`Importing period ${period.periodNumber} for match`);
          try {
            // Use the period import endpoint to preserve timestamps
            await apiClient.post(`/matches/${serverId}/periods/import`, {
              periodNumber: period.periodNumber,
              periodType: period.periodType || 'REGULAR',
              startedAt: new Date(period.startedAt).toISOString(),
              endedAt: period.endedAt ? new Date(period.endedAt).toISOString() : undefined,
              durationSeconds: period.durationSeconds,
            });
            importedCounts.matchPeriods++;
            console.log(`[Import] Imported period ${period.periodNumber} for match ${serverId} with preserved timestamps`);
          } catch (err) {
            console.error(`[Import] Failed to import period ${period.periodNumber}:`, err);
            errors.push({ table: 'match_periods', recordId: period.id, error: String(err) });
          }
          done++;
        }
      }

      // Requirements: 1.4 - Handle match state to trigger completion on server if needed
      // Get match state from match_state table
      const matchState = matchStates.find(s => s.matchId === m.id);
      
      if (matchState) {
        importedCounts.matchStates++;
        
        // If match was completed, complete it on server
        if (matchState.status === 'COMPLETED') {
          try {
            await matchesApi.completeMatch(serverId, {
              home: m.homeScore || 0,
              away: m.awayScore || 0
            });
            console.log(`[Import] Completed match ${serverId} with score ${m.homeScore}-${m.awayScore}`);
          } catch (err) {
            console.error(`[Import] Failed to complete match ${serverId}:`, err);
            errors.push({ table: 'match_state', recordId: matchState.matchId, error: String(err) });
          }
        }
      } else {
        // Fallback: Check legacy local_live_state settings for backwards compatibility
        const liveStateRec = await db.settings.get(`local_live_state:${m.id}`);
        if (liveStateRec?.value) {
          try {
            const liveState = JSON.parse(liveStateRec.value);
            const legacyPeriods = liveState.periods || [];
            const status = liveState.status;

            // If match was started but no periods in new table, use legacy periods
            if ((status === 'LIVE' || status === 'COMPLETED' || legacyPeriods.length > 0) && periodsForMatch.length === 0) {
              try {
                await matchesApi.startMatch(serverId);
                console.log(`[Import] Started match ${serverId} (from legacy state)`);
              } catch (err) {
                console.error(`[Import] Failed to start match ${serverId}:`, err);
              }

              // Start/end periods from legacy state
              for (let i = 0; i < legacyPeriods.length; i++) {
                const p = legacyPeriods[i];
                try {
                  const serverPeriod = await matchesApi.startPeriod(serverId, p.periodType || 'regular');
                  console.log(`[Import] Started period ${i + 1} for match ${serverId} (legacy)`);
                  if (p.endedAt) {
                    try {
                      await matchesApi.endPeriod(serverId, serverPeriod.id);
                      console.log(`[Import] Ended period ${i + 1} for match ${serverId} (legacy)`);
                    } catch (err) {
                      console.error(`[Import] Failed to end period ${i + 1}:`, err);
                    }
                  }
                } catch (err) {
                  console.error(`[Import] Failed to start period ${i + 1}:`, err);
                }
              }
            }

            // If match was completed, complete it
            if (status === 'COMPLETED') {
              try {
                await matchesApi.completeMatch(serverId, {
                  home: m.homeScore || 0,
                  away: m.awayScore || 0
                });
                console.log(`[Import] Completed match ${serverId} with score ${m.homeScore}-${m.awayScore} (legacy)`);
              } catch (err) {
                console.error(`[Import] Failed to complete match ${serverId}:`, err);
              }
            }
          } catch (err) {
            console.error(`[Import] Failed to process legacy live state for match ${serverId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[Import] Failed to create match ${homeName} vs ${awayName}:`, err);
      errors.push({ table: 'matches', recordId: m.id, error: String(err) });
    }
    done++;
  }

  // Requirements: 1.2 - Import events from events table (not outbox) with ID mapping
  for (const e of events) {
    const serverMatchId = matchMap.get(e.matchId);
    if (!serverMatchId) {
      console.warn(`[Import] Skipping event - no server match ID for local match ${e.matchId}`);
      errors.push({ table: 'events', recordId: e.id, error: 'No server match ID' });
      done++;
      continue;
    }
    bump(`Importing event ${e.kind}`);
    try {
      // Handle formation_change events specially - use the formation-changes endpoint
      if (e.kind === 'formation_change') {
        try {
          // Parse the formation data from notes field
          const notesData = JSON.parse(e.notes || '{}');
          const formation = notesData.formation;
          const reason = notesData.reason;
          
          if (formation && formation.players) {
            // Map local player IDs to server player IDs in the formation
            const mappedFormation = {
              players: formation.players.map((p: any) => ({
                ...p,
                id: playerMap.get(p.id) || p.id, // Use mapped ID if available
              }))
            };
            
            // Calculate startMin from clockMs
            const startMin = Math.floor((e.clockMs || 0) / 60000);
            
            await apiClient.post(`/matches/${serverMatchId}/formation-changes`, {
              startMin,
              formation: mappedFormation,
              reason
            });
            importedCounts.events++;
            console.log(`[Import] Successfully imported formation_change for match ${serverMatchId} at minute ${startMin}`);
          } else {
            console.warn(`[Import] Skipping formation_change - no formation data in notes`);
          }
        } catch (parseErr) {
          console.error(`[Import] Failed to parse/import formation_change:`, parseErr);
          errors.push({ table: 'events', recordId: e.id, error: String(parseErr) });
        }
        done++;
        continue;
      }
      
      // Regular events - use events API
      const serverTeamId = e.teamId ? teamMap.get(e.teamId) : undefined;
      const serverPlayerId = e.playerId ? playerMap.get(e.playerId) : undefined;
      await eventsApi.create({
        matchId: serverMatchId,
        kind: e.kind,
        periodNumber: e.periodNumber,
        clockMs: e.clockMs,
        teamId: serverTeamId,
        playerId: serverPlayerId,
        notes: e.notes,
        sentiment: e.sentiment || 0,
      } as any);
      importedCounts.events++;
      console.log(`[Import] Successfully imported event: ${e.kind} for match ${serverMatchId}`);
    } catch (err) {
      console.error(`[Import] Failed to import event ${e.kind}:`, err);
      errors.push({ table: 'events', recordId: e.id, error: String(err) });
    }
    done++;
  }

  console.log(`[Import] Imported ${importedCounts.events} events from local database`);

  // Import lineups
  for (const lineup of lineups) {
    const serverMatchId = matchMap.get(lineup.matchId);
    const serverPlayerId = playerMap.get(lineup.playerId);
    if (!serverMatchId || !serverPlayerId) {
      errors.push({ table: 'lineup', recordId: lineup.id, error: 'Missing match or player mapping' });
      continue;
    }
    bump(`Importing lineup entry`);
    try {
      await lineupsApi.create({
        matchId: serverMatchId,
        playerId: serverPlayerId,
        startMinute: lineup.startMin,
        endMinute: lineup.endMin,
        position: lineup.position,
      });
      importedCounts.lineups++;
    } catch (err) {
      console.warn('Failed to import lineup entry:', err);
      errors.push({ table: 'lineup', recordId: lineup.id, error: String(err) });
    }
  }

  progress?.({ step: 'Cleaning up local guest data', done, total });
  
  // Requirements: 1.5 - Clean up ALL guest data from all local tables to avoid duplicates
  await cleanupGuestData(db, guestIds, matches.map(m => m.id));

  progress?.({ step: 'Import complete!', done: total, total });
  console.log('[Import] Import completed successfully. All local data cleaned up.');
  console.log(`[Import] Summary - Seasons: ${importedCounts.seasons}, Teams: ${importedCounts.teams}, Players: ${importedCounts.players}, Matches: ${importedCounts.matches}, Events: ${importedCounts.events}, Periods: ${importedCounts.matchPeriods}, States: ${importedCounts.matchStates}, Lineups: ${importedCounts.lineups}`);
  
  if (errors.length > 0) {
    console.warn(`[Import] ${errors.length} errors occurred during import:`, errors);
  }

  console.log('[Import] Reloading page in 2 seconds to refresh data from server...');

  // Force a full page reload after a short delay to ensure frontend uses server data
  setTimeout(() => {
    window.location.reload();
  }, 2000);

  return {
    success: errors.length === 0,
    importedCounts,
    errors,
  };
}

/**
 * Clean up all guest data from local tables after successful import.
 * 
 * Requirements: 1.5 - Clear guest data from all local tables including match_periods and match_state
 * 
 * @param db Database instance
 * @param guestIds Set of guest user IDs to clean up
 * @param matchIds Array of local match IDs to delete
 */
async function cleanupGuestData(
  db: any,
  guestIds: Set<string>,
  matchIds: string[]
): Promise<void> {
  try {
    // Delete all records with guest-formatted IDs from all tables
    const guestIdArray = Array.from(guestIds);
    for (const guestId of guestIdArray) {
      // Core tables with createdByUserId index
      await db.teams.where('createdByUserId').equals(guestId).delete();
      await db.players.where('createdByUserId').equals(guestId).delete();
      await db.seasons.where('createdByUserId').equals(guestId).delete();
      
      // Events table doesn't have standalone created_by_user_id index, filter in memory
      const guestEvents = await db.events.filter((e: any) => e.created_by_user_id === guestId).toArray();
      if (guestEvents.length > 0) {
        const eventIds = guestEvents.map((e: any) => e.id);
        await db.events.bulkDelete(eventIds);
        console.log(`[Import] Deleted ${eventIds.length} events for guest ${guestId}`);
      }
      
      // Lineup table doesn't have standalone created_by_user_id index, filter in memory
      const guestLineups = await db.lineup.filter((l: any) => l.created_by_user_id === guestId).toArray();
      if (guestLineups.length > 0) {
        const lineupIds = guestLineups.map((l: any) => l.id);
        await db.lineup.bulkDelete(lineupIds);
        console.log(`[Import] Deleted ${lineupIds.length} lineup entries for guest ${guestId}`);
      }
      
      // Requirements: 1.5 - Clear match_periods records where created_by_user_id starts with 'guest-'
      await db.match_periods.where('created_by_user_id').equals(guestId).delete();
      
      // Requirements: 1.5 - Clear match_state records where created_by_user_id starts with 'guest-'
      await db.match_state.where('created_by_user_id').equals(guestId).delete();
      
      // Legacy outbox cleanup (for backwards compatibility during migration period)
      await db.outbox.where('created_by_user_id').equals(guestId).delete();
    }

    // CRITICAL: Delete ALL local matches to prevent ID conflicts
    // After import, the frontend should only use server data
    for (const matchId of matchIds) {
      try {
        await db.matches.delete(matchId);
        console.log(`[Import] Deleted local match ${matchId}`);
      } catch (err) {
        console.warn(`[Import] Failed to delete local match ${matchId}:`, err);
      }
    }

    // Clean up legacy live state settings (for backwards compatibility)
    const settings = await db.settings.toArray();
    for (const s of settings) {
      if (s.key.startsWith('local_live_state:') || s.key.startsWith('default_lineup:')) {
        await db.settings.delete(s.key);
        console.log(`[Import] Deleted legacy setting ${s.key}`);
      }
    }
    
    // Clean up default_lineups table for guest users
    for (const guestId of guestIdArray) {
      const guestDefaultLineups = await db.default_lineups.filter((dl: any) => dl.created_by_user_id === guestId).toArray();
      if (guestDefaultLineups.length > 0) {
        const ids = guestDefaultLineups.map((dl: any) => dl.id);
        await db.default_lineups.bulkDelete(ids);
        console.log(`[Import] Deleted ${ids.length} default lineups for guest ${guestId}`);
      }
    }

    // Clear temp outbox items (created by guest mode without user ID)
    try {
      const tempUserDeleted = await db.outbox.where('created_by_user_id').equals('temp-user-id').delete();
      if (tempUserDeleted > 0) {
        console.log(`[Import] Deleted ${tempUserDeleted} outbox items with temp-user-id`);
      }
    } catch (err) {
      console.error('[Import] Failed to delete temp-user-id outbox items:', err);
    }

    // Also clean up any match_commands that might be lingering in outbox
    try {
      const allOutbox = await db.outbox.toArray();
      const matchCommandIds = allOutbox
        .filter((item: any) => item.tableName === 'match_commands')
        .map((item: any) => item.id)
        .filter((id: any): id is number => id !== undefined);

      if (matchCommandIds.length > 0) {
        await db.outbox.bulkDelete(matchCommandIds);
        console.log(`[Import] Deleted ${matchCommandIds.length} match_commands from outbox`);
      }
    } catch (err) {
      console.error('[Import] Failed to delete match_commands from outbox:', err);
    }

    console.log('[Import] Guest data cleanup completed');
  } catch (err) {
    console.error('[Import] Error during cleanup:', err);
    throw err;
  }
}
