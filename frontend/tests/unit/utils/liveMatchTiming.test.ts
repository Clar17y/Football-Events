import { describe, expect, it } from 'vitest';
import { actualPlayedSeconds, reconstructClock, periodOffsetMs, regularPeriodCount, periodLengthMs, uniquePeriods, formatLiveClock, formatEventMinute } from '../../../src/utils/liveMatchTiming';

const format = { periodFormat: 'half', durationMinutes: 60 };
const first = { id: 'p1', matchId: 'm', periodNumber: 1, periodType: 'REGULAR', startedAt: 1_000 };
describe('played time and display reconstruction', () => {
  it('excludes a five-minute pause and agrees after resume/reload/background', () => {
    const pause = { status: 'PAUSED', timerMs: 600_000, totalElapsedSeconds: 600, lastUpdatedAt: 601_000 };
    expect(reconstructClock(pause, [first], format, 901_000)).toBe(600_000);
    const resume = { ...pause, status: 'LIVE', lastUpdatedAt: 901_000 };
    const display = reconstructClock(resume, [first], format, 1_021_000);
    expect(display).toBe(720_000);
    expect(actualPlayedSeconds(display, format, [first])).toBe(720);
    expect(reconstructClock({ status: 'LIVE', totalElapsedSeconds: 600, updatedAt: 901_000 }, [first], format, 1_021_000)).toBe(display);
  });
  it('reconstructs a paused second period using actual total and planned offset', () => {
    const ended = { ...first, endedAt: 601_000, durationSeconds: 600 };
    const second = { ...first, id: 'p2', periodNumber: 2, startedAt: 901_000 };
    const server = { status: 'PAUSED', totalElapsedSeconds: 720, updatedAt: 1_321_000 };
    expect(reconstructClock(server, [ended, second], format, 2_000_000)).toBe(1_920_000);
    expect(actualPlayedSeconds(1_920_000, format, [ended, second])).toBe(720);
    expect(reconstructClock({ ...server, status: 'LIVE' }, [ended, second], format, 1_381_000)).toBe(1_980_000);
  });
  it('keeps paused clocks stable across multiple pause/reload cycles', () => {
    let state = { status: 'LIVE', timerMs: 0, lastUpdatedAt: 1_000 };
    for (let cycle = 0; cycle < 3; cycle++) {
      const pausedAt = state.lastUpdatedAt + 120_000;
      const timerMs = reconstructClock(state, [first], format, pausedAt);
      state = { status: 'PAUSED', timerMs, lastUpdatedAt: pausedAt };
      expect(reconstructClock(state, [first], format, pausedAt + 300_000)).toBe(timerMs);
      state = { ...state, status: 'LIVE', lastUpdatedAt: pausedAt + 300_000 };
    }
    expect(actualPlayedSeconds(state.timerMs, format, [first])).toBe(360);
  });
  it('sums explicit ended durations rather than wall time or planned offsets', () => {
    const ended = { ...first, endedAt: 3_601_000, durationSeconds: 600 };
    expect(actualPlayedSeconds(1_800_000, format, [ended])).toBe(600);
    expect(reconstructClock({ status: 'COMPLETED', totalElapsedSeconds: 600 }, [ended], format)).toBe(600_000);
  });
  it('offsets regular and extra time independently and resets shootout clock', () => {
    expect(periodOffsetMs(format, { periodNumber: 2, periodType: 'REGULAR' })).toBe(1_800_000);
    expect(periodOffsetMs(format, { periodNumber: 1, periodType: 'EXTRA_TIME' })).toBe(3_600_000);
    expect(periodOffsetMs(format, { periodNumber: 2, periodType: 'EXTRA_TIME' })).toBe(4_500_000);
    expect(periodOffsetMs(format, { periodNumber: 1, periodType: 'PENALTY_SHOOTOUT' })).toBe(0);
  });
  it('suppresses duplicate logical periods, prefers dirty rows and ignores deleted rows', () => {
    const dirty = { ...first, id: 'local', synced: false };
    expect(uniquePeriods([{ ...first, synced: true }, dirty, { ...first, id: 'deleted', isDeleted: true }])).toEqual([dirty]);
    expect(uniquePeriods([first, { ...first, id: 'server', periodType: '' }])).toEqual([first]);
  });
  it('formats unbounded minutes and handles invalid clocks defensively', () => {
    expect(formatLiveClock(90 * 60_000 + 9_000)).toBe('90:09');
    expect(formatLiveClock(NaN)).toBe('00:00');
    expect(formatLiveClock(-10)).toBe('00:00');
  });
  it('uses the playing anchor rather than replay time after delayed server reconciliation', () => {
    const state = { status: 'LIVE', totalElapsedSeconds: 600, activeSince: 901_000, updatedAt: 1_201_000 };
    expect(reconstructClock(state, [first], format, 1_261_000)).toBe(960_000);
  });
  it('uses persisted ended duration after a final state write failed and the page reloaded', () => {
    const ended = { ...first, endedAt: 901_000, durationSeconds: 720 };
    expect(reconstructClock({ status: 'LIVE', timerMs: 600_000, lastUpdatedAt: 601_000 }, [ended], format, 1_500_000)).toBe(720_000);
    expect(actualPlayedSeconds(720_000, format, [ended])).toBe(720);
  });
  it('labels cumulative event clocks without adding their period offset again', () => {
    expect(formatEventMinute(32 * 60_000, format, { periodNumber: 2, periodType: 'REGULAR' })).toBe("32'");
    expect(formatEventMinute(65 * 60_000, format, { periodNumber: 1, periodType: 'EXTRA_TIME' })).toBe("65'");
    expect(formatEventMinute(77 * 60_000, format, { periodNumber: 1, periodType: 'EXTRA_TIME' })).toBe("75'+2'");
    expect(formatEventMinute(2 * 60_000, format, { periodNumber: 1, periodType: 'PENALTY_SHOOTOUT' })).toBe("2'");
  });
  it('splits third format into three regular periods with the correct planned offsets', () => {
    const thirds = { periodFormat: 'third', durationMinutes: 45 };
    expect(regularPeriodCount(thirds)).toBe(3);
    expect(periodLengthMs(thirds)).toBe(900_000);
    expect(periodOffsetMs(thirds, { periodNumber: 3, periodType: 'REGULAR' })).toBe(1_800_000);
    expect(periodOffsetMs(thirds, { periodNumber: 1, periodType: 'EXTRA_TIME' })).toBe(2_700_000);
  });
});
