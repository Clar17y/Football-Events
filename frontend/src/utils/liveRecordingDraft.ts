import type { LivePeriodType } from './liveMatchTiming';

export interface RecordingDraft {
  readonly id: string;
  readonly identity: string;
  readonly matchId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly periodId: string;
  readonly periodNumber: number;
  readonly periodType: LivePeriodType;
  readonly kind: string;
  readonly clockMs: number;
}
export function captureRecordingDraft(input: RecordingDraft): Readonly<RecordingDraft> {
  return Object.freeze({ ...input, clockMs: Math.floor(Math.max(0, input.clockMs)) });
}
export function isCurrentDraft(draft: RecordingDraft, current: RecordingDraft | null, matchId: string | undefined, identity: string): boolean {
  return current?.id === draft.id && draft.matchId === matchId && draft.identity === identity;
}

// Events have a shared period number but special phases restart numbering.
// Keep the captured phase with the event using its existing optional notes field.
export function recordingNotes(draft: RecordingDraft): string {
  return JSON.stringify({ recording: { version: 1, periodId: draft.periodId, periodType: draft.periodType } });
}

export function readRecordingPeriod(notes?: string): { periodId: string; periodType: LivePeriodType } | undefined {
  if (!notes || notes.length > 2048) return undefined;
  try {
    const value = JSON.parse(notes)?.recording;
    if (value?.version !== 1 || typeof value.periodId !== 'string' || !value.periodId || value.periodId.length > 200) return undefined;
    if (value.periodType === 'REGULAR' || value.periodType === 'EXTRA_TIME' || value.periodType === 'PENALTY_SHOOTOUT') {
      return { periodId: value.periodId, periodType: value.periodType };
    }
  } catch { /* Existing free-text notes are valid and do not carry recording metadata. */ }
  return undefined;
}
