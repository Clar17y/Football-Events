export type LivePeriodType = 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
type Timestamp = string | number | Date | null;
export interface TimingPeriod {
  id: string;
  matchId: string;
  periodNumber: number;
  periodType?: string;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  durationSeconds?: number | null;
  isDeleted?: boolean;
  synced?: boolean;
}
export interface TimingState {
  status?: string;
  timerMs?: number;
  totalElapsedSeconds?: number;
  currentPeriodId?: string | null;
  lastUpdatedAt?: Timestamp;
  activeSince?: Timestamp;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
}
export interface TimingFormat { periodFormat?: string | null; durationMinutes?: number | null }

export function timestampMs(value?: Timestamp): number | undefined {
  if (value == null) return undefined;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
export function periodKey(p: TimingPeriod): string {
  return `${p.matchId}:${(p.periodType || 'REGULAR').toUpperCase()}:${p.periodNumber}`;
}
export function uniquePeriods<T extends TimingPeriod>(periods: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const p of periods) {
    if (p.isDeleted) continue;
    const existing = byKey.get(periodKey(p));
    if (!existing || (p.synced === false && existing.synced !== false)) byKey.set(periodKey(p), p);
  }
  return [...byKey.values()];
}
export function regularPeriodCount(format: TimingFormat): number {
  const fmt = (format.periodFormat || '').toLowerCase();
  return fmt.includes('quarter') ? 4 : fmt.includes('third') ? 3 : fmt.includes('whole') ? 1 : 2;
}
export function periodLengthMs(format: TimingFormat, type?: string): number {
  if (type === 'EXTRA_TIME') return 15 * 60_000;
  if (type === 'PENALTY_SHOOTOUT') return 0;
  const count = regularPeriodCount(format);
  const total = (format.durationMinutes || (count === 4 ? 48 : 90)) * 60_000;
  return total / count;
}
export function periodOffsetMs(format: TimingFormat, p: Pick<TimingPeriod, 'periodNumber' | 'periodType'>): number {
  const regulation = periodLengthMs(format) * regularPeriodCount(format);
  if (p.periodType === 'PENALTY_SHOOTOUT') return 0;
  if (p.periodType === 'EXTRA_TIME') return regulation + (p.periodNumber - 1) * periodLengthMs(format, 'EXTRA_TIME');
  return (p.periodNumber - 1) * periodLengthMs(format);
}
export function endedPlayedSeconds(periods: TimingPeriod[]): number {
  return uniquePeriods(periods).reduce((sum, p) => sum + (p.endedAt != null ? Math.max(0, p.durationSeconds || 0) : 0), 0);
}
export function activePlayedSeconds(displayMs: number, format: TimingFormat, p?: TimingPeriod): number {
  return p ? Math.floor(Math.max(0, displayMs - periodOffsetMs(format, p)) / 1000) : 0;
}
export function actualPlayedSeconds(displayMs: number, format: TimingFormat, periods: TimingPeriod[]): number {
  const list = uniquePeriods(periods);
  return endedPlayedSeconds(list) + activePlayedSeconds(displayMs, format, list.find(p => p.endedAt == null));
}
// Local timerMs has planned offsets; server totalElapsedSeconds contains only played time.
export function reconstructClock(state: TimingState | null | undefined, periods: TimingPeriod[], format: TimingFormat, now = Date.now()): number {
  if (!state) return 0;
  const list = uniquePeriods(periods);
  const open = list.find(p => p.id === state.currentPeriodId && p.endedAt == null) || list.find(p => p.endedAt == null);
  const anchor = timestampMs(state.lastUpdatedAt ?? state.activeSince ?? state.updatedAt ?? state.createdAt);
  const liveDelta = state.status === 'LIVE' && open ? Math.max(0, now - (anchor ?? timestampMs(open.startedAt) ?? now)) : 0;
  // An ended period can be durable before its final state write succeeds.
  // Its explicit played duration remains authoritative after reopening that match.
  const ended = list.filter(p => p.endedAt != null).sort((a, b) => (timestampMs(b.endedAt) || 0) - (timestampMs(a.endedAt) || 0))[0];
  if (state.status === 'LIVE' && !open && ended) return periodOffsetMs(format, ended) + Math.max(0, ended.durationSeconds || 0) * 1000;
  if (typeof state.timerMs === 'number' && Number.isFinite(state.timerMs)) return Math.max(0, state.timerMs) + liveDelta;
  if (open) {
    const played = typeof state.totalElapsedSeconds === 'number'
      ? Math.max(0, state.totalElapsedSeconds - endedPlayedSeconds(list)) * 1000
      : state.status === 'LIVE' ? Math.max(0, (anchor ?? now) - (timestampMs(open.startedAt) ?? now)) : 0;
    return periodOffsetMs(format, open) + played + liveDelta;
  }
  const last = list.slice().sort((a, b) => (timestampMs(b.startedAt) || 0) - (timestampMs(a.startedAt) || 0))[0];
  return last ? periodOffsetMs(format, last) + Math.max(0, last.durationSeconds || 0) * 1000 : 0;
}
export function formatLiveClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function formatEventMinute(ms: number, format: TimingFormat, period: Pick<TimingPeriod, 'periodNumber' | 'periodType'>): string {
  const clockMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const length = periodLengthMs(format, period.periodType);
  const expectedEnd = periodOffsetMs(format, period) + length;
  if (length > 0 && clockMs > expectedEnd) {
    return `${Math.floor(expectedEnd / 60_000)}'+${Math.floor((clockMs - expectedEnd) / 60_000)}'`;
  }
  return `${Math.floor(clockMs / 60_000)}'`;
}
