// --- E10 & E11: Difficulty Tiers & Hardcore Ironman Rules ---
export type DifficultyTierName = 'Wanderer' | 'Veteran' | 'Doomed';

export interface DifficultyTierSpec {
  id: 0 | 1 | 2;
  name: DifficultyTierName;
  enemyHpPct: number;
  enemyDmgPct: number;
  dropRarityBonusPct: number;
  maxEliteAffixes: number;
  resistPenalty: number;
}

export const DIFFICULTY_TIERS: readonly DifficultyTierSpec[] = [
  { id: 0, name: 'Wanderer', enemyHpPct: 100, enemyDmgPct: 100, dropRarityBonusPct: 0, maxEliteAffixes: 2, resistPenalty: 0 },
  { id: 1, name: 'Veteran', enemyHpPct: 160, enemyDmgPct: 145, dropRarityBonusPct: 50, maxEliteAffixes: 3, resistPenalty: -25 },
  { id: 2, name: 'Doomed', enemyHpPct: 240, enemyDmgPct: 210, dropRarityBonusPct: 120, maxEliteAffixes: 4, resistPenalty: -50 },
];

export interface HardcoreHeroRecord {
  hardcore: boolean;
  fallen: boolean;
  deaths: number;
}

export function createHardcoreRecord(hardcore: boolean): HardcoreHeroRecord {
  return { hardcore, fallen: false, deaths: 0 };
}

/** Returns true if the hero is permanently locked out (hardcore death). */
export function recordHeroDeath(rec: HardcoreHeroRecord): boolean {
  rec.deaths++;
  if (rec.hardcore) {
    rec.fallen = true;
    return true;
  }
  return false;
}

// --- E14: Skirmish Mode Variants ---
export type SkirmishModeKind = 'capture_shrines' | 'survive_waves' | 'king_of_the_hill';
export type SkirmishMatchOutcome = 'ongoing' | 'team0_win' | 'team1_win';

export interface ControlPoint {
  id: number;
  x: number;
  y: number;
  owner: -1 | 0 | 1;
  progress: number; // -100..100 (negative = team 1, positive = team 0)
}

export interface SkirmishModeState {
  mode: SkirmishModeKind;
  outcome: SkirmishMatchOutcome;
  tick: number;
  targetScore: number;
  team0Score: number;
  team1Score: number;
  waveIndex: number;
  targetWaves: number;
  waveFoesRemaining: number;
  points: ControlPoint[];
}

export interface SkirmishUnitPresence {
  team: 0 | 1;
  x: number;
  y: number;
  alive: boolean;
}

export interface SkirmishModeSnapshot {
  state: SkirmishModeState;
}

const MODE_CODE: Record<SkirmishModeKind, number> = {
  capture_shrines: 1,
  survive_waves: 2,
  king_of_the_hill: 3,
};
const OUTCOME_CODE: Record<SkirmishMatchOutcome, number> = {
  ongoing: 0,
  team0_win: 1,
  team1_win: 2,
};

const CAPTURE_RADIUS_SQ = (3 * 256) * (3 * 256);

/**
 * Deterministic Skirmish Mode State Machine (E14):
 * - `capture_shrines`: hold shrines to accumulate score to `targetScore`
 * - `survive_waves`: clear `targetWaves` escalating waves
 * - `king_of_the_hill`: control central hill without contest to reach `targetScore`
 */
export class SkirmishModeController {
  readonly state: SkirmishModeState;

  constructor(
    mode: SkirmishModeKind,
    points: ReadonlyArray<{ x: number; y: number }> = [{ x: 16 * 256, y: 16 * 256 }],
    targetScore = 200,
    targetWaves = 5,
  ) {
    this.state = {
      mode,
      outcome: 'ongoing',
      tick: 0,
      targetScore: Math.max(10, targetScore | 0),
      team0Score: 0,
      team1Score: 0,
      waveIndex: 1,
      targetWaves: Math.max(1, targetWaves | 0),
      waveFoesRemaining: mode === 'survive_waves' ? 6 : 0,
      points: points.map((p, idx) => ({
        id: idx + 1,
        x: p.x | 0,
        y: p.y | 0,
        owner: -1,
        progress: 0,
      })),
    };
  }

  /** Notify `survive_waves` mode that a wave enemy was defeated. */
  onWaveEnemySlain(): void {
    const s = this.state;
    if (s.mode !== 'survive_waves' || s.outcome !== 'ongoing') return;
    if (s.waveFoesRemaining > 0) s.waveFoesRemaining--;
    if (s.waveFoesRemaining === 0) {
      if (s.waveIndex >= s.targetWaves) {
        s.outcome = 'team0_win';
      } else {
        s.waveIndex++;
        s.waveFoesRemaining = 6 + (s.waveIndex - 1) * 3;
      }
    }
  }

  /** Notify `survive_waves` mode that the defending hero/base fell. */
  onDefenderDefeated(): void {
    if (this.state.mode === 'survive_waves' && this.state.outcome === 'ongoing') {
      this.state.outcome = 'team1_win';
    }
  }

  step(units: readonly SkirmishUnitPresence[]): void {
    const s = this.state;
    if (s.outcome !== 'ongoing') return;
    s.tick++;

    if (s.mode === 'survive_waves') return;

    for (let i = 0; i < s.points.length; i++) {
      const pt = s.points[i];
      let t0 = 0;
      let t1 = 0;
      for (let u = 0; u < units.length; u++) {
        const unit = units[u];
        if (!unit.alive) continue;
        const dx = unit.x - pt.x;
        const dy = unit.y - pt.y;
        if (dx * dx + dy * dy <= CAPTURE_RADIUS_SQ) {
          if (unit.team === 0) t0++;
          else t1++;
        }
      }

      if (t0 > 0 && t1 === 0) {
        pt.progress = Math.min(100, pt.progress + 10);
        if (pt.progress >= 100) pt.owner = 0;
      } else if (t1 > 0 && t0 === 0) {
        pt.progress = Math.max(-100, pt.progress - 10);
        if (pt.progress <= -100) pt.owner = 1;
      }

      if (pt.owner === 0) s.team0Score++;
      else if (pt.owner === 1) s.team1Score++;
    }

    if (s.team0Score >= s.targetScore) s.outcome = 'team0_win';
    else if (s.team1Score >= s.targetScore) s.outcome = 'team1_win';
  }

  hashInto(mix: (v: number) => void): void {
    const s = this.state;
    mix(MODE_CODE[s.mode]);
    mix(OUTCOME_CODE[s.outcome]);
    mix(s.tick);
    mix(s.targetScore);
    mix(s.team0Score);
    mix(s.team1Score);
    mix(s.waveIndex);
    mix(s.targetWaves);
    mix(s.waveFoesRemaining);
    mix(s.points.length);
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i];
      mix(p.id);
      mix(p.x);
      mix(p.y);
      mix(p.owner + 2);
      mix(p.progress);
    }
  }

  hash(): number {
    let h = 0x811c9dc5;
    this.hashInto((v) => {
      h = Math.imul(h ^ (v & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    });
    return h >>> 0;
  }

  snapshot(): SkirmishModeSnapshot {
    return {
      state: {
        ...this.state,
        points: this.state.points.map((p) => ({ ...p })),
      },
    };
  }

  restore(snap: SkirmishModeSnapshot): void {
    Object.assign(this.state, snap.state);
    this.state.points = snap.state.points.map((p) => ({ ...p }));
  }
}
