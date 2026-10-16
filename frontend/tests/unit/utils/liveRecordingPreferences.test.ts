import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberTrackedPlayer, trackedPlayer } from '../../../src/utils/liveRecordingPreferences';
describe('opt-in tracked player', () => {
  beforeEach(() => localStorage.clear());
  it('requires explicit preference, exact team/identity and membership in the current roster', () => {
    expect(trackedPlayer('guest', 'home', [{ id: 'child' }])).toBeNull();
    rememberTrackedPlayer('guest', 'home', 'child');
    expect(trackedPlayer('guest', 'home', [{ id: 'child' }])).toBe('child');
    expect(trackedPlayer('guest', 'away', [{ id: 'child' }])).toBeNull();
    expect(trackedPlayer('user', 'home', [{ id: 'child' }])).toBeNull();
    expect(trackedPlayer('guest', 'home', [{ id: 'other' }])).toBeNull();
    rememberTrackedPlayer('guest', 'home', null);
    expect(trackedPlayer('guest', 'home', [{ id: 'child' }])).toBeNull();
  });
  it('ignores malformed and oversized data and tolerates unavailable storage', () => {
    for (const value of ['null', '{', '{}', '[{"identity":1}]', ' '.repeat(20_000)]) {
      localStorage.setItem('live-recording-player-v1', value);
      expect(trackedPlayer('g', 't', [{ id: 'p' }])).toBeNull();
    }
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberTrackedPlayer('g', 't', 'p')).not.toThrow();
    spy.mockRestore();
  });
  it('bounds stored preferences', () => {
    for (let n = 0; n < 50; n++) rememberTrackedPlayer('g', `team-${n}`, 'p');
    expect(JSON.parse(localStorage.getItem('live-recording-player-v1')!)).toHaveLength(24);
  });
});
