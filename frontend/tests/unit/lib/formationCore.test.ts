import { describe, it, expect } from 'vitest';
import {
  generateSlotsForFormation,
  buildFormationSummary,
  PlayerOnPitch,
} from '../../../src/lib/formationCore';

function playersFromSlots(formation: string): PlayerOnPitch[] {
  const slots = generateSlotsForFormation(formation);
  // Use exactly the generated coordinates; include all slots
  // buildFormationSummary expects players on pitch (GK included is fine)
  return slots.map((s, idx) => ({ id: `p${idx+1}`, x: s.x, y: s.y }));
}

const FORMATIONS_OUTFIELD = [
  '2', '2-1', '1-2', '2-2', '1-2-1', '2-2-1', '1-3-1',
  '2-3-1', '3-2-1', '2-2-2', '3-3-1', '2-3-2', '3-2-2',
  '3-3-2', '4-3-1', '2-3-3', '4-4-1', '3-4-2', '4-3-2', '5-3-1', '3-5-1',
  '4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '3-4-3',
];

describe('formationCore: buildFormationSummary matches generated slots', () => {
  it('returns the expected label for a variety of formations', () => {
    for (const f of FORMATIONS_OUTFIELD) {
      const players = playersFromSlots(f);
      const summary = buildFormationSummary(players);
      expect(summary.labelOutfield).toBe(f);
    }
  });
});

