import { Rng } from '../rng';

export type CampaignBossId = 'morvessa' | 'gorrathul' | 'vesperion' | 'ashkarath';
export type HazardShape = 'circle' | 'line' | 'cone' | 'ring';

export interface BossProfile {
  id: CampaignBossId;
  phase2Pct: number;
  phase3Pct: number;
  enrageTicks: number;
  hazardCooldown: number;
  maxAdds: number;
  addKind: string;
  primaryShape: HazardShape;
  phase3Shape: HazardShape;
  baseDamage: number;
}

export const BOSS_PROFILES: Record<CampaignBossId, BossProfile> = {
  morvessa: {
    id: 'morvessa',
    phase2Pct: 65,
    phase3Pct: 30,
    enrageTicks: 4500,
    hazardCooldown: 75,
    maxAdds: 4,
    addKind: 'spiderling',
    primaryShape: 'cone',
    phase3Shape: 'ring',
    baseDamage: 24,
  },
  gorrathul: {
    id: 'gorrathul',
    phase2Pct: 60,
    phase3Pct: 25,
    enrageTicks: 5000,
    hazardCooldown: 80,
    maxAdds: 3,
    addKind: 'dune_worm',
    primaryShape: 'circle',
    phase3Shape: 'ring',
    baseDamage: 32,
  },
  vesperion: {
    id: 'vesperion',
    phase2Pct: 65,
    phase3Pct: 30,
    enrageTicks: 5500,
    hazardCooldown: 70,
    maxAdds: 4,
    addKind: 'drowned_crew',
    primaryShape: 'line',
    phase3Shape: 'ring',
    baseDamage: 38,
  },
  ashkarath: {
    id: 'ashkarath',
    phase2Pct: 70,
    phase3Pct: 35,
    enrageTicks: 6000,
    hazardCooldown: 65,
    maxAdds: 4,
    addKind: 'obsidian_sentinel',
    primaryShape: 'cone',
    phase3Shape: 'ring',
    baseDamage: 46,
  },
};

export interface TelegraphedHazard {
  id: number;
  shape: HazardShape;
  x: number;
  y: number;
  radius: number;
  windupTicks: number;
  damage: number;
  detonated: boolean;
}

export interface BossEncounterState {
  bossId: CampaignBossId;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  elapsedTicks: number;
  enraged: boolean;
  hazardCd: number;
  addSpawnCd: number;
  activeAdds: number;
  totalAddsSpawned: number;
  defeated: boolean;
}

export interface BossTickEvent {
  kind: 'phase_change' | 'enrage' | 'telegraph_spawn' | 'hazard_detonate' | 'add_spawn';
  bossId: CampaignBossId;
  value: number;
  x?: number;
  y?: number;
}

export interface BossDirectorSnapshot {
  rngState: number;
  nextHazardId: number;
  encounter: BossEncounterState;
  hazards: TelegraphedHazard[];
}

const SHAPE_CODE: Record<HazardShape, number> = { circle: 1, line: 2, cone: 3, ring: 4 };
const BOSS_CODE: Record<CampaignBossId, number> = { morvessa: 1, gorrathul: 2, vesperion: 3, ashkarath: 4 };
const FP = 256;

/**
 * Deterministic Boss Phase State Machine & Telegraphed AoE Hazard Controller (E4).
 */
export class BossPhaseController {
  private rng: Rng;
  private nextHazardId = 1;
  readonly encounter: BossEncounterState;
  readonly hazards: TelegraphedHazard[] = [];

  constructor(bossId: CampaignBossId, maxHp: number, seed: number) {
    this.rng = new Rng(seed);
    const prof = BOSS_PROFILES[bossId];
    this.encounter = {
      bossId,
      hp: maxHp | 0,
      maxHp: Math.max(1, maxHp | 0),
      phase: 1,
      elapsedTicks: 0,
      enraged: false,
      hazardCd: prof.hazardCooldown,
      addSpawnCd: 150,
      activeAdds: 0,
      totalAddsSpawned: 0,
      defeated: false,
    };
  }

  /** Apply damage to the boss and update phase immediately if thresholds are crossed. */
  damageBoss(amount: number, eventsOut?: BossTickEvent[]): number {
    if (this.encounter.defeated || amount <= 0) return 0;
    const before = this.encounter.hp;
    this.encounter.hp = Math.max(0, this.encounter.hp - (amount | 0));
    if (this.encounter.hp === 0) {
      this.encounter.defeated = true;
    } else {
      this.evaluatePhase(eventsOut);
    }
    return before - this.encounter.hp;
  }

  /** Notify controller that one of the boss's active adds died. */
  onAddKilled(): void {
    if (this.encounter.activeAdds > 0) this.encounter.activeAdds--;
  }

  private evaluatePhase(eventsOut?: BossTickEvent[]): void {
    const e = this.encounter;
    const prof = BOSS_PROFILES[e.bossId];
    const hpPct = Math.floor((e.hp * 100) / e.maxHp);
    let nextPhase: 1 | 2 | 3 = e.phase;
    if (hpPct <= prof.phase3Pct) nextPhase = 3;
    else if (hpPct <= prof.phase2Pct && e.phase < 2) nextPhase = 2;

    if (nextPhase !== e.phase) {
      e.phase = nextPhase;
      eventsOut?.push({ kind: 'phase_change', bossId: e.bossId, value: nextPhase });
    }
  }

  /** Advance boss state machine and hazard telegraphs by 1 tick. */
  step(targetX: number, targetY: number, eventsOut?: BossTickEvent[]): void {
    const e = this.encounter;
    if (e.defeated) return;
    const prof = BOSS_PROFILES[e.bossId];

    e.elapsedTicks++;
    this.evaluatePhase(eventsOut);

    if (!e.enraged && e.elapsedTicks >= prof.enrageTicks) {
      e.enraged = true;
      eventsOut?.push({ kind: 'enrage', bossId: e.bossId, value: e.elapsedTicks });
    }

    // Telegraphed hazard cooldown
    if (e.hazardCd > 0) {
      e.hazardCd--;
    } else {
      const cdScale = e.enraged ? 2 : e.phase === 3 ? 1.5 : 1;
      e.hazardCd = Math.max(25, Math.floor(prof.hazardCooldown / cdScale));
      const shape = e.phase === 3 ? prof.phase3Shape : prof.primaryShape;
      const jitterX = (this.rng.int(3) - 1) * Math.floor(FP / 2);
      const jitterY = (this.rng.int(3) - 1) * Math.floor(FP / 2);
      const dmgMul = e.enraged ? 2 : 1;
      const hazard: TelegraphedHazard = {
        id: this.nextHazardId++,
        shape,
        x: (targetX | 0) + jitterX,
        y: (targetY | 0) + jitterY,
        radius: e.phase === 3 ? 3 * FP : 2 * FP,
        windupTicks: e.phase === 3 ? 25 : 35,
        damage: prof.baseDamage * dmgMul,
        detonated: false,
      };
      this.hazards.push(hazard);
      eventsOut?.push({ kind: 'telegraph_spawn', bossId: e.bossId, value: hazard.id, x: hazard.x, y: hazard.y });
    }

    // Add spawns in Phase 2+
    if (e.phase >= 2) {
      if (e.addSpawnCd > 0) {
        e.addSpawnCd--;
      } else if (e.activeAdds < prof.maxAdds) {
        e.addSpawnCd = e.phase === 3 ? 150 : 225;
        const spawnCount = Math.min(2, prof.maxAdds - e.activeAdds);
        e.activeAdds += spawnCount;
        e.totalAddsSpawned += spawnCount;
        eventsOut?.push({ kind: 'add_spawn', bossId: e.bossId, value: spawnCount });
      }
    }

    // Tick active hazards
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      if (h.detonated) continue;
      if (h.windupTicks > 0) h.windupTicks--;
      if (h.windupTicks === 0) {
        h.detonated = true;
        eventsOut?.push({ kind: 'hazard_detonate', bossId: e.bossId, value: h.damage, x: h.x, y: h.y });
      }
    }
  }

  hashInto(mix: (v: number) => void): void {
    const e = this.encounter;
    mix(this.rng.state);
    mix(this.nextHazardId);
    mix(BOSS_CODE[e.bossId]);
    mix(e.hp);
    mix(e.maxHp);
    mix(e.phase);
    mix(e.elapsedTicks);
    mix(e.enraged ? 1 : 0);
    mix(e.hazardCd);
    mix(e.addSpawnCd);
    mix(e.activeAdds);
    mix(e.totalAddsSpawned);
    mix(e.defeated ? 1 : 0);
    mix(this.hazards.length);
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      mix(h.id);
      mix(SHAPE_CODE[h.shape]);
      mix(h.x);
      mix(h.y);
      mix(h.radius);
      mix(h.windupTicks);
      mix(h.damage);
      mix(h.detonated ? 1 : 0);
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

  snapshot(): BossDirectorSnapshot {
    return {
      rngState: this.rng.state,
      nextHazardId: this.nextHazardId,
      encounter: { ...this.encounter },
      hazards: this.hazards.map((h) => ({ ...h })),
    };
  }

  restore(snap: BossDirectorSnapshot): void {
    this.rng.state = snap.rngState >>> 0;
    this.nextHazardId = snap.nextHazardId;
    Object.assign(this.encounter, snap.encounter);
    this.hazards.length = 0;
    for (const h of snap.hazards) this.hazards.push({ ...h });
  }
}
