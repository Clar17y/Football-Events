import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveMatchPage from '../../../src/pages/LiveMatchPage';
import eventsApi from '../../../src/services/api/eventsApi';
import teamsApi from '../../../src/services/api/teamsApi';
import matchesApi from '../../../src/services/api/matchesApi';
import { matchPeriodsDataLayer, matchStateDataLayer } from '../../../src/services/dataLayer';
import { getGuestId } from '../../../src/utils/guest';
import { db } from '../../../src/db/indexedDB';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { authApi } from '../../../src/services/api/authApi';
import { ApiRequestError, apiClient } from '../../../src/services/api/baseApi';
import { OFFLINE_IDENTITY_KEY } from '../../../src/services/api/authOfflineIdentity';
import { defaultLineupsApi } from '../../../src/services/api/defaultLineupsApi';
vi.mock('ionicons/icons', async () => await vi.importActual('ionicons/icons'));

const fixture = vi.hoisted(() => ({
  authenticated: false, userId: 'parent', now: 1_000_000,
  states: {} as Record<string, any>, periods: {} as Record<string, any[]>, events: {} as Record<string, any[]>,
  matches: {} as Record<string, any>, deferredQueries: false, periodReads: new Map<string, Promise<any[]>>(),
  empty: [] as any[], cachedStates: new Map<string, any>(), cachedPeriods: new Map<string, any>(), cachedEvents: new Map<string, any>(),
  cachedMatches: new Map<string, any>(),
  realAuth: false, recoveryMessage: null as string | null,
}));
vi.mock('../../../src/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../../src/contexts/AuthContext')>('../../../src/contexts/AuthContext');
  return { ...actual, useAuth: () => fixture.realAuth ? actual.useAuth() : ({ isAuthenticated: fixture.authenticated, user: fixture.authenticated ? { id: fixture.userId } : null, recoveryMessage: fixture.recoveryMessage }) };
});
vi.mock('../../../src/utils/network', async () => ({ ...await vi.importActual('../../../src/utils/network'), getAuthUserId: () => fixture.authenticated ? fixture.userId : null }));
vi.mock('../../../src/hooks/useInitialSync', () => ({ useInitialSync: () => {} }));
vi.mock('../../../src/hooks/useMeLimits', () => ({ useMeLimits: () => ({ allowedEventKinds: ['goal', 'assist', 'save'], planType: 'free' }) }));
vi.mock('../../../src/hooks/useLocalData', async () => {
  const actual = await vi.importActual<typeof import('../../../src/hooks/useLocalData')>('../../../src/hooks/useLocalData');
  return {
    useLocalMatch: (id: string) => ({ match: fixture.matches[id] }),
    useLocalMatchState: (id: string, version: number) => fixture.deferredQueries ? actual.useLocalMatchState(id, version) : ({ matchState: fixture.states[id], loading: false, loadedMatchId: id }),
    useLocalMatchPeriods: (id: string, version: number) => fixture.deferredQueries ? actual.useLocalMatchPeriods(id, version) : ({ periods: fixture.periods[id] || fixture.empty, loading: false, loadedMatchId: id }),
    useLocalEvents: (id: string) => ({ events: fixture.events[id] || fixture.empty }),
  };
});
vi.mock('../../../src/services/guestQuickMatch', () => ({ getLocalMatch: vi.fn(async (id: string) => fixture.matches[id]) }));
vi.mock('../../../src/components/PageHeader', () => ({ default: () => <div /> }));
vi.mock('../../../src/components/lineup/LineupManagementModal', () => ({ default: ({ isOpen }: any) => isOpen ? <div data-testid="team-changes-dialog" /> : null }));
vi.mock('../../../src/components/live/LiveTimeline', () => ({ default: ({ feed, showDelete, deleteDisabled, onDelete }: any) => <div>{feed.filter((item: any) => item.kind === 'event').map((item: any) => <div key={item.id} data-testid="timeline-event" data-period-type={item.periodType}>{item.label} {item.sentiment}{showDelete && <button disabled={deleteDisabled} onClick={() => onDelete(item)}>Delete event</button>}</div>)}</div> }));
vi.mock('../../../src/services/api/defaultLineupsApi', () => ({ defaultLineupsApi: { getDefaultLineup: vi.fn() } }));
vi.mock('../../../src/services/api/formationsApi', () => ({ default: { prefetch: vi.fn(async () => {}) } }));
vi.mock('../../../src/services/api/teamsApi', () => ({ default: { getTeamPlayers: vi.fn() } }));
vi.mock('../../../src/services/api/eventsApi', () => ({ default: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), getByMatch: vi.fn(async () => []) } }));
vi.mock('../../../src/services/api/matchesApi', () => ({ default: { getUpcoming: vi.fn(), getRecent: vi.fn(async () => []), getMatchState: vi.fn(), getMatchPeriods: vi.fn(), getActiveViewerLinks: vi.fn(async () => []) } }));
vi.mock('../../../src/services/dataLayer', async () => {
  const actual = await vi.importActual<typeof import('../../../src/services/dataLayer')>('../../../src/services/dataLayer');
  return { isCurrentOwnedMatch: actual.isCurrentOwnedMatch, isReplayableMatchStatus: actual.isReplayableMatchStatus, reclaimLegacyRecordings: vi.fn(async () => {}), matchStateDataLayer: { upsert: vi.fn() }, matchPeriodsDataLayer: { create: vi.fn(), endPeriod: vi.fn(), getByMatch: vi.fn() } };
});
vi.mock('../../../src/db/indexedDB', () => {
  const table = (map: Map<string, any>) => ({
    get: vi.fn(async (id: string) => map.get(id)),
    put: vi.fn(async (row: any) => map.set(row.matchId || row.id, row)),
    bulkPut: vi.fn(async (rows: any[]) => rows.forEach(row => map.set(row.id, row))),
    bulkDelete: vi.fn(async (ids: string[]) => ids.forEach(id => map.delete(id))),
    where: () => ({ equals: (id: string) => {
      const rows = async () => map === fixture.cachedPeriods && fixture.periodReads.has(id)
        ? await fixture.periodReads.get(id) || [] : [...map.values()].filter(row => row.matchId === id);
      return { toArray: rows, filter: (predicate: (row: any) => boolean) => ({
        sortBy: async (field: string) => (await rows()).filter(predicate).sort((a, b) => a[field] - b[field]),
      }) };
    } }),
  });
  return { db: {
    matches: table(fixture.cachedMatches), matchState: table(fixture.cachedStates), matchPeriods: table(fixture.cachedPeriods), events: table(fixture.cachedEvents),
    transaction: async (...args: any[]) => args[args.length - 1](),
  } };
});
function match(id: string) {
  return { id, createdByUserId: fixture.authenticated ? fixture.userId : 'guest-parent', synced: true, homeScore: 0, awayScore: 0, homeTeamId: 'home', awayTeamId: 'away', homeTeam: { name: 'Long Home Football Club' }, awayTeam: { name: 'Long Away Football Club' }, periodFormat: 'half', durationMinutes: 60, kickoffTime: '2026-10-14T10:00:00Z' } as any;
}
function signInFixture() {
  fixture.authenticated = true;
  Object.values(fixture.matches).forEach(match => { match.createdByUserId = fixture.userId; });
  fixture.cachedMatches.forEach(match => { match.createdByUserId = fixture.userId; });
}
function live(id = 'm') {
  fixture.states[id] = { matchId: id, status: 'LIVE', timerMs: 600_000, totalElapsedSeconds: 600, currentPeriodId: `${id}-p1`, lastUpdatedAt: fixture.now, synced: false, createdByUserId: fixture.authenticated ? fixture.userId : 'guest-parent' };
  fixture.periods[id] = [{ id: `${id}-p1`, matchId: id, periodNumber: 1, periodType: 'REGULAR', startedAt: fixture.now - 600_000, createdAt: fixture.now - 600_000, createdByUserId: fixture.authenticated ? fixture.userId : 'guest-parent', isDeleted: false, synced: false }];
  fixture.events[id] = [];
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function open(kind = 'goal') {
  await waitFor(() => expect(screen.getByRole('button', { name: kind })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: kind }));
  return screen.findByTestId('ion-modal');
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); localStorage.setItem('guest_id', 'guest-parent');
  apiClient.clearSession();
  fixture.realAuth = false; fixture.recoveryMessage = null;
  window.history.replaceState({}, '', '/live/m');
  fixture.authenticated = false; fixture.userId = 'parent'; fixture.now = 1_000_000;
  fixture.states = {}; fixture.periods = {}; fixture.events = {};
  fixture.matches = { m: match('m'), other: match('other') };
  fixture.deferredQueries = false; fixture.periodReads.clear();
  fixture.cachedStates.clear(); fixture.cachedPeriods.clear(); fixture.cachedEvents.clear(); fixture.cachedMatches.clear();
  fixture.cachedMatches.set('m', { ...fixture.matches.m, recordingRevision: 0 });
  vi.spyOn(Date, 'now').mockImplementation(() => fixture.now);
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  live();
  vi.mocked(matchesApi.getUpcoming).mockResolvedValue([match('m'), match('other')]);
  vi.mocked(matchesApi.getMatchState).mockRejectedValue(new Error('Offline'));
  vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue([]);
  vi.mocked(defaultLineupsApi.getDefaultLineup).mockResolvedValue({ id: 'lineup', teamId: 'home', formation: [] } as any);
  vi.mocked(teamsApi.getTeamPlayers).mockImplementation(async () => ({ data: [{ id: 'child', name: 'Alex', squadNumber: 9 }, { id: 'other-player', name: 'Sam', squadNumber: 4 }] }) as any);
  vi.mocked(eventsApi.create).mockImplementation(async (payload: any) => {
    const event = { id: `event-${fixture.events[payload.matchId].length}`, ...payload, createdAt: fixture.now, createdByUserId: 'parent', isDeleted: false };
    fixture.events[payload.matchId] = [...fixture.events[payload.matchId], event];
    return event;
  });
  vi.mocked(eventsApi.delete).mockImplementation(async id => {
    for (const matchId of Object.keys(fixture.events)) fixture.events[matchId] = fixture.events[matchId].filter(e => e.id !== id);
  });
  vi.mocked(eventsApi.update).mockImplementation(async (id, patch) => {
    let updated: any;
    for (const matchId of Object.keys(fixture.events)) fixture.events[matchId] = fixture.events[matchId].map(e => e.id === id ? (updated = { ...e, ...patch }) : e);
    return updated;
  });
  vi.mocked(matchPeriodsDataLayer.create).mockImplementation(async data => {
    const ps = fixture.periods[data.matchId] || [];
    const existing = ps.find(p => !p.endedAt);
    if (existing) return existing;
    const period = { ...data, id: `period-${data.periodType}-${data.periodNumber}`, createdAt: fixture.now, createdByUserId: 'parent', isDeleted: false };
    fixture.periods[data.matchId] = [...ps, period];
    return period as any;
  });
  vi.mocked(matchPeriodsDataLayer.endPeriod).mockImplementation(async (id, endedAt, durationSeconds) => {
    for (const matchId of Object.keys(fixture.periods)) fixture.periods[matchId] = fixture.periods[matchId].map(p => p.id === id ? { ...p, endedAt, durationSeconds } : p);
  });
  vi.mocked(matchPeriodsDataLayer.getByMatch).mockImplementation(async id => fixture.periods[id] || []);
  vi.mocked(matchStateDataLayer.upsert).mockImplementation(async (id, patch) => {
    fixture.states[id] = { ...fixture.states[id], ...patch, lastUpdatedAt: fixture.now };
  });
});
afterEach(() => vi.restoreAllMocks());

describe('LiveMatchPage immutable recording', () => {
  it('preserves tap time/team/period after a delay and a period ends', async () => {
    render(<LiveMatchPage matchId="m" />);
    const modal = await open();
    await within(modal).findByRole('button', { name: '9 · Alex' });
    fixture.now += 120_000;
    fireEvent.click(screen.getByRole('button', { name: 'End Period' }));
    await waitFor(() => expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalled());
    fireEvent.click(within(modal).getByRole('button', { name: '9 · Alex' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Save with player' }));
    await waitFor(() => expect(eventsApi.create).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'm', teamId: 'home', periodNumber: 1, clockMs: 600_000, playerId: 'child' })));
  });
  it('cancels on navigation and rejects an old roster completing after a newer draft', async () => {
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    const old = deferred<any>();
    vi.mocked(teamsApi.getTeamPlayers).mockReturnValueOnce(old.promise);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Long Away Football Club' }));
    await open('assist');
    await screen.findByRole('button', { name: '9 · Alex' });
    await act(async () => old.resolve({ data: [{ id: 'stale', name: 'Stale' }] }));
    expect(screen.queryByRole('button', { name: 'Stale' })).not.toBeInTheDocument();
    live('other'); view.rerender(<LiveMatchPage matchId="other" />);
    await waitFor(() => expect(screen.queryByTestId('ion-modal')).not.toBeInTheDocument());
    expect(eventsApi.create).not.toHaveBeenCalled();
  });
  it('keeps player input and draft on failed save and guards repeated retry taps', async () => {
    render(<LiveMatchPage matchId="m" />); const modal = await open();
    fireEvent.click(await within(modal).findByRole('button', { name: '9 · Alex' }));
    vi.mocked(eventsApi.create).mockRejectedValueOnce(new Error('Event quota reached'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Save with player' }));
    await within(modal).findByRole('alert');
    expect(within(modal).getByRole('button', { name: '9 · Alex' })).toHaveAttribute('data-fill', 'solid');
    fixture.now += 300_000;
    const pending = deferred<any>(); vi.mocked(eventsApi.create).mockReturnValueOnce(pending.promise);
    const retry = within(modal).getByRole('button', { name: 'Retry save' });
    fireEvent.click(retry); fireEvent.click(retry);
    expect(eventsApi.create).toHaveBeenCalledTimes(2);
    expect(eventsApi.create).toHaveBeenLastCalledWith(expect.objectContaining({ clockMs: 600_000, playerId: 'child' }));
    await act(async () => pending.resolve({ id: 'saved', ...vi.mocked(eventsApi.create).mock.calls[1][0], createdAt: fixture.now }));
    await waitFor(() => expect(screen.queryByTestId('ion-modal')).not.toBeInTheDocument());
  });
  it('offers save without player while roster is unavailable and ignores a save result after navigation', async () => {
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    const roster = deferred<any>(); vi.mocked(teamsApi.getTeamPlayers).mockReturnValueOnce(roster.promise);
    const modal = await open();
    expect(within(modal).getByRole('button', { name: 'Save without player' })).toBeEnabled();
    const save = deferred<any>(); vi.mocked(eventsApi.create).mockReturnValueOnce(save.promise);
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    live('other'); view.rerender(<LiveMatchPage matchId="other" />);
    await waitFor(() => expect(screen.queryByTestId('ion-modal')).not.toBeInTheDocument());
    await act(async () => { roster.resolve({ data: [{ id: 'stale', name: 'Stale' }] }); save.resolve({ id: 'old', matchId: 'm', kind: 'goal', createdAt: fixture.now }); });
    expect(screen.queryByText('Event added: goal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-event')).not.toBeInTheDocument();
  });
  it('lists players marked on the pitch first, per team, without selecting them', async () => {
    render(<LiveMatchPage matchId="m" />); let modal = await open();
    const order = () => within(modal).getAllByRole('button').map(b => b.textContent).filter(t => t?.includes(' · '));
    await within(modal).findByRole('button', { name: '9 · Alex' });
    expect(order()).toEqual(['4 · Sam', '9 · Alex']);
    const pitchToggle = () => within(within(modal).getByRole('button', { name: '9 · Alex' }).closest('.live-roster-row') as HTMLElement)
      .getByRole('button', { name: 'On pitch' });
    fireEvent.click(pitchToggle());
    expect(pitchToggle()).toHaveAttribute('data-fill', 'solid');
    expect(order()).toEqual(['9 · Alex', '4 · Sam']);
    expect(within(modal).getByRole('button', { name: 'Save with player' })).toBeDisabled();
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    modal = await open();
    await within(modal).findByRole('button', { name: '9 · Alex' });
    expect(order()).toEqual(['9 · Alex', '4 · Sam']);
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Long Away Football Club' }));
    modal = await open();
    await within(modal).findByRole('button', { name: '9 · Alex' });
    expect(order()).toEqual(['4 · Sam', '9 · Alex']);
  });
  it('warns before kickoff only when the selected team has no default lineup', async () => {
    fixture.states.m = { ...fixture.states.m, status: 'SCHEDULED', timerMs: 0, totalElapsedSeconds: 0, currentPeriodId: undefined };
    fixture.periods.m = [];
    vi.mocked(defaultLineupsApi.getDefaultLineup).mockImplementation(async teamId => teamId === 'away' ? null : { id: 'l', teamId } as any);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kick Off' })).toBeEnabled());
    expect(screen.queryByText(/Default lineup not set/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Long Away Football Club' }));
    expect(await screen.findByText(/Default lineup not set/)).toBeInTheDocument();
  });
  it('does not warn about a default lineup when the lookup fails', async () => {
    fixture.states.m = { ...fixture.states.m, status: 'SCHEDULED', timerMs: 0, totalElapsedSeconds: 0, currentPeriodId: undefined };
    fixture.periods.m = [];
    vi.mocked(defaultLineupsApi.getDefaultLineup).mockRejectedValue(new Error('storage unavailable'));
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kick Off' })).toBeEnabled());
    await waitFor(() => expect(defaultLineupsApi.getDefaultLineup).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Default lineup not set/)).not.toBeInTheDocument();
  });
  it('remembers a player only after opt-in and does not select that player for an opponent', async () => {
    render(<LiveMatchPage matchId="m" />); let modal = await open();
    fireEvent.click(await within(modal).findByRole('button', { name: '9 · Alex' }));
    fireEvent.click(within(modal).getByRole('checkbox'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Save with player' }));
    await waitFor(() => expect(screen.queryByTestId('ion-modal')).not.toBeInTheDocument());
    modal = await open();
    await waitFor(() => expect(within(modal).getByRole('button', { name: '9 · Alex' })).toHaveAttribute('data-fill', 'solid'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Long Away Football Club' }));
    modal = await open();
    await waitFor(() => expect(within(modal).getByRole('button', { name: '9 · Alex' })).toHaveAttribute('data-fill', 'outline'));
  });
  it('keeps a delayed extra-time event in its captured phase after timeline reload', async () => {
    fixture.periods.m[0] = { ...fixture.periods.m[0], endedAt: fixture.now - 300_000, durationSeconds: 600 };
    fixture.periods.m.push({ id: 'et-1', matchId: 'm', periodNumber: 1, periodType: 'EXTRA_TIME', startedAt: fixture.now - 300_000, createdAt: fixture.now - 300_000 });
    fixture.states.m = { ...fixture.states.m, timerMs: 3_900_000, currentPeriodId: 'et-1' };
    const view = render(<LiveMatchPage matchId="m" />);
    const modal = await open();
    fixture.now += 120_000;
    fireEvent.click(screen.getByRole('button', { name: 'End Period' }));
    await waitFor(() => expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalled());
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await screen.findByTestId('timeline-event');
    expect(eventsApi.create).toHaveBeenCalledWith(expect.objectContaining({ clockMs: 3_900_000, periodNumber: 1, notes: JSON.stringify({ recording: { version: 1, periodId: 'et-1', periodType: 'EXTRA_TIME' } }) }));
    view.unmount();
    render(<LiveMatchPage matchId="m" />);
    expect(await screen.findByTestId('timeline-event')).toHaveAttribute('data-period-type', 'EXTRA_TIME');
  });
});

describe.each([false, true])('LiveMatchPage corrections authenticated=%s', authenticated => {
  it('keeps undo/delete/sentiment recovery context until persistence succeeds', async () => {
    if (authenticated) signInFixture();
    render(<LiveMatchPage matchId="m" />); const modal = await open();
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await screen.findByTestId('timeline-event');
    vi.mocked(eventsApi.update).mockRejectedValueOnce(new Error('Update unavailable'));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    await screen.findByRole('alert');
    expect(fixture.events.m[0].sentiment).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    await waitFor(() => expect(fixture.events.m[0].sentiment).toBe(1));
    expect(eventsApi.update).toHaveBeenLastCalledWith('event-0', { sentiment: 1 });
    vi.mocked(eventsApi.delete).mockRejectedValueOnce(new Error('Delete unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('timeline-event')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    vi.mocked(eventsApi.delete).mockRejectedValueOnce(new Error('Timeline delete unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('timeline-event')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
    await waitFor(() => expect(screen.queryByTestId('timeline-event')).not.toBeInTheDocument());
    expect(fixture.events.m).toEqual([]);
  });
});

describe('correction identity boundaries', () => {
  it.each(['undo', 'sentiment'])('ignores a late %s success after changing user on the same match', async correction => {
    signInFixture();
    const view = render(<LiveMatchPage matchId="m" />);
    const modal = await open();
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await screen.findByTestId('timeline-event');
    const pending = deferred<any>();
    if (correction === 'undo') vi.mocked(eventsApi.delete).mockReturnValueOnce(pending.promise);
    else vi.mocked(eventsApi.update).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: correction === 'undo' ? 'Undo' : '+' }));
    fixture.userId = 'another-parent';
    fixture.matches.m = { ...fixture.matches.m, createdByUserId: fixture.userId };
    fixture.cachedMatches.set('m', fixture.matches.m);
    fixture.events.m = [{ id: 'event-0', matchId: 'm', teamId: 'home', kind: 'assist', sentiment: 0, createdAt: fixture.now, createdByUserId: fixture.userId }];
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByTestId('timeline-event')).toHaveTextContent('Assist 0'));
    await act(async () => pending.resolve({ id: 'event-0', sentiment: 1 }));
    expect(screen.getByTestId('timeline-event')).toHaveTextContent('Assist 0');
    expect(screen.getByText('Event added: goal')).not.toBeVisible();
  });
  it('ignores a late correction failure across a user change and return', async () => {
    signInFixture();
    const view = render(<LiveMatchPage matchId="m" />);
    const modal = await open();
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await screen.findByTestId('timeline-event');
    const pending = deferred<void>(); vi.mocked(eventsApi.delete).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fixture.userId = 'another-parent'; view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByText('Event added: goal')).not.toBeVisible());
    fixture.userId = 'parent'; view.rerender(<LiveMatchPage matchId="m" />);
    await act(async () => pending.reject(new Error('Old account correction failed')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LiveMatchPage lifecycle and played time', () => {
  it('guards kickoff taps and retries a partially created period without a second logical period', async () => {
    fixture.states.m = { status: 'SCHEDULED', timerMs: 0, lastUpdatedAt: fixture.now }; fixture.periods.m = [];
    render(<LiveMatchPage matchId="m" />);
    const pending = deferred<void>(); vi.mocked(matchStateDataLayer.upsert).mockImplementationOnce(async (id, patch) => {
      await pending.promise; fixture.states[id] = { ...fixture.states[id], ...patch, lastUpdatedAt: fixture.now };
    });
    const kickoff = await screen.findByRole('button', { name: 'Kick Off' });
    await waitFor(() => expect(kickoff).toBeEnabled());
    fireEvent.click(kickoff); fireEvent.click(kickoff);
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledTimes(1));
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled();
    await act(async () => pending.reject(new Error('State write failed')));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry match update' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled());
    expect(fixture.periods.m).toHaveLength(1);
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'LIVE', currentPeriodId: fixture.periods.m[0].id }));
  });
  it('plays 10 minutes, pauses 5 minutes, resumes 2 minutes then ends with 12 played minutes', async () => {
    render(<LiveMatchPage matchId="m" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await screen.findByRole('button', { name: 'Resume' });
    fixture.now += 300_000;
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await screen.findByRole('button', { name: 'Pause' });
    fixture.now += 120_000;
    fireEvent.click(screen.getByRole('button', { name: 'End Period' }));
    await waitFor(() => expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalledWith('m-p1', fixture.now, 720));
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'PAUSED', totalElapsedSeconds: 720, timerMs: 720_000, currentPeriodId: undefined }));
  });
  it.each(['LIVE', 'PAUSED'])('completes from %s with explicit played duration', async status => {
    fixture.states.m.status = status;
    fixture.now += 120_000;
    render(<LiveMatchPage matchId="m" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    const duration = status === 'LIVE' ? 720 : 600;
    await waitFor(() => expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalledWith('m-p1', fixture.now, duration));
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'COMPLETED', totalElapsedSeconds: duration }));
  });
  it.each(['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])('guards starting %s and shootout becomes recordable', async type => {
    fixture.states.m.status = 'PAUSED'; fixture.states.m.currentPeriodId = undefined;
    fixture.periods.m = [1, 2].map(n => ({ id: `regular-${n}`, matchId: 'm', periodNumber: n, periodType: 'REGULAR', startedAt: fixture.now - 600_000, endedAt: fixture.now, durationSeconds: 300, createdAt: fixture.now }));
    if (type === 'REGULAR') fixture.periods.m = fixture.periods.m.slice(0, 1);
    if (type === 'PENALTY_SHOOTOUT') fixture.periods.m.push(...[1, 2].map(n => ({ ...fixture.periods.m[0], id: `et-${n}`, periodNumber: n, periodType: 'EXTRA_TIME' })));
    render(<LiveMatchPage matchId="m" />);
    const pending = deferred<void>(); vi.mocked(matchStateDataLayer.upsert).mockImplementationOnce(async (id, patch) => {
      await pending.promise; fixture.states[id] = { ...fixture.states[id], ...patch, lastUpdatedAt: fixture.now };
    });
    const name = type === 'REGULAR' ? 'Kick Off' : type === 'EXTRA_TIME' ? 'Extra Time' : 'Penalty Shootout';
    const button = await screen.findByRole('button', { name }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalled());
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledTimes(1);
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledWith(expect.objectContaining({ periodType: type }));
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'LIVE', currentPeriodId: expect.any(String), timerMs: type === 'REGULAR' ? 1_800_000 : type === 'EXTRA_TIME' ? 3_600_000 : 0 }));
  });
  it('keeps end-period recovery inputs after the period write succeeds but state write fails', async () => {
    render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchStateDataLayer.upsert).mockRejectedValueOnce(new Error('State failed'));
    fireEvent.click(await screen.findByRole('button', { name: 'End Period' }));
    await screen.findByRole('alert'); fixture.now += 120_000;
    fireEvent.click(screen.getByRole('button', { name: 'Retry match update' }));
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledTimes(2));
    expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalledTimes(1);
    expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalledWith('m-p1', 1_000_000, 600);
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ totalElapsedSeconds: 600, timerMs: 600_000 }));
  });
  it('recovers a partially started first period after reload using its original ID and start time', async () => {
    fixture.states.m = { matchId: 'm', status: 'SCHEDULED', timerMs: 0, lastUpdatedAt: fixture.now - 600_000, synced: false };
    fixture.now += 120_000;
    render(<LiveMatchPage matchId="m" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kick Off' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    expect(fixture.periods.m).toHaveLength(1);
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledWith(expect.objectContaining({ periodNumber: 1, startedAt: 400_000 }));
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'LIVE', currentPeriodId: 'm-p1', timerMs: 720_000, totalElapsedSeconds: 720 }));
  });
  it('recovers a partially started extra-time period from a paused state after reload', async () => {
    fixture.states.m = { matchId: 'm', status: 'PAUSED', timerMs: 600_000, totalElapsedSeconds: 600, lastUpdatedAt: fixture.now - 60_000, currentPeriodId: undefined };
    fixture.periods.m[0] = { ...fixture.periods.m[0], endedAt: fixture.now - 60_000, durationSeconds: 600 };
    fixture.periods.m.push({ id: 'et-1', matchId: 'm', periodNumber: 1, periodType: 'EXTRA_TIME', startedAt: fixture.now - 30_000, createdAt: fixture.now - 30_000 });
    render(<LiveMatchPage matchId="m" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    expect(fixture.periods.m).toHaveLength(2);
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ status: 'LIVE', currentPeriodId: 'et-1', timerMs: 3_630_000, totalElapsedSeconds: 630 }));
  });
  it.each([false, true])('recovers an ended period after reload with complete=%s and no extra playing time', async complete => {
    fixture.periods.m[0] = { ...fixture.periods.m[0], endedAt: fixture.now, durationSeconds: 720 };
    fixture.now += 300_000;
    render(<LiveMatchPage matchId="m" />);
    expect(await screen.findByRole('timer')).toHaveTextContent('12:00');
    fireEvent.click(await screen.findByRole('button', { name: complete ? 'Complete' : 'Finish period update' }));
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledWith('m', expect.objectContaining({ status: complete ? 'COMPLETED' : 'PAUSED', timerMs: 720_000, totalElapsedSeconds: 720, currentPeriodId: undefined })));
    expect(matchPeriodsDataLayer.endPeriod).not.toHaveBeenCalled();
  });
});

describe('resolved local recording snapshots', () => {
  it('blocks retained account credentials with no trusted cached profile instead of writing as a guest', async () => {
    signInFixture();
    fixture.authenticated = false;
    fixture.realAuth = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    apiClient.setToken(`header.${btoa(JSON.stringify({ userId: 'parent', exp: fixture.now / 1000 + 600 }))}.signature`);
    localStorage.setItem('refresh_token', 'refresh-parent');
    const view = render(<AuthProvider><LiveMatchPage matchId="m" /></AuthProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connect once to confirm your account');
    expect(screen.queryByRole('button', { name: 'goal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kick Off' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    expect(eventsApi.create).not.toHaveBeenCalled();
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled();
    expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
    expect(screen.queryByText(/Guest · saved/)).not.toBeInTheDocument();
    view.unmount();
  });

  it('can record with a matching confirmed profile while online profile revalidation remains pending', async () => {
    signInFixture(); fixture.realAuth = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    apiClient.setToken(`header.${btoa(JSON.stringify({ userId: 'parent', exp: fixture.now / 1000 + 600 }))}.signature`);
    localStorage.setItem('refresh_token', 'refresh-parent');
    localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: 'parent', profile: {
      id: 'parent', email: 'parent@example.test', first_name: 'Parent', last_name: null, role: 'USER',
      email_verified: true, created_at: '2026-01-01', updated_at: '2026-01-02',
    } }));
    const pendingProfile = deferred<any>();
    vi.spyOn(authApi, 'getProfile').mockReturnValue(pendingProfile.promise);
    const view = render(<AuthProvider><LiveMatchPage matchId="m" /></AuthProvider>);
    const modal = await open();
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await waitFor(() => expect(eventsApi.create).toHaveBeenCalledTimes(1));
    expect(authApi.getProfile).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.unmount();
  });

  it.each(['CANCELLED', 'POSTPONED'])('keeps a resolved %s snapshot readable without new plays or lifecycle writes', async status => {
    fixture.states.m = { ...fixture.states.m, status };
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(status.toLowerCase()));
    expect(screen.queryByText('Loading saved match…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'goal' })).toBeDisabled();
    for (const label of ['Kick Off', 'Resume', 'End Period', 'Complete']) {
      const button = screen.queryByRole('button', { name: label });
      if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
    }
    expect(eventsApi.create).not.toHaveBeenCalled();
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled();
    expect(matchPeriodsDataLayer.endPeriod).not.toHaveBeenCalled();
    expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
  });

  it('blocks saving a captured play if the matching snapshot becomes postponed', async () => {
    const view = render(<LiveMatchPage matchId="m" />);
    const modal = await open();
    fixture.states.m = { ...fixture.states.m, status: 'POSTPONED' };
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Save without player' })).toBeDisabled());
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    expect(eventsApi.create).not.toHaveBeenCalled();
  });

  it('invalidates the same match when account replacement no longer proves ownership and hides old score details', async () => {
    signInFixture();
    fixture.events.m = [{ id: 'old-goal', matchId: 'm', teamId: 'home', kind: 'goal', createdAt: fixture.now, createdByUserId: 'parent' }];
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    fixture.userId = 'another-parent';
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not available under the current account'));
    expect(screen.queryByRole('button', { name: 'goal' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-event')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Long Home Football Club' })).not.toBeInTheDocument();
    expect(eventsApi.create).not.toHaveBeenCalled();
  });

  it('accepts explicit legacy parent ownership proof but refuses conflicting creator aliases', async () => {
    fixture.matches.m = { ...fixture.matches.m, createdByUserId: undefined, created_by_user_id: 'guest-parent' };
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    fixture.matches.m = { ...fixture.matches.m, createdByUserId: 'another-parent' };
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'goal' })).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('not available under the current account');
  });

  it('defaults to the current-owned away side and preserves a deliberate home selection on metadata updates', async () => {
    fixture.matches.m = { ...fixture.matches.m,
      homeTeam: { id: 'home', name: 'Opponent City', isOpponent: true, createdByUserId: 'guest-parent' },
      awayTeam: { id: 'away', name: 'Your Junior Team', isOpponent: false, createdByUserId: 'guest-parent' },
    };
    const view = render(<LiveMatchPage matchId="m" />);
    let modal = await open();
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await waitFor(() => expect(eventsApi.create).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'away' })));
    fireEvent.click(screen.getByRole('button', { name: 'Opponent City' }));
    fixture.matches.m = { ...fixture.matches.m, updatedAt: '2026-10-14T11:00:00Z' };
    view.rerender(<LiveMatchPage matchId="m" />);
    modal = await open('assist');
    fireEvent.click(within(modal).getByRole('button', { name: 'Save without player' }));
    await waitFor(() => expect(eventsApi.create).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: 'home' })));
  });
  it.each(['state-first', 'periods-first'])('blocks writes until both deferred DB reads finish (%s)', async order => {
    fixture.deferredQueries = true;
    fixture.states.m.status = 'PAUSED';
    const pausedState = { ...fixture.states.m };
    fixture.now += 300_000;
    const state = deferred<any>(), periods = deferred<any[]>();
    fixture.cachedStates.set('m', state.promise); fixture.periodReads.set('m', periods.promise);
    render(<LiveMatchPage matchId="m" />);
    const early = await screen.findByRole('button', { name: 'Kick Off' });
    expect(early).toBeDisabled(); fireEvent.click(early); fireEvent.click(early);
    if (order === 'state-first') await act(async () => state.resolve(pausedState));
    else await act(async () => periods.resolve(fixture.periods.m));
    expect(screen.getByRole('button', { name: 'Kick Off' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled();
    expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
    expect(matchPeriodsDataLayer.endPeriod).not.toHaveBeenCalled();
    if (order === 'state-first') await act(async () => periods.resolve(fixture.periods.m));
    else await act(async () => state.resolve(pausedState));
    const resume = await screen.findByRole('button', { name: 'Resume' });
    await waitFor(() => expect(resume).toBeEnabled());
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    fireEvent.click(resume);
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledWith('m', expect.objectContaining({ status: 'LIVE', timerMs: 600_000, totalElapsedSeconds: 600 })));
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled();
  });
  it('permits a first kickoff after a resolved absent state and empty periods', async () => {
    fixture.deferredQueries = true; fixture.periods.m = []; fixture.states.m = undefined;
    fixture.matches.m = { ...fixture.matches.m, synced: false };
    const state = deferred<any>(), periods = deferred<any[]>();
    fixture.cachedStates.set('m', state.promise); fixture.periodReads.set('m', periods.promise);
    render(<LiveMatchPage matchId="m" />);
    expect(await screen.findByRole('button', { name: 'Kick Off' })).toBeDisabled();
    await act(async () => { state.resolve(undefined); periods.resolve([]); });
    const kickoff = screen.getByRole('button', { name: 'Kick Off' });
    await waitFor(() => expect(kickoff).toBeEnabled());
    fireEvent.click(kickoff); fireEvent.click(kickoff);
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalled());
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledTimes(1);
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledWith(expect.objectContaining({ periodNumber: 1 }));
  });
  it('enables scheduled-plus-open recovery only after matching DB reads resolve', async () => {
    fixture.deferredQueries = true;
    fixture.states.m = { ...fixture.states.m, status: 'SCHEDULED', timerMs: 0 };
    const state = deferred<any>(), periods = deferred<any[]>();
    fixture.cachedStates.set('m', state.promise); fixture.periodReads.set('m', periods.promise);
    render(<LiveMatchPage matchId="m" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kick Off' }));
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled();
    await act(async () => { state.resolve(fixture.states.m); periods.resolve(fixture.periods.m); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kick Off' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledWith('m', expect.objectContaining({ currentPeriodId: 'm-p1', timerMs: 600_000 })));
    expect(fixture.periods.m).toHaveLength(1);
  });
  it('rejects stale query results and empty periods while a route switch loads', async () => {
    fixture.deferredQueries = true;
    fixture.cachedStates.set('m', { ...fixture.states.m, status: 'SCHEDULED' });
    fixture.periodReads.set('m', Promise.resolve([]));
    const otherState = deferred<any>(), otherPeriods = deferred<any[]>();
    live('other'); fixture.states.other.status = 'PAUSED';
    fixture.cachedStates.set('other', otherState.promise); fixture.periodReads.set('other', otherPeriods.promise);
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kick Off' })).toBeEnabled());
    view.rerender(<LiveMatchPage matchId="other" />);
    const kickoff = await screen.findByRole('button', { name: 'Kick Off' });
    expect(kickoff).toBeDisabled(); fireEvent.click(kickoff); fireEvent.click(kickoff);
    await act(async () => otherState.resolve(fixture.states.other));
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled(); expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
    await act(async () => otherPeriods.resolve(fixture.periods.other));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled());
    expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
  });
  it('keeps recording available from a ready local match while upcoming network requests are pending', async () => {
    const upcoming = deferred<any>(); vi.mocked(matchesApi.getUpcoming).mockReturnValueOnce(upcoming.promise);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'goal' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.queryByText('Loading upcoming matches…')).not.toBeInTheDocument();
    await act(async () => upcoming.resolve([match('m')]));
  });
});

describe('safe lifecycle recovery', () => {
  it('keeps an ownership failure actionable when reloading cannot establish the current owner', async () => {
    fixture.states.m = { ...fixture.states.m, createdByUserId: 'another-parent' };
    render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchStateDataLayer.upsert).mockRejectedValueOnce(new Error('Match state belongs to another user'));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await screen.findByText(/Sign in with the account that owns this match/);
    fireEvent.click(screen.getByRole('button', { name: 'Reload match controls' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reload match controls' })).toBeEnabled());
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in with the account that owns this match');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(matchStateDataLayer.upsert).toHaveBeenCalledTimes(1);
  });
  it('reloads before replacing a pre-write failure so a later pause keeps the current clock', async () => {
    render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchStateDataLayer.upsert).mockRejectedValueOnce(new Error('State access unavailable'));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Retry match update' })).not.toBeInTheDocument();
    fixture.now += 300_000;
    fireEvent.click(screen.getByRole('button', { name: 'Reload match controls' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ timerMs: 900_000, totalElapsedSeconds: 900 })));
  });
  it('does not create a second logical period when a partial kickoff period changed before retry', async () => {
    fixture.states.m = { status: 'SCHEDULED', timerMs: 0, lastUpdatedAt: fixture.now }; fixture.periods.m = [];
    const view = render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchStateDataLayer.upsert).mockRejectedValueOnce(new Error('State failed'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kick Off' }));
    await screen.findByRole('alert');
    fixture.periods.m = fixture.periods.m.map(p => ({ ...p, endedAt: fixture.now, durationSeconds: 0 }));
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry match update' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Retry match update' }));
    await screen.findByText(/This period has changed/);
    expect(matchPeriodsDataLayer.create).toHaveBeenCalledTimes(1); expect(fixture.periods.m).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reload match controls' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(fixture.periods.m[0].endedAt).toBe(fixture.now);
  });
  it('captures a fresh start after a pre-write kickoff failure and local reload', async () => {
    fixture.states.m = { status: 'SCHEDULED', timerMs: 0, lastUpdatedAt: fixture.now }; fixture.periods.m = [];
    render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchPeriodsDataLayer.create).mockRejectedValueOnce(new Error('Period access unavailable'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kick Off' }));
    await screen.findByRole('alert'); fixture.now += 300_000;
    expect(screen.queryByRole('button', { name: 'Retry match update' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload match controls' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalledWith('m', expect.objectContaining({ timerMs: 0, totalElapsedSeconds: 0 })));
    expect(matchPeriodsDataLayer.create).toHaveBeenLastCalledWith(expect.objectContaining({ startedAt: fixture.now }));
  });
  it('keeps a new active period safe when an old partial end-state retry is no longer valid', async () => {
    const view = render(<LiveMatchPage matchId="m" />);
    vi.mocked(matchStateDataLayer.upsert).mockRejectedValueOnce(new Error('State failed'));
    fireEvent.click(await screen.findByRole('button', { name: 'End Period' }));
    await screen.findByRole('alert');
    fixture.periods.m = [...fixture.periods.m, { id: 'm-p2', matchId: 'm', periodNumber: 2, periodType: 'REGULAR', startedAt: fixture.now, createdAt: fixture.now }];
    fixture.states.m = { ...fixture.states.m, status: 'PAUSED', currentPeriodId: 'm-p2', timerMs: 1_800_000 };
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry match update' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Retry match update' }));
    await screen.findByText(/Another period is active/);
    expect(matchStateDataLayer.upsert).toHaveBeenCalledTimes(1);
    expect(matchPeriodsDataLayer.endPeriod).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reload match controls' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
    expect(fixture.periods.m[1].endedAt).toBeUndefined();
  });
});

describe('guest quota and third periods', () => {
  it('counts only current guest non-scoring plays, excluding formations and deleted rows', async () => {
    const owner = getGuestId();
    fixture.events.m = [
      { id: 'save', kind: 'save', createdByUserId: owner },
      { id: 'formation', kind: 'formation_change', createdByUserId: owner },
      { id: 'goal', kind: 'goal', createdByUserId: owner },
      { id: 'deleted', kind: 'save', createdByUserId: owner, isDeleted: true },
      { id: 'other', kind: 'save', createdByUserId: 'guest-another' },
    ];
    render(<LiveMatchPage matchId="m" />);
    expect(await screen.findByText(/39 non-scoring events left/)).toBeInTheDocument();
  });
  it('offers the third regular period before extra time', async () => {
    fixture.matches.m = { ...fixture.matches.m, periodFormat: 'third', durationMinutes: 45 };
    fixture.states.m.status = 'PAUSED'; fixture.states.m.currentPeriodId = undefined;
    fixture.periods.m = [1, 2].map(periodNumber => ({ id: `p${periodNumber}`, matchId: 'm', periodNumber, periodType: 'REGULAR', startedAt: fixture.now - 300_000, endedAt: fixture.now, durationSeconds: 300, createdAt: fixture.now }));
    render(<LiveMatchPage matchId="m" />);
    const kickoff = await screen.findByRole('button', { name: 'Kick Off' });
    await waitFor(() => expect(kickoff).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Extra Time' })).not.toBeInTheDocument();
    fireEvent.click(kickoff);
    await waitFor(() => expect(matchPeriodsDataLayer.create).toHaveBeenCalledWith(expect.objectContaining({ periodNumber: 3, periodType: 'REGULAR' })));
    expect(matchStateDataLayer.upsert).toHaveBeenLastCalledWith('m', expect.objectContaining({ timerMs: 1_800_000 }));
  });
});

describe('authenticated hydration', () => {
  it('keeps dirty local rows and canonical IDs when server logical periods have different IDs', async () => {
    signInFixture();
    const dirtyState = { ...fixture.states.m, createdByUserId: 'parent', updatedAt: new Date(fixture.now).toISOString(), createdAt: new Date(fixture.now).toISOString() };
    fixture.cachedStates.set('m', dirtyState);
    fixture.cachedPeriods.set('m-p1', fixture.periods.m[0]);
    fixture.cachedEvents.set('dirty-event', { id: 'dirty-event', matchId: 'm', kind: 'goal', sentiment: 3, synced: false });
    vi.mocked(matchesApi.getMatchState).mockResolvedValue({ matchId: 'm', status: 'PAUSED', createdByUserId: 'parent', totalElapsedSeconds: 10, updatedAt: new Date(fixture.now + 1_000).toISOString(), createdAt: new Date(fixture.now).toISOString() } as any);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue([{ ...fixture.periods.m[0], id: 'server-period', startedAt: new Date(fixture.now - 600_000).toISOString(), durationSeconds: 10 }] as any);
    vi.mocked(eventsApi.getByMatch).mockResolvedValue([{ id: 'dirty-event', matchId: 'm', kind: 'goal', sentiment: -1 }] as any);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fixture.cachedStates.get('m')).toEqual(dirtyState);
    expect([...fixture.cachedPeriods.keys()]).toEqual(['m-p1']);
    expect(fixture.cachedEvents.get('dirty-event').sentiment).toBe(3);
  });
  it('reconstructs paused server time with a canonical local period ID and suppresses duplicates', async () => {
    signInFixture();
    fixture.cachedStates.set('m', { ...fixture.states.m, createdByUserId: 'parent', synced: true, updatedAt: new Date(fixture.now - 1_000).toISOString() });
    fixture.cachedPeriods.set('m-p1', { ...fixture.periods.m[0], createdByUserId: 'parent', synced: true });
    fixture.cachedPeriods.set('duplicate', { ...fixture.periods.m[0], createdByUserId: 'parent', id: 'duplicate', synced: true });
    vi.mocked(matchesApi.getMatchState).mockResolvedValue({ matchId: 'm', status: 'PAUSED', createdByUserId: 'parent', totalElapsedSeconds: 600, updatedAt: new Date(fixture.now).toISOString(), createdAt: new Date(fixture.now - 600_000).toISOString() } as any);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue([{ ...fixture.periods.m[0], id: 'server-period', createdByUserId: 'parent', synced: true }] as any);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(fixture.cachedStates.get('m').status).toBe('PAUSED'));
    expect(fixture.cachedStates.get('m')).toMatchObject({ timerMs: 600_000, currentPeriodId: 'm-p1', totalElapsedSeconds: 600 });
    expect([...fixture.cachedPeriods.keys()]).toEqual(['m-p1']);
  });
  it('discards an old account snapshot after the identity changes while loading', async () => {
    signInFixture();
    const oldState = deferred<any>();
    vi.mocked(matchesApi.getMatchState).mockReturnValueOnce(oldState.promise);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValueOnce([{ ...fixture.periods.m[0], id: 'old-server-period', createdByUserId: 'parent' }] as any);
    vi.mocked(eventsApi.getByMatch).mockResolvedValueOnce([{ id: 'old-server-event', matchId: 'm', kind: 'goal', createdByUserId: 'parent' }] as any);
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    fixture.userId = 'another-parent'; view.rerender(<LiveMatchPage matchId="m" />);
    await act(async () => oldState.resolve({ status: 'LIVE', createdByUserId: 'parent', totalElapsedSeconds: 600, updatedAt: new Date(fixture.now).toISOString() }));
    expect(fixture.cachedStates.size).toBe(0);
    expect(fixture.cachedPeriods.size).toBe(0);
    expect(fixture.cachedEvents.size).toBe(0);
  });
  it.each(['wrong-server-owner', 'wrong-local-owner'])('protects cached ownership for %s', async condition => {
    signInFixture();
    const localState = { ...fixture.states.m, createdByUserId: condition === 'wrong-local-owner' ? 'another-parent' : 'parent', synced: true, updatedAt: new Date(fixture.now - 1_000).toISOString() };
    fixture.cachedStates.set('m', localState);
    vi.mocked(matchesApi.getMatchState).mockResolvedValue({ status: 'PAUSED', createdByUserId: condition === 'wrong-server-owner' ? 'another-parent' : 'parent', totalElapsedSeconds: 1, updatedAt: new Date(fixture.now).toISOString() } as any);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue([{ ...fixture.periods.m[0], id: 'new-server-period', createdByUserId: 'parent' }] as any);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fixture.cachedStates.get('m')).toEqual(localState);
    expect(fixture.cachedPeriods.size).toBe(0);
  });
  it.each(['delete', 'end'])('rejects a snapshot begun before %s even after ACK/hard deletion', async correction => {
    signInFixture();
    fixture.states.m = { ...fixture.states.m, createdByUserId: 'parent', synced: true };
    fixture.periods.m = fixture.periods.m.map(p => ({ ...p, createdByUserId: 'parent', synced: true }));
    const originalPeriod = { ...fixture.periods.m[0] };
    fixture.cachedStates.set('m', fixture.states.m); fixture.cachedPeriods.set('m-p1', originalPeriod);
    const oldEvent = { id: 'old-event', matchId: 'm', kind: 'goal', teamId: 'home', createdAt: fixture.now, createdByUserId: 'parent', synced: true };
    fixture.events.m = [oldEvent]; fixture.cachedEvents.set(oldEvent.id, oldEvent);
    const response = deferred<any>(); vi.mocked(matchesApi.getMatchState).mockReturnValueOnce(response.promise);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue([{ ...originalPeriod, id: 'server-period' }] as any);
    vi.mocked(eventsApi.getByMatch).mockResolvedValue([oldEvent] as any);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    expect(vi.mocked(db.matches.get).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(matchesApi.getMatchState).mock.invocationCallOrder[0]);
    if (correction === 'delete') {
      fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }));
      await waitFor(() => expect(eventsApi.delete).toHaveBeenCalled());
      fixture.cachedEvents.delete(oldEvent.id);
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'End Period' }));
      await waitFor(() => expect(matchStateDataLayer.upsert).toHaveBeenCalled());
      fixture.cachedPeriods.set('m-p1', { ...originalPeriod, endedAt: fixture.now, durationSeconds: 600, synced: true });
      fixture.cachedStates.set('m', { ...fixture.states.m, synced: true });
    }
    fixture.cachedMatches.set('m', { ...fixture.cachedMatches.get('m'), recordingRevision: 1, synced: true });
    await act(async () => response.resolve({ matchId: 'm', status: 'LIVE', totalElapsedSeconds: 600, activeSince: new Date(fixture.now).toISOString(), updatedAt: new Date(fixture.now + 1_000).toISOString(), createdByUserId: 'parent' }));
    expect(db.matchState.put).not.toHaveBeenCalled();
    expect(db.matchPeriods.bulkPut).not.toHaveBeenCalled();
    expect(db.events.bulkPut).not.toHaveBeenCalled();
    if (correction === 'delete') expect(fixture.cachedEvents.has(oldEvent.id)).toBe(false);
    else {
      expect(fixture.cachedPeriods.get('m-p1').endedAt).toBe(fixture.now);
      expect(fixture.cachedStates.get('m')).toMatchObject({ status: 'PAUSED', timerMs: 600_000 });
    }
  });
  it('does not turn a pending-at-request-start snapshot into a clean import after ACK', async () => {
    signInFixture();
    fixture.cachedStates.set('m', { ...fixture.states.m, createdByUserId: 'parent', synced: false });
    const response = deferred<any>(); vi.mocked(matchesApi.getMatchState).mockReturnValueOnce(response.promise);
    render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    fixture.cachedStates.set('m', { ...fixture.cachedStates.get('m'), synced: true });
    await act(async () => response.resolve({ matchId: 'm', status: 'SCHEDULED', totalElapsedSeconds: 0, createdByUserId: 'parent', updatedAt: new Date(fixture.now).toISOString() }));
    expect(db.matchState.put).not.toHaveBeenCalled();
    expect(fixture.cachedStates.get('m').timerMs).toBe(600_000);
  });
});


describe('state provenance and lineup readiness', () => {
  it.each(['slow', 'offline', 'historical-period'])('blocks imported missing status (%s)', async condition => {
    signInFixture(); fixture.states.m = undefined;
    if (condition !== 'historical-period') fixture.periods.m = [];
    else fixture.periods.m = fixture.periods.m.map(p => ({ ...p, synced: true }));
    const response = deferred<any>(); vi.mocked(matchesApi.getMatchState).mockReturnValue(response.promise);
    render(<LiveMatchPage matchId="m" />);
    await screen.findByText(/Match state needs restore. Connect/);
    expect(screen.getByRole('button', { name: 'Kick Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Team Changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kick Off' }));
    if (condition !== 'slow') await act(async () => response.reject(new Error('Offline')));
    expect(matchPeriodsDataLayer.create).not.toHaveBeenCalled(); expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
  });
  it.each(['acked-edit', 'attempted', 'foreign-period', 'local-score'])('does not trust missing state for local-looking %s', async condition => {
    fixture.states.m = undefined; fixture.matches.m = { ...fixture.matches.m, synced: false };
    fixture.periods.m = condition === 'foreign-period' ? [{ ...fixture.periods.m[0], createdByUserId: 'another-owner' }] : [];
    if (condition === 'acked-edit') fixture.matches.m.syncedAt = new Date().toISOString();
    if (condition === 'attempted') fixture.matches.m.syncAttempted = true;
    if (condition === 'local-score') fixture.matches.m.homeScore = 2;
    render(<LiveMatchPage matchId="m" />);
    await screen.findByText(/Match state needs restore. Connect/);
    expect(screen.getByRole('button', { name: 'Kick Off' })).toBeDisabled();
    expect(matchStateDataLayer.upsert).not.toHaveBeenCalled();
  });
  it.each(['empty', 'periods', 'events', 'local-period', 'local-event', 'score', 'unknown-score', 'invalid-score', 'pending', 'revision'])('handles confirmed 404 with %s through durable guard', async condition => {
    signInFixture(); fixture.states.m = undefined; fixture.periods.m = [];
    const response = deferred<any>(); vi.mocked(matchesApi.getMatchState).mockReturnValue(response.promise);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue(condition === 'periods' ? [{ id: 'history', matchId: 'm' }] as any : []);
    vi.mocked(eventsApi.getByMatch).mockResolvedValue(condition === 'events' ? [{ id: 'history', matchId: 'm' }] as any : []);
    if (condition === 'score') fixture.cachedMatches.set('m', { ...fixture.cachedMatches.get('m'), homeScore: 2, awayScore: 1 });
    if (condition === 'unknown-score') fixture.cachedMatches.set('m', { ...fixture.cachedMatches.get('m'), homeScore: undefined });
    if (condition === 'invalid-score') fixture.cachedMatches.set('m', { ...fixture.cachedMatches.get('m'), homeScore: NaN });
    if (condition === 'local-period') fixture.cachedPeriods.set('history', { id: 'history', matchId: 'm', createdByUserId: 'parent', synced: true });
    if (condition === 'local-event') fixture.cachedEvents.set('history', { id: 'history', matchId: 'm', createdByUserId: 'parent', synced: true });
    if (condition === 'pending') fixture.cachedEvents.set('pending', { id: 'pending', matchId: 'm', createdByUserId: 'parent', synced: false });
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(matchesApi.getMatchState).toHaveBeenCalled());
    if (condition === 'revision') fixture.cachedMatches.set('m', { ...fixture.cachedMatches.get('m'), recordingRevision: 1 });
    if (condition === 'pending') fixture.cachedEvents.set('pending', { ...fixture.cachedEvents.get('pending'), synced: true });
    await act(async () => response.reject(new ApiRequestError('Missing state', 404)));
    if (condition === 'empty') {
      await waitFor(() => expect(fixture.cachedStates.get('m')).toMatchObject({ status: 'SCHEDULED', createdByUserId: 'parent', synced: true }));
      fixture.states.m = fixture.cachedStates.get('m'); view.rerender(<LiveMatchPage matchId="m" />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Kick Off' })).toBeEnabled());
    } else {
      expect(db.matchState.put).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Kick Off' })).toBeDisabled();
    }
  });
  it.each(['SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'POSTPONED'])('imports authoritative %s status before enabling recording', async status => {
    signInFixture(); fixture.states.m = undefined; fixture.periods.m = [];
    const active = status === 'LIVE' || status === 'PAUSED';
    vi.mocked(matchesApi.getMatchState).mockResolvedValue({ matchId: 'm', status, createdByUserId: 'parent', totalElapsedSeconds: active ? 600 : 0, activeSince: status === 'LIVE' ? new Date(fixture.now).toISOString() : undefined, createdAt: new Date(fixture.now).toISOString() } as any);
    vi.mocked(matchesApi.getMatchPeriods).mockResolvedValue(active ? [{ id: 'server-period', matchId: 'm', periodNumber: 1, periodType: 'REGULAR', startedAt: new Date(fixture.now - 600000).toISOString(), createdByUserId: 'parent' }] as any : []);
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(fixture.cachedStates.get('m')).toMatchObject({ status, createdByUserId: 'parent', timerMs: active ? 600000 : 0 }));
    fixture.states.m = fixture.cachedStates.get('m'); fixture.periods.m = [...fixture.cachedPeriods.values()];
    await act(async () => { view.rerender(<LiveMatchPage matchId="m" />); await Promise.resolve(); });
    if (active) await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('10:00'));
    if (['COMPLETED', 'CANCELLED', 'POSTPONED'].includes(status)) expect(screen.getByRole('button', { name: 'Team Changes' })).toBeDisabled();
  });
  it.each(['SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'POSTPONED'])('gates Team Changes for known %s', async status => {
    fixture.states.m = { ...fixture.states.m, status };
    render(<LiveMatchPage matchId="m" />);
    const button = await screen.findByRole('button', { name: 'Team Changes' });
    if (['COMPLETED', 'CANCELLED', 'POSTPONED'].includes(status)) {
      expect(button).toBeDisabled(); fireEvent.click(button); expect(screen.queryByTestId('team-changes-dialog')).not.toBeInTheDocument();
    } else {
      await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); await screen.findByTestId('team-changes-dialog');
    }
  });
  it.each(['route', 'account', 'unknown', 'completed'])('invalidates open Team Changes on %s', async change => {
    const view = render(<LiveMatchPage matchId="m" />);
    const button = await screen.findByRole('button', { name: 'Team Changes' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); await screen.findByTestId('team-changes-dialog');
    if (change === 'account') signInFixture();
    if (change === 'unknown') fixture.states.m = undefined;
    if (change === 'completed') fixture.states.m = { ...fixture.states.m, status: 'COMPLETED' };
    view.rerender(<LiveMatchPage matchId={change === 'route' ? 'other' : 'm'} />);
    await waitFor(() => expect(screen.queryByTestId('team-changes-dialog')).not.toBeInTheDocument());
  });
});


describe('persisted score baseline', () => {
  it('keeps partial timeline from replacing owned saved score, including update and Undo', async () => {
    fixture.matches.m = { ...fixture.matches.m, homeScore: 2, awayScore: 1 };
    fixture.events.m = [{ id: 'cached-goal', matchId: 'm', teamId: 'home', kind: 'goal', createdAt: fixture.now, createdByUserId: 'guest-parent' }];
    const view = render(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(document.querySelector('.live-header')).toHaveTextContent('2 - 1'));
    fixture.matches.m = { ...fixture.matches.m, homeScore: 3 };
    fixture.events.m = [...fixture.events.m, { ...fixture.events.m[0], id: 'new-goal' }];
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(document.querySelector('.live-header')).toHaveTextContent('3 - 1'));
    fixture.matches.m = { ...fixture.matches.m, homeScore: 2 };
    fixture.events.m = fixture.events.m.filter(event => event.id !== 'new-goal');
    view.rerender(<LiveMatchPage matchId="m" />);
    await waitFor(() => expect(document.querySelector('.live-header')).toHaveTextContent('2 - 1'));
  });
});
