import { Rng } from '../rng';

export const ELITE_AFFIXES = ['fast', 'vampiric', 'shielded', 'teleporting', 'fire_aura'] as const;
export type EliteAffix = (typeof ELITE_AFFIXES)[number];

export interface EliteMemberState {
  id: number;
  x: number; // fixed-point (FP = 256) or tile*256
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface ElitePack {
  packId: number;
  leaderId: number;
  affixes: EliteAffix[];
  members: EliteMemberState[];
  shieldHp: number;
  maxShieldHp: number;
  shieldRegenCd: number;
  teleportCd: number;
  fireAuraCd: number;
}

export interface LootCritter {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  escapeTicks: number;
  alive: boolean;
  escaped: boolean;
  tier: number;
}

export interface EliteTickEvent {
  kind: 'fire_aura' | 'teleport' | 'shield_regen' | 'vampiric_heal' | 'critter_flee' | 'critter_escape' | 'critter_slain';
  actorId: number;
  x: number;
  y: number;
  amount: number;
}

export interface EliteDirectorSnapshot {
  rngState: number;
  nextId: number;
  packs: ElitePack[];
  critters: LootCritter[];
}

const FP = 256;
const FIRE_AURA_INTERVAL = 25;
const FIRE_AURA_RADIUS_SQ = (2 * FP) * (2 * FP);
const TELEPORT_INTERVAL = 125;
const SHIELD_REGEN_INTERVAL = 100;
const CRITTER_ESCAPE_TICKS = 750;
const CRITTER_SPEED_FP = 48; // ~0.1875 tiles/tick (fast runner)

const AFFIX_CODE: Record<EliteAffix, number> = {
  fast: 1,
  vampiric: 2,
  shielded: 3,
  teleporting: 4,
  fire_aura: 5,
};

/**
 * Deterministic Elite Pack, Champion & Loot Critter Director (E3).
 * Uses integer coordinates (FP = 256) and seeded mulberry32 Rng.
 */
export class EliteDirector {
  private rng: Rng;
  private nextId = 1;
  readonly packs: ElitePack[] = [];
  readonly critters: LootCritter[] = [];

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** Roll `count` distinct affixes deterministically from `ELITE_AFFIXES`. */
  rollAffixes(count: number): EliteAffix[] {
    const pool: EliteAffix[] = [...ELITE_AFFIXES];
    const n = Math.max(1, Math.min(count, pool.length));
    const out: EliteAffix[] = [];
    for (let i = 0; i < n; i++) {
      const idx = this.rng.int(pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  /** Spawn an elite pack with deterministic affixes. */
  spawnPack(
    members: ReadonlyArray<{ id: number; x: number; y: number; maxHp: number }>,
    affixCount = 2,
    forcedAffixes?: readonly EliteAffix[],
  ): ElitePack {
    const affixes = forcedAffixes ? [...forcedAffixes] : this.rollAffixes(affixCount);
    const hasShield = affixes.includes('shielded');
    const leaderHp = members[0]?.maxHp ?? 100;
    const maxShieldHp = hasShield ? Math.max(20, Math.floor(leaderHp / 2)) : 0;

    const sortedMembers: EliteMemberState[] = [...members]
      .sort((a, b) => a.id - b.id)
      .map((m) => ({
        id: m.id,
        x: m.x | 0,
        y: m.y | 0,
        hp: m.maxHp | 0,
        maxHp: m.maxHp | 0,
        alive: true,
      }));

    const pack: ElitePack = {
      packId: this.nextId++,
      leaderId: sortedMembers[0]?.id ?? 0,
      affixes,
      members: sortedMembers,
      shieldHp: maxShieldHp,
      maxShieldHp,
      shieldRegenCd: 0,
      teleportCd: 0,
      fireAuraCd: 0,
    };
    this.packs.push(pack);
    return pack;
  }

  /** Spawn a roaming loot critter at fixed-point coordinates (x, y). */
  spawnLootCritter(x: number, y: number, tier = 1, maxHp = 120): LootCritter {
    const critter: LootCritter = {
      id: this.nextId++,
      x: x | 0,
      y: y | 0,
      hp: maxHp | 0,
      maxHp: maxHp | 0,
      escapeTicks: CRITTER_ESCAPE_TICKS,
      alive: true,
      escaped: false,
      tier: Math.max(1, tier | 0),
    };
    this.critters.push(critter);
    return critter;
  }

  /** Speed multiplier in percent for a pack (135 if `fast`, else 100). */
  getSpeedPct(packId: number): number {
    const pack = this.packs.find((p) => p.packId === packId);
    if (!pack) return 100;
    return pack.affixes.includes('fast') ? 135 : 100;
  }

  /** Apply incoming damage to a pack member; absorbs with `shielded` ward first. */
  damageMember(packId: number, memberId: number, rawDamage: number): number {
    const pack = this.packs.find((p) => p.packId === packId);
    if (!pack) return 0;
    const m = pack.members.find((u) => u.id === memberId);
    if (!m || !m.alive || rawDamage <= 0) return 0;

    let dmg = rawDamage | 0;
    if (pack.shieldHp > 0) {
      const absorbed = Math.min(pack.shieldHp, dmg);
      pack.shieldHp -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      m.hp = Math.max(0, m.hp - dmg);
      if (m.hp === 0) m.alive = false;
    }
    return dmg;
  }

  /** Apply vampiric heal when an elite deals `dealtDamage`. */
  onEliteDealDamage(packId: number, memberId: number, dealtDamage: number): number {
    const pack = this.packs.find((p) => p.packId === packId);
    if (!pack || !pack.affixes.includes('vampiric') || dealtDamage <= 0) return 0;
    const m = pack.members.find((u) => u.id === memberId);
    if (!m || !m.alive) return 0;
    const heal = Math.max(1, Math.floor((dealtDamage * 20) / 100));
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + heal);
    return m.hp - before;
  }

  /** Damage a loot critter; returns true if slain. */
  damageCritter(critterId: number, damage: number): boolean {
    const c = this.critters.find((u) => u.id === critterId);
    if (!c || !c.alive || damage <= 0) return false;
    c.hp = Math.max(0, c.hp - (damage | 0));
    if (c.hp === 0) {
      c.alive = false;
      return true;
    }
    return false;
  }

  /**
   * Advance all elite packs and loot critters by 1 tick.
   * `heroX`, `heroY` are in fixed-point (FP = 256).
   */
  step(heroX: number, heroY: number, eventsOut?: EliteTickEvent[]): void {
    const hx = heroX | 0;
    const hy = heroY | 0;

    for (let i = 0; i < this.packs.length; i++) {
      const p = this.packs[i];
      const leader = p.members.find((m) => m.alive);
      if (!leader) continue;

      if (p.affixes.includes('shielded') && p.shieldHp < p.maxShieldHp) {
        if (p.shieldRegenCd > 0) p.shieldRegenCd--;
        else {
          const gain = Math.max(5, Math.floor(p.maxShieldHp / 4));
          p.shieldHp = Math.min(p.maxShieldHp, p.shieldHp + gain);
          p.shieldRegenCd = SHIELD_REGEN_INTERVAL;
          eventsOut?.push({ kind: 'shield_regen', actorId: leader.id, x: leader.x, y: leader.y, amount: gain });
        }
      }

      if (p.affixes.includes('fire_aura')) {
        if (p.fireAuraCd > 0) p.fireAuraCd--;
        else {
          p.fireAuraCd = FIRE_AURA_INTERVAL;
          const dx = hx - leader.x;
          const dy = hy - leader.y;
          if (dx * dx + dy * dy <= FIRE_AURA_RADIUS_SQ) {
            eventsOut?.push({ kind: 'fire_aura', actorId: leader.id, x: hx, y: hy, amount: 8 });
          }
        }
      }

      if (p.affixes.includes('teleporting')) {
        if (p.teleportCd > 0) p.teleportCd--;
        else {
          const dx = hx - leader.x;
          const dy = hy - leader.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > (4 * FP) * (4 * FP) || leader.hp * 2 <= leader.maxHp) {
            const ox = (this.rng.int(5) - 2) * FP;
            const oy = (this.rng.int(5) - 2) * FP;
            leader.x = hx + ox;
            leader.y = hy + oy;
            p.teleportCd = TELEPORT_INTERVAL;
            eventsOut?.push({ kind: 'teleport', actorId: leader.id, x: leader.x, y: leader.y, amount: 0 });
          }
        }
      }
    }

    for (let i = 0; i < this.critters.length; i++) {
      const c = this.critters[i];
      if (!c.alive) continue;
      if (c.escapeTicks > 0) {
        c.escapeTicks--;
        const dx = c.x - hx;
        const dy = c.y - hy;
        const stepX = dx === 0 ? (this.rng.int(3) - 1) * CRITTER_SPEED_FP : dx > 0 ? CRITTER_SPEED_FP : -CRITTER_SPEED_FP;
        const stepY = dy === 0 ? (this.rng.int(3) - 1) * CRITTER_SPEED_FP : dy > 0 ? CRITTER_SPEED_FP : -CRITTER_SPEED_FP;
        c.x += stepX;
        c.y += stepY;
        eventsOut?.push({ kind: 'critter_flee', actorId: c.id, x: c.x, y: c.y, amount: c.escapeTicks });
      }
      if (c.escapeTicks === 0 && c.alive) {
        c.alive = false;
        c.escaped = true;
        eventsOut?.push({ kind: 'critter_escape', actorId: c.id, x: c.x, y: c.y, amount: 0 });
      }
    }
  }

  hashInto(mix: (v: number) => void): void {
    mix(this.rng.state);
    mix(this.nextId);
    mix(this.packs.length);
    for (let i = 0; i < this.packs.length; i++) {
      const p = this.packs[i];
      mix(p.packId);
      mix(p.leaderId);
      mix(p.shieldHp);
      mix(p.shieldRegenCd);
      mix(p.teleportCd);
      mix(p.fireAuraCd);
      mix(p.affixes.length);
      for (let a = 0; a < p.affixes.length; a++) mix(AFFIX_CODE[p.affixes[a]]);
      mix(p.members.length);
      for (let m = 0; m < p.members.length; m++) {
        const u = p.members[m];
        mix(u.id);
        mix(u.x);
        mix(u.y);
        mix(u.hp);
        mix(u.alive ? 1 : 0);
      }
    }
    mix(this.critters.length);
    for (let i = 0; i < this.critters.length; i++) {
      const c = this.critters[i];
      mix(c.id);
      mix(c.x);
      mix(c.y);
      mix(c.hp);
      mix(c.escapeTicks);
      mix(c.alive ? 1 : 0);
      mix(c.escaped ? 1 : 0);
      mix(c.tier);
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

  snapshot(): EliteDirectorSnapshot {
    return {
      rngState: this.rng.state,
      nextId: this.nextId,
      packs: this.packs.map((p) => ({
        ...p,
        affixes: [...p.affixes],
        members: p.members.map((m) => ({ ...m })),
      })),
      critters: this.critters.map((c) => ({ ...c })),
    };
  }

  restore(snap: EliteDirectorSnapshot): void {
    this.rng.state = snap.rngState >>> 0;
    this.nextId = snap.nextId;
    this.packs.length = 0;
    for (const p of snap.packs) {
      this.packs.push({
        ...p,
        affixes: [...p.affixes],
        members: p.members.map((m) => ({ ...m })),
      });
    }
    this.critters.length = 0;
    for (const c of snap.critters) {
      this.critters.push({ ...c });
    }
  }
}
