import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LineupManagementModal from '../../../src/components/lineup/LineupManagementModal';
import formationsApi from '../../../src/services/api/formationsApi';
vi.mock('../../../src/components/lineup/index', () => ({ VisualPitchInterface: () => null, PlayerSelectionPanel: () => null }));
vi.mock('../../../src/services/api/teamsApi', () => ({ default: { getTeamPlayers: async () => ({ data: [] }) } }));
vi.mock('../../../src/services/api/formationsApi', () => ({ default: { getCurrent: vi.fn(async () => ({ players: [{ id: 'player', name: 'Alex', position: { x: 50, y: 50 } }] })), applyChange: vi.fn(), setCached: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe('pending formation dialog context', () => {
  it.each(['closed', 'route', 'team', 'unmount', 'readiness'])('invalidates captured apply after %s', async change => {
    let resolve!: (value: any) => void;
    vi.mocked(formationsApi.applyChange).mockImplementation(() => new Promise(done => { resolve = done; }));
    let current = true;
    const changed = vi.fn();
    const props = { isOpen: true, onClose: vi.fn(), matchId: 'original', selectedTeamId: 'away', currentMinute: 12, onFormationChanged: changed, canApply: () => current };
    const view = render(<LineupManagementModal {...props} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));
    const args = vi.mocked(formationsApi.applyChange).mock.calls[0];
    expect(args.slice(0, 2)).toEqual(['original', 12]); expect(args[4]?.teamId).toBe('away'); expect(args[4]?.isCurrent()).toBe(true);
    if (change === 'unmount') view.unmount();
    else if (change === 'readiness') current = false;
    else view.rerender(<LineupManagementModal {...props} isOpen={change !== 'closed'} matchId={change === 'route' ? 'next' : 'original'} selectedTeamId={change === 'team' ? 'home' : 'away'} />);
    expect(args[4]?.isCurrent()).toBe(false);
    await act(async () => resolve({ success: true }));
    expect(changed).not.toHaveBeenCalled(); expect(formationsApi.setCached).not.toHaveBeenCalled();
  });
});
