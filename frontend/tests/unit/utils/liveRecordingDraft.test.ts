import { describe, expect, it } from 'vitest';
import { captureRecordingDraft, isCurrentDraft, recordingNotes, readRecordingPeriod } from '../../../src/utils/liveRecordingDraft';
describe('recording draft', () => {
  const input = { id: 'd1', identity: 'guest-a', matchId: 'match-a', teamId: 'home', teamName: 'Home', periodId: 'p1', periodNumber: 1, periodType: 'REGULAR' as const, kind: 'goal', clockMs: 10_999.9 };
  it('copies and freezes every recording input before delayed player selection', () => {
    const draft = captureRecordingDraft(input);
    const mutable = { ...input };
    const copied = captureRecordingDraft(mutable);
    mutable.clockMs = 80_000; mutable.teamId = 'away'; mutable.periodNumber = 2;
    expect(copied).toEqual(draft);
    expect(draft.clockMs).toBe(10_999);
    expect(Object.isFrozen(draft)).toBe(true);
  });
  it('rejects navigation, identity changes, cancellation and out-of-order responses', () => {
    const draft = captureRecordingDraft(input);
    expect(isCurrentDraft(draft, draft, input.matchId, input.identity)).toBe(true);
    expect(isCurrentDraft(draft, draft, 'other', input.identity)).toBe(false);
    expect(isCurrentDraft(draft, draft, input.matchId, 'other')).toBe(false);
    expect(isCurrentDraft(draft, null, input.matchId, input.identity)).toBe(false);
    expect(isCurrentDraft(draft, { ...draft, id: 'newer' }, input.matchId, input.identity)).toBe(false);
  });
  it.each(['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const)('preserves captured %s metadata through event persistence', periodType => {
    const draft = captureRecordingDraft({ ...input, periodType });
    expect(readRecordingPeriod(recordingNotes(draft))).toEqual({ periodId: 'p1', periodType });
  });
  it('leaves ordinary notes alone and rejects invalid recording metadata', () => {
    for (const notes of ['Played well', '{invalid', JSON.stringify({ recording: { version: 2, periodId: 'p', periodType: 'REGULAR' } }), JSON.stringify({ recording: { version: 1, periodId: 'p', periodType: 'unknown' } }), 'x'.repeat(2049)]) {
      expect(readRecordingPeriod(notes)).toBeUndefined();
    }
  });
});
