/**
 * Formation Core (shared)
 * Single source of truth for:
 * - Zone geometry + zone detection from coordinates
 * - Zone -> line grouping (DEF/DM/CM/AM/FWD/GK)
 * - Formation label construction from players on pitch
 * - Side-aware slot generation for auto-placement
 * - Greedy, side-aware assignment of players to slots
 */

// ===== Types =====

export type ZoneCode =
  | 'GK'
  | 'CB' | 'LCB' | 'RCB' | 'SW'
  | 'LB' | 'RB' | 'LWB' | 'RWB' | 'WB' | 'FB'
  | 'CDM' | 'LDM' | 'RDM' | 'DM'
  | 'CM' | 'LCM' | 'RCM'
  | 'CAM' | 'LAM' | 'RAM' | 'AM'
  | 'LM' | 'RM' | 'WM'
  | 'LW' | 'RW' | 'LF' | 'RF'
  | 'CF' | 'ST' | 'SS';

export type LineGroup = 'GK' | 'DEF' | 'DM' | 'CM' | 'AM' | 'FWD';
export type SideTag = 'LL' | 'L' | 'C' | 'R' | 'RR';

export interface PlayerOnPitch {
  id: string;
  x: number; // 0..100
  y: number; // 0..100
  preferredPosition?: string;
  teamId?: string;
}

export interface Slot {
  x: number; // 0..100
  y: number; // 0..100
  line: LineGroup;
  side: SideTag;
}

export interface FormationSummary {
  outfieldVector: number[];   // e.g. [4,2,3,1]
  withGkVector: number[];     // e.g. [1,4,2,3,1]
  labelOutfield: string;      // e.g. "4-2-3-1"
  labelWithGk: string;        // e.g. "1-4-2-3-1"
}

export interface DebugOptions {
  enabled?: boolean;
  tag?: string;
}

// ===== Zone geometry (aligned with VisualPitchInterface) =====

interface Rect { minX: number; maxX: number; minY: number; maxY: number }
interface ZoneDef { code: ZoneCode; area: Rect; priority: number }

export const ZONES: ZoneDef[] = [
  // GK
  { code: 'GK', area: { minX: 0, maxX: 12, minY: 40, maxY: 60 }, priority: 1 },

  // DEF block
  { code: 'CB',  area: { minX: 12, maxX: 32, minY: 28, maxY: 72 }, priority: 2 },
  { code: 'LB',  area: { minX: 8,  maxX: 28, minY: 0,  maxY: 36 }, priority: 2 },
  { code: 'RB',  area: { minX: 8,  maxX: 28, minY: 64, maxY: 100 }, priority: 2 },
  { code: 'LWB', area: { minX: 24, maxX: 42, minY: 0,  maxY: 32 }, priority: 2 },
  { code: 'RWB', area: { minX: 24, maxX: 42, minY: 68, maxY: 100 }, priority: 2 },
  { code: 'WB',  area: { minX: 24, maxX: 42, minY: 20, maxY: 80 }, priority: 1 },
  { code: 'FB',  area: { minX: 12, maxX: 32, minY: 20, maxY: 80 }, priority: 1 },

  // DM / CM / AM
  { code: 'CDM', area: { minX: 34, maxX: 52, minY: 30, maxY: 70 }, priority: 3 },
  { code: 'DM',  area: { minX: 34, maxX: 52, minY: 30, maxY: 70 }, priority: 1 },
  { code: 'CM',  area: { minX: 54, maxX: 58, minY: 24, maxY: 76 }, priority: 3 },
  { code: 'LCM', area: { minX: 50, maxX: 56, minY: 24, maxY: 50 }, priority: 1 },
  { code: 'RCM', area: { minX: 50, maxX: 56, minY: 50, maxY: 76 }, priority: 1 },
  { code: 'CAM', area: { minX: 60, maxX: 66, minY: 30, maxY: 70 }, priority: 3 },
  { code: 'LAM', area: { minX: 60, maxX: 68, minY:  8, maxY: 36 }, priority: 2 },
  { code: 'RAM', area: { minX: 60, maxX: 68, minY: 64, maxY: 92 }, priority: 2 },
  { code: 'AM',  area: { minX: 60, maxX: 68, minY: 24, maxY: 76 }, priority: 1 },
  { code: 'LM',  area: { minX: 40, maxX: 62, minY:  0, maxY: 30 }, priority: 3 },
  { code: 'RM',  area: { minX: 40, maxX: 62, minY: 70, maxY: 100 }, priority: 3 },
  { code: 'WM',  area: { minX: 40, maxX: 62, minY: 20, maxY: 80 }, priority: 1 },

  // Forwards
  { code: 'LW',  area: { minX: 76, maxX: 98, minY:  0, maxY: 36 }, priority: 4 },
  { code: 'RW',  area: { minX: 76, maxX: 98, minY: 64, maxY: 100 }, priority: 4 },
  { code: 'CF',  area: { minX: 72, maxX: 96, minY: 30, maxY: 70 }, priority: 4 },
  { code: 'ST',  area: { minX: 82, maxX: 100,minY: 24, maxY: 76 }, priority: 4 },
  { code: 'SS',  area: { minX: 70, maxX: 90, minY: 30, maxY: 70 }, priority: 2 },
  { code: 'LF',  area: { minX: 80, maxX: 98, minY:  0, maxY: 40 }, priority: 2 },
  { code: 'RF',  area: { minX: 80, maxX: 98, minY: 60, maxY: 100 }, priority: 2 },
];

// ===== Utilities =====

const dbg = (opts: DebugOptions | undefined, ...args: any[]) => {
  if (!opts?.enabled) return;
  // eslint-disable-next-line no-console
  console.debug('[formationCore]' + (opts.tag ? `(${opts.tag})` : ''), ...args);
};

export function zoneFromCoord(x: number, y: number): ZoneCode {
  // Matching zones
  const inZones = ZONES.filter(z => x >= z.area.minX && x <= z.area.maxX && y >= z.area.minY && y <= z.area.maxY);
  if (inZones.length) return inZones.reduce((b, c) => (c.priority < b.priority ? c : b)).code;
  // Nearest zone by rect distance
  let best: ZoneCode = 'CM';
  let bestDist = Infinity;
  let bestPr = 999;
  for (const z of ZONES) {
    const dx = x < z.area.minX ? (z.area.minX - x) : (x > z.area.maxX ? (x - z.area.maxX) : 0);
    const dy = y < z.area.minY ? (z.area.minY - y) : (y > z.area.maxY ? (y - z.area.maxY) : 0);
    const d = Math.hypot(dx, dy);
    if (d < bestDist || (d === bestDist && z.priority < bestPr)) {
      best = z.code; bestDist = d; bestPr = z.priority;
    }
  }
  return best;
}

export function lineGroupForZone(zone: ZoneCode): LineGroup {
  const z = zone.toUpperCase();
  if (z === 'GK') return 'GK';
  if (['CB','LCB','RCB','SW','LB','RB','LWB','RWB','WB','FB'].includes(z)) return 'DEF';
  if (['CDM','DM','LDM','RDM'].includes(z)) return 'DM';
  // Treat wide mids (LM/RM/WM) as CM-line for counting
  if (['CM','LCM','RCM','LM','RM','WM'].includes(z)) return 'CM';
  if (['CAM','LAM','RAM','AM'].includes(z)) return 'AM';
  return 'FWD';
}

export function lineGroupForPreferred(pos?: string): LineGroup {
  if (!pos) return 'FWD';
  return lineGroupForZone(pos as ZoneCode);
}

export function sidePreferenceForPreferred(pos?: string): 'L'|'C'|'R' {
  if (!pos) return 'C';
  const p = pos.toUpperCase();
  if (p.startsWith('L')) return 'L';
  if (p.startsWith('R')) return 'R';
  return 'C';
}

export function buildFormationSummary(players: PlayerOnPitch[], opts?: DebugOptions): FormationSummary {
  // Count by lines using zone detection
  let def=0, dm=0, cm=0, am=0, fwd=0, gk=0;
  for (const p of players) {
    const zone = zoneFromCoord(p.x, p.y);
    const g = lineGroupForZone(zone);
    if (g === 'GK') gk++; else if (g === 'DEF') def++; else if (g === 'DM') dm++;
    else if (g === 'CM') cm++; else if (g === 'AM') am++; else fwd++;
  }
  // Default GK if none detected but players exist
  if (players.length && gk === 0) gk = 1;

  const outfield4 = [def, dm, cm, am, fwd];
  const hasAM = am > 0;
  let out: number[];
  if (hasAM) {
    // 4-line (DEF-DM/CM-AM-FWD) -> combine DM+CM
    out = [def, dm, cm, am, fwd];
    const vec = [out[0], out[1] + out[2], out[3], out[4]].filter(n => n > 0);
    const label = vec.join('-');
    return { outfieldVector: vec, withGkVector: [1, ...vec], labelOutfield: label, labelWithGk: `1-${label}` };
  } else {
    // 3-line (DEF-(DM+CM+AM)-FWD)
    const vec = [def, dm + cm + am, fwd].filter(n => n > 0);
    const label = vec.join('-');
    return { outfieldVector: vec, withGkVector: [1, ...vec], labelOutfield: label, labelWithGk: `1-${label}` };
  }
}

export function suggestFormationsByCount(totalOnPitch: number): string[] {
  if (totalOnPitch <= 1) return [];
  const outfield = Math.max(0, totalOnPitch - 1);
  // Return up to 5 sensible suggestions per outfield count
  const pick = (arr: string[]) => arr.slice(0, 5);
  switch (outfield) {
    case 2: return pick(['2']);
    case 3: return pick(['2-1', '1-2']);
    case 4: return pick(['2-2', '1-2-1']);
    case 5: return pick(['2-2-1', '1-3-1', '2-1-2']);
    case 6: return pick(['2-3-1', '3-2-1', '2-2-2']);
    case 7: return pick(['3-3-1', '2-3-2', '3-2-2']);
    case 8: return pick(['3-3-2', '4-3-1', '2-3-3']);
    case 9: return pick(['4-4-1', '3-4-2', '4-3-2', '5-3-1', '3-5-1']);
    case 10: // full 11-a-side
    default:
      return pick(['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '3-4-3']);
  }
}

// ===== Slot generation (side-labelled) =====

export function generateSlotsForFormation(formation: string): Slot[] {
  const parts = formation.split('-').map(s => Math.max(0, parseInt((s || '0').trim(), 10) || 0));
  const slots: Slot[] = [];
  // GK
  slots.push({ x: 8, y: 50, line: 'GK', side: 'C' });
  // Choose line Xs based on number of parts to ensure the last band is FWD
  const chooseLineXs = (L: number): Array<{ x: number; line: LineGroup }> => {
  if (L <= 1) return [{ x: 56, line: 'CM' as LineGroup }];
    if (L === 2) return [
      { x: 24, line: 'DEF' },
      { x: 88, line: 'FWD' },
    ];
    if (L === 3) return [
      { x: 24, line: 'DEF' },
      { x: 56, line: 'CM' },
      { x: 88, line: 'FWD' },
    ];
    if (L === 4) return [
      { x: 24, line: 'DEF' },
      { x: 46, line: 'DM' },
      { x: 66, line: 'AM' },
      { x: 88, line: 'FWD' },
    ];
    // 5 or more -> DEF, DM, CM, AM, FWD
    return [
      { x: 24, line: 'DEF' },
      { x: 42, line: 'DM' },
      { x: 56, line: 'CM' },
      { x: 66, line: 'AM' },
      { x: 88, line: 'FWD' },
    ];
  };
  const lineXs = chooseLineXs(parts.length);

  const lineYs = (count: number): Array<{ y: number; side: SideTag }> => {
    // Wider spread: y in [8..92]
    const minY = 8, maxY = 92;
    if (count <= 0) return [];
    if (count === 1) return [{ y: 50, side: 'C' }];
    if (count === 2) return [{ y: 24, side: 'L' }, { y: 76, side: 'R' }];
    if (count === 3) return [{ y: 20, side: 'L' }, { y: 50, side: 'C' }, { y: 80, side: 'R' }];
    if (count === 4) return [
      { y: 12, side: 'LL' }, { y: 38, side: 'L' }, { y: 62, side: 'R' }, { y: 88, side: 'RR' }
    ];
    // 5 or more -> LL, L, C, R, RR
    return [
      { y: 8, side: 'LL' }, { y: 34, side: 'L' }, { y: 50, side: 'C' }, { y: 66, side: 'R' }, { y: 92, side: 'RR' }
    ];
  };

  for (let i = 0; i < parts.length; i++) {
    const count = parts[i];
    const cfg = lineXs[Math.min(i, lineXs.length - 1)];
    const ys = lineYs(count);
    for (const y of ys) slots.push({ x: cfg.x, y: y.y, line: cfg.line, side: y.side });
  }
  return slots;
}

// ===== Greedy side-aware assignment =====

function sideScore(preferred: 'L'|'C'|'R', slot: SideTag): number {
  if (slot === 'C') return preferred === 'C' ? 0 : 1;
  if (slot === 'L' || slot === 'LL') return preferred === 'L' ? 0 : (preferred === 'C' ? 1 : 2);
  if (slot === 'R' || slot === 'RR') return preferred === 'R' ? 0 : (preferred === 'C' ? 1 : 2);
  return 1;
}

function lineAffinityScore(playerLine: LineGroup, slotLine: LineGroup): number {
  if (playerLine === slotLine) return 0;
  // Neighboring line penalty (closer is cheaper)
  const order: LineGroup[] = ['DEF','DM','CM','AM','FWD'];
  const i = order.indexOf(playerLine === 'GK' ? 'DEF' : playerLine);
  const j = order.indexOf(slotLine === 'GK' ? 'DEF' : slotLine);
  return Math.abs(i - j) * 2; // each step costs 2
}

export interface AssignmentResult {
  positions: Record<string, { x: number; y: number }>;
  unassigned: string[];
}

export function assignPlayersToSlots(players: PlayerOnPitch[], slots: Slot[], opts?: DebugOptions): AssignmentResult {
  const positions: Record<string, { x: number; y: number }> = {};
  const pool = players.map(p => ({
    p,
    line: lineGroupForPreferred(p.preferredPosition),
    side: sidePreferenceForPreferred(p.preferredPosition),
  }));

  // Order slots GK -> DEF -> DM -> CM -> AM -> FWD, side: LLL/C/RRR
  const lineOrder: LineGroup[] = ['GK','DEF','DM','CM','AM','FWD'];
  const sideOrder: SideTag[] = ['LL','L','C','R','RR'];
  const orderedSlots = [...slots].sort((a, b) => {
    const dl = lineOrder.indexOf(a.line) - lineOrder.indexOf(b.line);
    if (dl !== 0) return dl;
    return sideOrder.indexOf(a.side) - sideOrder.indexOf(b.side);
  });

  for (const s of orderedSlots) {
    let bestIdx = -1; let bestCost = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      const cost = lineAffinityScore(it.line, s.line) + sideScore(it.side, s.side);
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      const it = pool.splice(bestIdx, 1)[0];
      positions[it.p.id] = { x: s.x, y: s.y };
      dbg(opts, 'assign', { player: it.p.id, slot: s, cost: bestCost, line: it.line, side: it.side });
    }
  }

  const unassigned = pool.map(it => it.p.id);
  return { positions, unassigned };
}

// Convenience: build label and slots in one go
export function labelForPlayers(players: PlayerOnPitch[]): FormationSummary {
  return buildFormationSummary(players);
}

export default {
  ZONES,
  zoneFromCoord,
  lineGroupForZone,
  lineGroupForPreferred,
  sidePreferenceForPreferred,
  buildFormationSummary,
  suggestFormationsByCount,
  generateSlotsForFormation,
  assignPlayersToSlots,
  labelForPlayers,
};
