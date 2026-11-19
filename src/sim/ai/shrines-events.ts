import { Rng } from '../rng';

// --- E3: World Shrines & Buff Timers ---
export const WORLD_SHRINE_KINDS = ['haste', 'xp', 'mana', 'fortune', 'danger'] as const;
export type WorldShrineKind = (typeof WORLD_SHRINE_KINDS)[number];

export interface WorldShrine {
  id: number;
  kind: WorldShrineKind;
  x: number;
  y: number;
  cooldownTicks: number;
}

export interface ActiveShrineBuff {
  kind: WorldShrineKind;
  remainingTicks: number;
}

const SHRINE_DURATION: Record<WorldShrineKind, number> = {
  haste: 750, // 30s
  xp: 1500, // 60s
  mana: 1000, // 40s
  fortune: 1500, // 60s
  danger: 750, // 30s (higher risk, bonus elite spawn)
};
const SHRINE_COOLDOWN = 2250; // 90s
const SHRINE_CODE: Record<WorldShrineKind, number> = { haste: 1, xp: 2, mana: 3, fortune: 4, danger: 5 };

// --- E6: Quest State Machines (Wave Defense, Escort, Hunt) ---
export type QuestKind = 'wave_defense' | 'escort' | 'hunt';
export type QuestStatus = 'active' | 'completed' | 'failed';

export interface WaveDefenseQuest {
  id: number;
  kind: 'wave_defense';
  status: QuestStatus;
  currentWave: number;
  totalWaves: number;
  waveTimerTicks: number;
  remainingInWave: number;
  objectiveHp: number;
  maxObjectiveHp: number;
}

export interface EscortQuest {
  id: number;
  kind: 'escort';
  status: QuestStatus;
  escortHp: number;
  maxEscortHp: number;
  waypointIndex: number;
  totalWaypoints: number;
}

export interface HuntQuest {
  id: number;
  kind: 'hunt';
  status: QuestStatus;
  targetName: string;
  targetId: number;
  slain: boolean;
}

export type DynamicQuest = WaveDefenseQuest | EscortQuest | HuntQuest;

// --- E12: Waypoint Fast-Travel Registry ---
export interface WaypointNode {
  id: number;
  key: string;
  x: number;
  y: number;
  unlocked: boolean;
}

// --- E13: Deterministic Roaming Events ---
export type RoamingEventKind = 'ambush' | 'caravan' | 'fog_wraiths';

export interface RoamingEventState {
  id: number;
  kind: RoamingEventKind;
  x: number;
  y: number;
  remainingTicks: number;
  resolved: boolean;
  succeeded: boolean;
}

export interface WorldEventsSnapshot {
  rngState: number;
  nextId: number;
  shrines: WorldShrine[];
  buffs: ActiveShrineBuff[];
  quests: DynamicQuest[];
  waypoints: WaypointNode[];
  events: RoamingEventState[];
  roamCooldown: number;
}

const QUEST_CODE: Record<QuestKind, number> = { wave_defense: 1, escort: 2, hunt: 3 };
const STATUS_CODE: Record<QuestStatus, number> = { active: 1, completed: 2, failed: 3 };
const EVENT_CODE: Record<RoamingEventKind, number> = { ambush: 1, caravan: 2, fog_wraiths: 3 };

/**
 * Deterministic World Shrines, Quests (Wave Defense / Escort / Hunt),
 * Waypoint Registry, and Roaming Events (E3, E6, E12, E13).
 */
export class WorldEventsDirector {
  private rng: Rng;
  private nextId = 1;
  readonly shrines: WorldShrine[] = [];
  readonly buffs: ActiveShrineBuff[] = [];
  readonly quests: DynamicQuest[] = [];
  readonly waypoints: WaypointNode[] = [];
  readonly events: RoamingEventState[] = [];
  roamCooldown = 300;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  addShrine(kind: WorldShrineKind, x: number, y: number): WorldShrine {
    const s: WorldShrine = { id: this.nextId++, kind, x: x | 0, y: y | 0, cooldownTicks: 0 };
    this.shrines.push(s);
    return s;
  }

  activateShrine(shrineId: number): ActiveShrineBuff | null {
    const s = this.shrines.find((x) => x.id === shrineId);
    if (!s || s.cooldownTicks > 0) return null;
    s.cooldownTicks = SHRINE_COOLDOWN;
    const duration = SHRINE_DURATION[s.kind];
    const existing = this.buffs.find((b) => b.kind === s.kind);
    if (existing) {
      existing.remainingTicks = duration;
      return existing;
    }
    const buff: ActiveShrineBuff = { kind: s.kind, remainingTicks: duration };
    this.buffs.push(buff);
    return buff;
  }

  hasBuff(kind: WorldShrineKind): boolean {
    return this.buffs.some((b) => b.kind === kind && b.remainingTicks > 0);
  }

  // --- Quests (E6) ---
  startWaveDefense(totalWaves = 3, objectiveHp = 500, foesPerWave = 5): WaveDefenseQuest {
    const q: WaveDefenseQuest = {
      id: this.nextId++,
      kind: 'wave_defense',
      status: 'active',
      currentWave: 1,
      totalWaves: Math.max(1, totalWaves | 0),
      waveTimerTicks: 150,
      remainingInWave: Math.max(1, foesPerWave | 0),
      objectiveHp: objectiveHp | 0,
      maxObjectiveHp: Math.max(1, objectiveHp | 0),
    };
    this.quests.push(q);
    return q;
  }

  damageWaveObjective(questId: number, damage: number): void {
    const q = this.quests.find((x) => x.id === questId && x.kind === 'wave_defense') as WaveDefenseQuest | undefined;
    if (!q || q.status !== 'active' || damage <= 0) return;
    q.objectiveHp = Math.max(0, q.objectiveHp - (damage | 0));
    if (q.objectiveHp === 0) q.status = 'failed';
  }

  recordWaveFoeKilled(questId: number, foesPerNextWave = 6): void {
    const q = this.quests.find((x) => x.id === questId && x.kind === 'wave_defense') as WaveDefenseQuest | undefined;
    if (!q || q.status !== 'active') return;
    if (q.remainingInWave > 0) q.remainingInWave--;
    if (q.remainingInWave === 0) {
      if (q.currentWave >= q.totalWaves) {
        q.status = 'completed';
      } else {
        q.currentWave++;
        q.remainingInWave = Math.max(1, foesPerNextWave | 0);
        q.waveTimerTicks = 150;
      }
    }
  }

  startEscort(totalWaypoints = 4, escortHp = 300): EscortQuest {
    const q: EscortQuest = {
      id: this.nextId++,
      kind: 'escort',
      status: 'active',
      escortHp: escortHp | 0,
      maxEscortHp: Math.max(1, escortHp | 0),
      waypointIndex: 0,
      totalWaypoints: Math.max(1, totalWaypoints | 0),
    };
    this.quests.push(q);
    return q;
  }

  advanceEscort(questId: number): void {
    const q = this.quests.find((x) => x.id === questId && x.kind === 'escort') as EscortQuest | undefined;
    if (!q || q.status !== 'active') return;
    q.waypointIndex++;
    if (q.waypointIndex >= q.totalWaypoints) q.status = 'completed';
  }

  damageEscort(questId: number, damage: number): void {
    const q = this.quests.find((x) => x.id === questId && x.kind === 'escort') as EscortQuest | undefined;
    if (!q || q.status !== 'active' || damage <= 0) return;
    q.escortHp = Math.max(0, q.escortHp - (damage | 0));
    if (q.escortHp === 0) q.status = 'failed';
  }

  startHunt(targetName: string, targetId: number): HuntQuest {
    const q: HuntQuest = {
      id: this.nextId++,
      kind: 'hunt',
      status: 'active',
      targetName,
      targetId: targetId | 0,
      slain: false,
    };
    this.quests.push(q);
    return q;
  }

  onUnitSlain(unitId: number): void {
    for (let i = 0; i < this.quests.length; i++) {
      const q = this.quests[i];
      if (q.kind === 'hunt' && q.status === 'active' && q.targetId === unitId) {
        q.slain = true;
        q.status = 'completed';
      }
    }
  }

  // --- Waypoints (E12) ---
  registerWaypoint(key: string, x: number, y: number, unlocked = false): WaypointNode {
    const wp: WaypointNode = { id: this.nextId++, key, x: x | 0, y: y | 0, unlocked };
    this.waypoints.push(wp);
    return wp;
  }

  unlockWaypoint(key: string): boolean {
    const wp = this.waypoints.find((w) => w.key === key);
    if (!wp || wp.unlocked) return false;
    wp.unlocked = true;
    return true;
  }

  canFastTravel(fromKey: string, toKey: string): WaypointNode | null {
    const src = this.waypoints.find((w) => w.key === fromKey);
    const dst = this.waypoints.find((w) => w.key === toKey);
    if (!src || !dst || !src.unlocked || !dst.unlocked || src.key === dst.key) return null;
    return dst;
  }

  // --- Roaming Events (E13) ---
  spawnRoamingEvent(kind: RoamingEventKind, x: number, y: number, durationTicks = 500): RoamingEventState {
    const ev: RoamingEventState = {
      id: this.nextId++,
      kind,
      x: x | 0,
      y: y | 0,
      remainingTicks: Math.max(1, durationTicks | 0),
      resolved: false,
      succeeded: false,
    };
    this.events.push(ev);
    return ev;
  }

  resolveRoamingEvent(eventId: number, succeeded: boolean): void {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev || ev.resolved) return;
    ev.resolved = true;
    ev.succeeded = succeeded;
    ev.remainingTicks = 0;
  }

  step(heroX: number, heroY: number, isFoggy = false): void {
    // Tick shrine cooldowns
    for (let i = 0; i < this.shrines.length; i++) {
      if (this.shrines[i].cooldownTicks > 0) this.shrines[i].cooldownTicks--;
    }

    // Tick active buffs (compact expired in reverse)
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      this.buffs[i].remainingTicks--;
      if (this.buffs[i].remainingTicks <= 0) this.buffs.splice(i, 1);
    }

    // Tick wave defense timers
    for (let i = 0; i < this.quests.length; i++) {
      const q = this.quests[i];
      if (q.kind === 'wave_defense' && q.status === 'active' && q.waveTimerTicks > 0) {
        q.waveTimerTicks--;
      }
    }

    // Tick roaming events & deterministic spawn cadence
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (!ev.resolved && ev.remainingTicks > 0) {
        ev.remainingTicks--;
        if (ev.remainingTicks === 0) {
          ev.resolved = true;
          ev.succeeded = ev.kind === 'caravan';
        }
      }
    }

    if (this.roamCooldown > 0) {
      this.roamCooldown--;
    } else {
      this.roamCooldown = this.hasBuff('danger') ? 250 : 450;
      const roll = this.rng.int(3);
      const kind: RoamingEventKind = isFoggy && roll === 2 ? 'fog_wraiths' : roll === 0 ? 'ambush' : 'caravan';
      const ox = (this.rng.int(9) - 4) * 256;
      const oy = (this.rng.int(9) - 4) * 256;
      this.spawnRoamingEvent(kind, (heroX | 0) + ox, (heroY | 0) + oy, 400);
    }
  }

  hashInto(mix: (v: number) => void): void {
    mix(this.rng.state);
    mix(this.nextId);
    mix(this.roamCooldown);
    mix(this.shrines.length);
    for (let i = 0; i < this.shrines.length; i++) {
      const s = this.shrines[i];
      mix(s.id);
      mix(SHRINE_CODE[s.kind]);
      mix(s.x);
      mix(s.y);
      mix(s.cooldownTicks);
    }
    mix(this.buffs.length);
    for (let i = 0; i < this.buffs.length; i++) {
      mix(SHRINE_CODE[this.buffs[i].kind]);
      mix(this.buffs[i].remainingTicks);
    }
    mix(this.quests.length);
    for (let i = 0; i < this.quests.length; i++) {
      const q = this.quests[i];
      mix(q.id);
      mix(QUEST_CODE[q.kind]);
      mix(STATUS_CODE[q.status]);
      if (q.kind === 'wave_defense') {
        mix(q.currentWave);
        mix(q.waveTimerTicks);
        mix(q.remainingInWave);
        mix(q.objectiveHp);
      } else if (q.kind === 'escort') {
        mix(q.escortHp);
        mix(q.waypointIndex);
      } else {
        mix(q.targetId);
        mix(q.slain ? 1 : 0);
      }
    }
    mix(this.waypoints.length);
    for (let i = 0; i < this.waypoints.length; i++) {
      const w = this.waypoints[i];
      mix(w.id);
      mix(w.x);
      mix(w.y);
      mix(w.unlocked ? 1 : 0);
    }
    mix(this.events.length);
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      mix(e.id);
      mix(EVENT_CODE[e.kind]);
      mix(e.x);
      mix(e.y);
      mix(e.remainingTicks);
      mix(e.resolved ? 1 : 0);
      mix(e.succeeded ? 1 : 0);
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

  snapshot(): WorldEventsSnapshot {
    return {
      rngState: this.rng.state,
      nextId: this.nextId,
      shrines: this.shrines.map((s) => ({ ...s })),
      buffs: this.buffs.map((b) => ({ ...b })),
      quests: this.quests.map((q) => ({ ...q })),
      waypoints: this.waypoints.map((w) => ({ ...w })),
      events: this.events.map((e) => ({ ...e })),
      roamCooldown: this.roamCooldown,
    };
  }

  restore(snap: WorldEventsSnapshot): void {
    this.rng.state = snap.rngState >>> 0;
    this.nextId = snap.nextId;
    this.roamCooldown = snap.roamCooldown;
    this.shrines.length = 0;
    for (const s of snap.shrines) this.shrines.push({ ...s });
    this.buffs.length = 0;
    for (const b of snap.buffs) this.buffs.push({ ...b });
    this.quests.length = 0;
    for (const q of snap.quests) this.quests.push({ ...q });
    this.waypoints.length = 0;
    for (const w of snap.waypoints) this.waypoints.push({ ...w });
    this.events.length = 0;
    for (const e of snap.events) this.events.push({ ...e });
  }
}
