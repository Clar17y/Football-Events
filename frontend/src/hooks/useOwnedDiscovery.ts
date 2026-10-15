import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api/authApi';
import { getAuthUserId, getCurrentUserId } from '../utils/network';
import { isCurrentOwnedMatch } from '../services/dataLayer';
import { db } from '../db/indexedDB';
import type { DbMatch, DbTeam, DbMatchState } from '../db/schema';

type Ownership = Parameters<typeof isCurrentOwnedMatch>[0];
const legacyOwners = ['server', 'authenticated-user', 'local-user'];

export function isOwnedDiscoveryRow(row: Ownership, ownerId: string | null): boolean {
    return !!ownerId && isCurrentOwnedMatch(row, ownerId);
}

// Legacy attribution is a read projection below a proven account-owned match only.
export function isOwnedRecordingRow(row: Ownership, parent: Ownership, ownerId: string | null): boolean {
    if (!ownerId || !isCurrentOwnedMatch(parent, ownerId)) return false;
    return isCurrentOwnedMatch(row, ownerId) || (!ownerId.startsWith('guest-') &&
        legacyOwners.some(alias => isCurrentOwnedMatch(row, alias)));
}

export function useDiscoveryActor() {
    const { user, isAuthenticated } = useAuth();
    const resolveOwner = () => {
        const subject = getAuthUserId();
        if (subject || authApi.isAuthenticated() || isAuthenticated || user) {
            return subject && user?.id === subject ? subject : null;
        }
        return getCurrentUserId();
    };
    const ownerId = resolveOwner();
    const sessionKey = `${ownerId ?? 'unresolved'}:${authApi.getSessionGeneration()}`;
    const current = useRef({ ownerId, sessionKey });
    current.current = { ownerId, sessionKey };
    const isCurrent = () => !!ownerId && current.current.sessionKey === sessionKey &&
        resolveOwner() === ownerId && `${ownerId}:${authApi.getSessionGeneration()}` === sessionKey;
    return { ownerId, sessionKey, isCurrent };
}

const emptyMatches: DbMatch[] = [];
const emptyTeams: DbTeam[] = [];
const emptyStates: DbMatchState[] = [];

export function useOwnedDiscovery() {
    const actor = useDiscoveryActor();
    const { ownerId, sessionKey } = actor;
    const projection = useLiveQuery(async () => {
        if (!ownerId) return { sessionKey, matches: emptyMatches, teams: emptyTeams, matchStates: emptyStates };
        const [rawMatches, rawTeams, rawStates] = await Promise.all([
            db.matches.toArray(), db.teams.toArray(), db.matchState.toArray()
        ]);
        const matches = rawMatches.filter(row => isOwnedDiscoveryRow(row, ownerId));
        const parents = new Map(matches.map(row => [row.id, row]));
        return {
            sessionKey,
            matches,
            teams: rawTeams.filter(row => isOwnedDiscoveryRow(row, ownerId)),
            matchStates: rawStates.filter(row => isOwnedRecordingRow(row, parents.get(row.matchId), ownerId))
        };
    }, [sessionKey]);
    const visible = projection?.sessionKey === sessionKey ? projection : undefined;
    const currentMatches = useRef(emptyMatches);
    currentMatches.current = visible?.matches ?? emptyMatches;
    const canAccessMatch = (id: string) => actor.isCurrent() &&
        currentMatches.current.some(row => row.id === id && isOwnedDiscoveryRow(row, ownerId));
    return {
        ...actor,
        matches: visible?.matches ?? emptyMatches,
        teams: visible?.teams ?? emptyTeams,
        matchStates: visible?.matchStates ?? emptyStates,
        loading: !!ownerId && !visible,
        canAccessMatch
    };
}
