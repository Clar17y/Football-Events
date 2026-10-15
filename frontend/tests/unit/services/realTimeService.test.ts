import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), generation: 0, owner: 'user-1',
  socket: { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: () => mocks.socket }));
vi.mock('../../../src/services/dataLayer', () => ({ eventsDataLayer: { create: mocks.create } }));
vi.mock('../../../src/services/api/baseApi', () => ({ apiClient: { getSessionGeneration: () => mocks.generation } }));
vi.mock('../../../src/utils/network', () => ({ getCurrentUserId: () => mocks.owner }));
import { RealTimeService } from '../../../src/services/realTimeService';
import type { MatchEvent } from '../../../src/types/events';
let service: RealTimeService;
const event = { id: 'event-1', matchId: 'match-1', teamId: 'team-1', kind: 'goal',
  createdByUserId: 'user-1', sentiment: 3, isDeleted: false } as MatchEvent;
function receive(name: string, ...args: any[]) {
  mocks.socket.on.mock.calls.find(call => call[0] === name)?.[1]?.(...args);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.generation = 0; mocks.owner = 'user-1';
  mocks.create.mockResolvedValue({ id: 'durable-event' });
  service = new RealTimeService({ serverUrl: 'http://localhost', timeout: 5, reconnectionAttempts: 1, reconnectionDelay: 1 });
});
afterEach(() => service.disconnect());
describe('durable legacy publishing and viewer transport', () => {
  it.each([false, true])('saves canonically before success with connected=%s', async connected => {
    if (connected) receive('connect');
    expect(await service.publishEvent(event)).toEqual({ success: true, method: 'local' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sentiment: 3, createdByUserId: 'user-1' }),
      expect.objectContaining({ ownerId: 'user-1', isCurrent: expect.any(Function) }));
    expect(mocks.socket.emit).not.toHaveBeenCalled();
  });
  it('cannot report success when local persistence fails', async () => {
    receive('connect'); mocks.create.mockRejectedValueOnce(new Error('storage failure'));
    expect(await service.publishEvent(event)).toEqual({ success: false, method: 'local' });
    expect(mocks.socket.emit).not.toHaveBeenCalled();
  });
  it.each([{ ...event, createdByUserId: 'another-user' }, { ...event, teamId: undefined }])('rejects invalid publishing context', async invalid => {
    expect((await service.publishEvent(invalid)).success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('captures owner and generation for the canonical writer guard', async () => {
    await service.publishEvent(event);
    const guard = mocks.create.mock.calls[0][1]; expect(guard.isCurrent()).toBe(true);
    mocks.generation++; expect(guard.isCurrent()).toBe(false);
  });
  it('ignores receipt confirmations and only notifies live viewers', () => {
    const viewer = vi.fn(); service.onEvent(viewer);
    receive('match_event_confirmed', event.id); receive('live_event', event);
    expect(viewer).toHaveBeenCalledWith(event);
    expect(mocks.socket.on.mock.calls.some(call => call[0] === 'match_event_confirmed')).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejoins, leaves and disconnects the selected room', () => {
    service.joinMatch('match-1'); receive('connect'); expect(service.connected).toBe(true);
    expect(mocks.socket.emit).toHaveBeenCalledWith('join-match', 'match-1');
    service.leaveMatch(); expect(service.matchId).toBeNull();
    receive('disconnect'); expect(service.connected).toBe(false);
  });
});
