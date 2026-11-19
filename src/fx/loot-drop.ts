/**
 * A10 — Loot Drop Feel:
 * - Parabolic bounce arc solver for dropped loot (with gravity & restitution)
 * - Rarity-colored vertical light beam for rare / unique / set drops (capped)
 * - Rarity ping event trigger
 * - Loot filter toggle ('all' | 'magic+' | 'rare+' | 'unique+')
 */

import type { ItemRarity } from '../sim/town';
import { type FxConfig } from './config';
import { RARITY_COLORS } from './cursor-target';
import { FxPool } from './pool';

export type LootFilterMode = 'all' | 'magic+' | 'rare+' | 'unique+';

const FILTER_ORDER: readonly LootFilterMode[] = ['all', 'magic+', 'rare+', 'unique+'];
const RARITY_RANK: Readonly<Record<ItemRarity, number>> = {
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 4,
};

export interface LootArcDrop {
  id: string;
  rarity: ItemRarity;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bounceCount: number;
  settled: boolean;
  pinged: boolean;
}

export interface LootBeam {
  id: string;
  x: number;
  y: number;
  color: number;
  height: number;
  width: number;
  alpha: number;
  pulsePhase: number;
  rarity: 'rare' | 'set' | 'unique';
}

export interface LootPingEvent {
  id: string;
  rarity: ItemRarity;
  x: number;
  y: number;
  color: number;
}

function createBeam(): LootBeam {
  return {
    id: '',
    x: 0,
    y: 0,
    color: RARITY_COLORS.rare,
    height: 96,
    width: 10,
    alpha: 0.75,
    pulsePhase: 0,
    rarity: 'rare',
  };
}

function resetBeam(b: LootBeam): void {
  b.id = '';
  b.x = 0;
  b.y = 0;
  b.color = RARITY_COLORS.rare;
  b.height = 96;
  b.width = 10;
  b.alpha = 0.75;
  b.pulsePhase = 0;
  b.rarity = 'rare';
}

export class LootDropSystem {
  readonly beams: FxPool<LootBeam>;
  private readonly drops = new Map<string, LootArcDrop>();
  private readonly pendingPings: LootPingEvent[] = [];
  private filterMode: LootFilterMode = 'all';
  private rngState = 0x243f6a88;

  constructor(private config: FxConfig) {
    this.beams = new FxPool<LootBeam>(24, createBeam, resetBeam, config.maxBeams);
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.beams.setCap(config.maxBeams);
  }

  getFilter(): LootFilterMode {
    return this.filterMode;
  }

  setFilter(mode: LootFilterMode): void {
    this.filterMode = mode;
  }

  /** Cycle through loot filter modes or toggle between 'all' and a target mode. */
  toggleFilter(targetMode?: LootFilterMode): LootFilterMode {
    if (targetMode) {
      this.filterMode = this.filterMode === targetMode ? 'all' : targetMode;
      return this.filterMode;
    }
    const idx = FILTER_ORDER.indexOf(this.filterMode);
    this.filterMode = FILTER_ORDER[(idx + 1) % FILTER_ORDER.length];
    return this.filterMode;
  }

  /** Check whether an item of given rarity passes the active loot filter. */
  isRarityVisible(rarity: ItemRarity): boolean {
    const rank = RARITY_RANK[rarity];
    switch (this.filterMode) {
      case 'magic+':
        return rank >= RARITY_RANK.magic;
      case 'rare+':
        return rank >= RARITY_RANK.rare;
      case 'unique+':
        return rank >= RARITY_RANK.set; // set & unique
      case 'all':
      default:
        return true;
    }
  }

  /**
   * Spawn a loot drop with an initial parabolic arc.
   * Emits a vertical light beam immediately for rare/set/unique, and triggers a ping event.
   */
  spawnDrop(
    id: string,
    x: number,
    y: number,
    rarity: ItemRarity,
    initialVelocity?: { vx: number; vy: number; vz: number },
  ): LootArcDrop {
    const angle = this.nextRand() * Math.PI * 2;
    const horizSpeed = 28 + this.nextRand() * 34;
    const drop: LootArcDrop = {
      id,
      rarity,
      x,
      y,
      z: 6,
      vx: initialVelocity?.vx ?? Math.cos(angle) * horizSpeed,
      vy: initialVelocity?.vy ?? Math.sin(angle) * horizSpeed * 0.7,
      vz: initialVelocity?.vz ?? (this.config.reducedMotion ? 80 : 145 + this.nextRand() * 45),
      bounceCount: 0,
      settled: false,
      pinged: false,
    };
    this.drops.set(id, drop);

    if (rarity === 'rare' || rarity === 'set' || rarity === 'unique') {
      this.spawnBeam(id, x, y, rarity);
    }

    if (rarity !== 'normal') {
      this.pendingPings.push({
        id,
        rarity,
        x,
        y,
        color: RARITY_COLORS[rarity],
      });
      drop.pinged = true;
    }

    return drop;
  }

  private spawnBeam(id: string, x: number, y: number, rarity: 'rare' | 'set' | 'unique'): void {
    const beam = this.beams.acquire();
    if (!beam) return;
    beam.id = id;
    beam.x = x;
    beam.y = y;
    beam.rarity = rarity;
    beam.color = RARITY_COLORS[rarity];
    beam.height = rarity === 'unique' ? 128 : rarity === 'set' ? 114 : 88;
    beam.width = rarity === 'unique' ? 12 : 9;
    beam.alpha = rarity === 'unique' ? 0.88 : 0.72;
    beam.pulsePhase = 0;
  }

  getDrop(id: string): LootArcDrop | undefined {
    return this.drops.get(id);
  }

  /** Remove a drop & its beam (e.g. when picked up). */
  removeDrop(id: string): void {
    this.drops.delete(id);
    this.beams.updateEach((b) => b.id !== id);
  }

  /** Drain queued rarity ping events for audio/HUD notification. */
  drainPingEvents(): LootPingEvent[] {
    if (this.pendingPings.length === 0) return [];
    return this.pendingPings.splice(0, this.pendingPings.length);
  }

  /** Step parabolic arc physics and beam pulse animations. */
  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;
    const gravity = 540;
    const restitution = 0.45;

    for (const drop of this.drops.values()) {
      if (drop.settled) continue;
      drop.vz -= gravity * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.z += drop.vz * dt;

      if (drop.z <= 0) {
        drop.z = 0;
        if (drop.bounceCount < 2 && Math.abs(drop.vz) > 40) {
          drop.vz = -drop.vz * restitution;
          drop.vx *= 0.55;
          drop.vy *= 0.55;
          drop.bounceCount++;
        } else {
          drop.vz = 0;
          drop.vx = 0;
          drop.vy = 0;
          drop.settled = true;
        }
      }

      // Keep beam anchored to the drop's ground position
      this.beams.forEachActive((b) => {
        if (b.id === drop.id) {
          b.x = drop.x;
          b.y = drop.y;
        }
      });
    }

    this.beams.updateEach((b) => {
      if (!this.drops.has(b.id)) return false;
      b.pulsePhase += dt * 4.2;
      const base = b.rarity === 'unique' ? 0.85 : 0.7;
      b.alpha = this.config.reducedMotion ? base : base + Math.sin(b.pulsePhase) * 0.14;
      return true;
    });
  }

  clear(): void {
    this.drops.clear();
    this.beams.clear();
    this.pendingPings.length = 0;
  }

  private nextRand(): number {
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
