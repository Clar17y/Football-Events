/**
 * Helper utilities for building activity items from IndexedDB data.
 */

/**
 * Generate a friendly period label (Q1, 1st Half, etc.)
 */
export function getPeriodLabel(
    periodNumber: number,
    periodType: string,
    totalRegularPeriods: number
): string {
    if (periodType === 'REGULAR') {
        if (totalRegularPeriods >= 4) return `Q${periodNumber}`;
        if (totalRegularPeriods >= 2) {
            if (periodNumber === 1) return '1st Half';
            if (periodNumber === 2) return '2nd Half';
            return `Half ${periodNumber}`;
        }
    } else if (periodType === 'EXTRA_TIME') {
        return `Extra Time ${periodNumber}`;
    } else if (periodType === 'PENALTY_SHOOTOUT') {
        return 'Penalty Shootout';
    }
    return `Period ${periodNumber}`;
}

/**
 * Format event time as minute notation (45', 90'+2, PK)
 */
export function formatEventTime(
    clockMs: number,
    periodType: string,
    totalRegularPeriods: number
): string {
    const ms = Math.max(0, clockMs || 0);
    const minute = Math.floor(ms / 60000);

    if (periodType === 'PENALTY_SHOOTOUT') return 'PK';

    let regLen = 0;
    if (periodType === 'EXTRA_TIME') {
        regLen = 15;
    } else if (periodType === 'REGULAR') {
        if (totalRegularPeriods >= 4) regLen = 15; // quarters
        else if (totalRegularPeriods >= 2) regLen = 45; // halves
    }

    if (regLen > 0 && minute > regLen) {
        const added = minute - regLen;
        return `${regLen}'+${added}`;
    }
    return `${minute}'`;
}

interface EventTitleParams {
    kind: string;
    playerName?: string;
    teamName?: string;
    opponentName?: string;
    sentiment?: number;
}

/**
 * Build a descriptive title for an event child item
 */
export function buildEventTitle(params: EventTitleParams): string {
    const { kind, playerName, teamName, opponentName, sentiment = 0 } = params;
    const high = sentiment >= 3;

    switch (kind) {
        case 'goal':
            if (playerName && teamName && opponentName)
                return `${high ? 'Great goal' : 'Goal'}! ${playerName} for ${teamName} vs ${opponentName}.`;
            if (teamName && opponentName)
                return `${high ? 'Great goal' : 'Goal'}! ${teamName} vs ${opponentName}.`;
            return `${high ? 'Great goal' : 'Goal'}!`;
        case 'own_goal':
            if (playerName && opponentName) return `Own goal! ${playerName} into ${opponentName}'s net.`;
            if (teamName) return `Own goal by ${teamName}.`;
            return 'Own goal!';
        case 'assist':
            if (playerName && teamName) return `Assist: ${playerName} for ${teamName}.`;
            if (teamName) return `Assist for ${teamName}.`;
            return 'Assist recorded.';
        case 'save':
            if (playerName && teamName) return `Big save by ${playerName} for ${teamName}.`;
            if (teamName) return `Big save for ${teamName}.`;
            return 'Big save.';
        case 'penalty':
            return teamName ? `Penalty to ${teamName}.` : 'Penalty awarded.';
        case 'free_kick':
            return teamName ? `Free kick to ${teamName}.` : 'Free kick awarded.';
        case 'key_pass':
            if (playerName && teamName) return `Key pass by ${playerName} for ${teamName}.`;
            if (teamName) return `Key pass for ${teamName}.`;
            return 'Key pass.';
        case 'interception':
            if (playerName && teamName) return `${playerName} breaks up play for ${teamName}.`;
            if (teamName) return `Interception for ${teamName}.`;
            return 'Interception.';
        case 'tackle':
            if (playerName && teamName) return `${playerName} with a strong tackle for ${teamName}.`;
            if (teamName) return `Strong tackle for ${teamName}.`;
            return 'Strong tackle.';
        case 'foul':
            if (playerName) return `Foul by ${playerName}.`;
            if (teamName) return `Foul by ${teamName}.`;
            return 'Foul committed.';
        case 'yellow_card':
            if (playerName) return `Yellow card for ${playerName}.`;
            return 'Yellow card shown.';
        case 'red_card':
            if (playerName) return `Red card for ${playerName}.`;
            return 'Red card shown.';
        case 'shot_on':
            if (playerName && teamName) return `Shot on target by ${playerName} for ${teamName}.`;
            if (teamName) return `Shot on target for ${teamName}.`;
            return 'Shot on target.';
        case 'shot_off':
            if (playerName && teamName) return `Shot off target by ${playerName} for ${teamName}.`;
            if (teamName) return `Shot off target for ${teamName}.`;
            return 'Shot off target.';
        default:
            return `${kind.replace(/_/g, ' ')}.`;
    }
}

/**
 * Set of event kinds that should be included in period summaries
 */
export const ALLOWED_EVENT_KINDS = new Set([
    'goal', 'own_goal', 'assist', 'save', 'interception', 'tackle',
    'foul', 'penalty', 'free_kick', 'key_pass', 'shot_on', 'shot_off',
    'yellow_card', 'red_card'
]);

/**
 * Check if a penalty event should be suppressed (followed by goal within 60s)
 */
export function shouldSuppressPenalty(
    penaltyEvent: { kind: string; createdAt: string },
    events: Array<{ kind: string; createdAt: string }>
): boolean {
    if (penaltyEvent.kind !== 'penalty') return false;

    const penaltyTime = new Date(penaltyEvent.createdAt).getTime();

    for (const ev of events) {
        const evTime = new Date(ev.createdAt).getTime();
        const dt = evTime - penaltyTime;
        if (dt > 60 * 1000) break; // Beyond 60s window
        if (dt > 0 && ev.kind === 'goal') return true;
    }

    return false;
}
