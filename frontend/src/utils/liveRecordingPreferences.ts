const KEY = 'live-recording-player-v1';
const MAX_ENTRIES = 24;
type Preference = { identity: string; teamId: string; playerId: string };
function read(): Preference[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 16_384) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((p): p is Preference => !!p && ['identity', 'teamId', 'playerId'].every(k => typeof p[k] === 'string' && p[k].length > 0 && p[k].length <= 200)).slice(-MAX_ENTRIES);
  } catch { return []; }
}
export function trackedPlayer(identity: string, teamId: string, roster: ReadonlyArray<{ id: string }>): string | null {
  const stored = read().find(p => p.identity === identity && p.teamId === teamId)?.playerId;
  return stored && roster.some(p => p.id === stored) ? stored : null;
}
export function rememberTrackedPlayer(identity: string, teamId: string, playerId: string | null): void {
  if (!identity || !teamId) return;
  const entries = read().filter(p => p.identity !== identity || p.teamId !== teamId);
  if (playerId) entries.push({ identity, teamId, playerId });
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch { /* Recording does not depend on storage. */ }
}
