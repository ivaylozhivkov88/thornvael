import { Elem, strike } from './combat';
import { FP } from './path';
import type { Sim } from './sim';
import { NST, St } from './spelldata';
import { addStatus } from './spells';

/**
 * Classic ARPG Paladin Aura Roster and Simulation Engine
 * Based on The Amazon Basin Wiki specifications:
 * https://www.theamazonbasin.com/wiki/index.php?title=Aura
 *
 * All 17 authentic auras implemented:
 * - 9 Offensive: Might, Holy Fire, Thorns, Blessed Aim, Holy Freeze, Holy Shock, Sanctuary, Fanaticism, Conviction
 * - 8 Defensive & Utility: Prayer, Defiance, Cleansing, Vigor, Meditation, Redemption, Salvation, Concentration
 */

export type AuraCategory = 'offensive' | 'defensive_utility';

export type AuraId =
  | 'might'
  | 'holy_fire'
  | 'thorns'
  | 'blessed_aim'
  | 'holy_freeze'
  | 'holy_shock'
  | 'sanctuary'
  | 'fanaticism'
  | 'conviction'
  | 'prayer'
  | 'defiance'
  | 'cleansing'
  | 'vigor'
  | 'meditation'
  | 'redemption'
  | 'salvation'
  | 'concentration';

export const OFFENSIVE_AURAS: readonly AuraId[] = [
  'might',
  'holy_fire',
  'thorns',
  'blessed_aim',
  'holy_freeze',
  'holy_shock',
  'sanctuary',
  'fanaticism',
  'conviction',
] as const;

export const DEFENSIVE_UTILITY_AURAS: readonly AuraId[] = [
  'prayer',
  'defiance',
  'cleansing',
  'vigor',
  'meditation',
  'redemption',
  'salvation',
  'concentration',
] as const;

export const ALL_AURA_IDS: readonly AuraId[] = [
  ...OFFENSIVE_AURAS,
  ...DEFENSIVE_UTILITY_AURAS,
] as const;

export interface AuraDefinition {
  readonly id: AuraId;
  readonly name: string;
  readonly category: AuraCategory;
  readonly minLevel: number;
  readonly basinDescription: string;
  readonly primaryColor: number;
  readonly secondaryColor: number;
  readonly accentColor: number;
  readonly radiusTiles: number;
  readonly pulseIntervalTicks: number;
  readonly target: 'allies' | 'enemies' | 'both';
}

export const AURA_DEFINITIONS: Record<AuraId, AuraDefinition> = {
  might: {
    id: 'might',
    name: 'Might',
    category: 'offensive',
    minLevel: 1,
    basinDescription:
      'Increases physical damage dealt by the Paladin and friendly party members within radius. Soft pulsing amber/orange ring with radiating mini-spikes.',
    primaryColor: 0xf59e0b,
    secondaryColor: 0xd97706,
    accentColor: 0xfde68a,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  holy_fire: {
    id: 'holy_fire',
    name: 'Holy Fire',
    category: 'offensive',
    minLevel: 6,
    basinDescription:
      'Periodically deals fire damage to all enemies within radius and adds fire damage to attacks. Blazing orange-crimson ground ring with rising flame tongues & periodic fire pulse.',
    primaryColor: 0xdc2626,
    secondaryColor: 0xea580c,
    accentColor: 0xfacc15,
    radiusTiles: 6,
    pulseIntervalTicks: 50,
    target: 'enemies',
  },
  thorns: {
    id: 'thorns',
    name: 'Thorns',
    category: 'offensive',
    minLevel: 6,
    basinDescription:
      'When enemies hit the Paladin or an ally with a melee attack, physical damage is reflected back to the attacker. Sharp jagged blood-red spikes pointing outward around feet.',
    primaryColor: 0xb91c1c,
    secondaryColor: 0x7f1d1d,
    accentColor: 0xef4444,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  blessed_aim: {
    id: 'blessed_aim',
    name: 'Blessed Aim',
    category: 'offensive',
    minLevel: 12,
    basinDescription:
      'Passively and actively boosts Attack Rating for the Paladin and friendly party members. Golden radial starburst ring with rotating rays.',
    primaryColor: 0xeab308,
    secondaryColor: 0xb45309,
    accentColor: 0xfef08a,
    radiusTiles: 6,
    pulseIntervalTicks: 25,
    target: 'allies',
  },
  holy_freeze: {
    id: 'holy_freeze',
    name: 'Holy Freeze',
    category: 'offensive',
    minLevel: 18,
    basinDescription:
      'Periodically does cold damage to all enemies within radius, chilling and slowing their attack and movement speeds. Cyan-ice jagged crystalline ring pulsing cold mist and freezing waves.',
    primaryColor: 0x0284c7,
    secondaryColor: 0x38bdf8,
    accentColor: 0xe0f2fe,
    radiusTiles: 7,
    pulseIntervalTicks: 25,
    target: 'enemies',
  },
  holy_shock: {
    id: 'holy_shock',
    name: 'Holy Shock',
    category: 'offensive',
    minLevel: 24,
    basinDescription:
      'Periodically deals lightning damage to all enemies within radius, and adds massive lightning damage to attacks. Crackling electric azure/white lightning arcs on ground with arcing sparks.',
    primaryColor: 0x0284c7,
    secondaryColor: 0x06b6d4,
    accentColor: 0xffffff,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'enemies',
  },
  sanctuary: {
    id: 'sanctuary',
    name: 'Sanctuary',
    category: 'offensive',
    minLevel: 24,
    basinDescription:
      'Deals magic damage periodically to undead creatures, knocks them back, and bypasses their physical resistances. Celestial white-turquoise runic mandala repelling & damaging undead.',
    primaryColor: 0x0d9488,
    secondaryColor: 0x2dd4bf,
    accentColor: 0xf0fdfa,
    radiusTiles: 7,
    pulseIntervalTicks: 25,
    target: 'enemies',
  },
  fanaticism: {
    id: 'fanaticism',
    name: 'Fanaticism',
    category: 'offensive',
    minLevel: 30,
    basinDescription:
      'Drastically increases attack speed, attack rating, and physical damage of the Paladin and party. Aggressive spinning serrated gold/crimson gear with orbiting motes.',
    primaryColor: 0x991b1b,
    secondaryColor: 0xd97706,
    accentColor: 0xfde047,
    radiusTiles: 7,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  conviction: {
    id: 'conviction',
    name: 'Conviction',
    category: 'offensive',
    minLevel: 30,
    basinDescription:
      'Shreds enemy defense and fire, cold, and lightning resistances for all enemies within radius. Eerie sickly green downward pointing runic spikes and glyph ring beneath enemies.',
    primaryColor: 0x15803d,
    secondaryColor: 0x22c55e,
    accentColor: 0x86efac,
    radiusTiles: 9,
    pulseIntervalTicks: 25,
    target: 'enemies',
  },
  prayer: {
    id: 'prayer',
    name: 'Prayer',
    category: 'defensive_utility',
    minLevel: 1,
    basinDescription:
      'Regenerates Life for the Paladin and all party members within radius. Soothing azure/white soft ring with rising healing glimmers.',
    primaryColor: 0x0284c7,
    secondaryColor: 0x60a5fa,
    accentColor: 0xffffff,
    radiusTiles: 8,
    pulseIntervalTicks: 25,
    target: 'allies',
  },
  defiance: {
    id: 'defiance',
    name: 'Defiance',
    category: 'defensive_utility',
    minLevel: 6,
    basinDescription:
      'Greatly increases Defense rating for the Paladin and all party members. Steely silver/blue fortified shield crests rotating on ground.',
    primaryColor: 0x334155,
    secondaryColor: 0x94a3b8,
    accentColor: 0x38bdf8,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  cleansing: {
    id: 'cleansing',
    name: 'Cleansing',
    category: 'defensive_utility',
    minLevel: 12,
    basinDescription:
      'Rapidly reduces poison and curse duration for the Paladin and all party members within radius. Emerald/teal mist ring rapidly reducing poison & curse duration.',
    primaryColor: 0x059669,
    secondaryColor: 0x10b981,
    accentColor: 0x6ee7b7,
    radiusTiles: 8,
    pulseIntervalTicks: 25,
    target: 'allies',
  },
  vigor: {
    id: 'vigor',
    name: 'Vigor',
    category: 'defensive_utility',
    minLevel: 18,
    basinDescription:
      'Boosts walk/run speed, maximum stamina, and stamina recovery for the Paladin and party. Fast spinning bright green directional chevron arrows with motion dust.',
    primaryColor: 0x16a34a,
    secondaryColor: 0x4ade80,
    accentColor: 0xbbf7d0,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  meditation: {
    id: 'meditation',
    name: 'Meditation',
    category: 'defensive_utility',
    minLevel: 24,
    basinDescription:
      'Dramatically increases Mana regeneration rate for the Paladin and all party members within radius. Deep sapphire/indigo mystical mandala ring.',
    primaryColor: 0x3730a3,
    secondaryColor: 0x6366f1,
    accentColor: 0xc7d2fe,
    radiusTiles: 8,
    pulseIntervalTicks: 25,
    target: 'allies',
  },
  redemption: {
    id: 'redemption',
    name: 'Redemption',
    category: 'defensive_utility',
    minLevel: 30,
    basinDescription:
      'Periodically attempts to redeem fallen monster corpses within radius, converting them into Life and Mana. Ethereal ghostly wisps rising from fallen monsters into the hero.',
    primaryColor: 0xb45309,
    secondaryColor: 0xf59e0b,
    accentColor: 0xffffff,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'both',
  },
  salvation: {
    id: 'salvation',
    name: 'Salvation',
    category: 'defensive_utility',
    minLevel: 30,
    basinDescription:
      'Dramatically increases Fire, Cold, and Lightning resistances for the Paladin and party. Radiant golden prism dome ring protecting against Fire, Cold, Lightning.',
    primaryColor: 0xd97706,
    secondaryColor: 0xef4444,
    accentColor: 0x38bdf8,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
  concentration: {
    id: 'concentration',
    name: 'Concentration',
    category: 'defensive_utility',
    minLevel: 18,
    basinDescription:
      'Increases physical damage and grants chance of uninterrupted attack. Golden dual concentric oscillating rings with floating runes.',
    primaryColor: 0x854d0e,
    secondaryColor: 0xd97706,
    accentColor: 0xfde047,
    radiusTiles: 8,
    pulseIntervalTicks: 50,
    target: 'allies',
  },
};

/** Get aura definition by ID */
export function getAuraDefinition(id: AuraId): AuraDefinition {
  return AURA_DEFINITIONS[id];
}

/** Check if string is a valid AuraId */
export function isAuraId(str: string): str is AuraId {
  return str in AURA_DEFINITIONS;
}

/**
 * Returns all active auras radiating from a unit.
 * Resolves explicit hero aura, explicit monster mods, and maps legacy D2 mods.
 */
export function getUnitActiveAuras(sim: Sim, unitId: number): AuraId[] {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) {
    return [];
  }

  const results: AuraId[] = [];
  const added = new Set<AuraId>();

  const pushAura = (id: AuraId) => {
    if (!added.has(id)) {
      added.add(id);
      results.push(id);
    }
  };

  // 1. Hero active aura
  if (sim.hero?.id === unitId && sim.hero.activeAura && isAuraId(sim.hero.activeAura)) {
    pushAura(sim.hero.activeAura);
  }

  // 2. Monster / Boss modifiers
  const mods = sim.cb.bossMods[unitId] || [];
  for (const m of mods) {
    if (isAuraId(m)) {
      pushAura(m);
    }
  }

  // 3. Mod mappings from standard classic ARPG affixes to authentic Basin auras
  if (mods.includes('extra_strong') && !added.has('might')) {
    pushAura('might');
  }
  if (mods.includes('fire_enchanted') && !added.has('holy_fire')) {
    pushAura('holy_fire');
  }
  if (mods.includes('cold_enchanted') && !added.has('holy_freeze')) {
    pushAura('holy_freeze');
  }
  if (mods.includes('lightning_enchanted') && !added.has('holy_shock')) {
    pushAura('holy_shock');
  }
  if (mods.includes('blessed_aura') && !added.has('blessed_aim') && !added.has('concentration')) {
    pushAura('blessed_aim');
  }
  if (mods.includes('stone_skin') && !added.has('defiance')) {
    pushAura('defiance');
  }
  if (mods.includes('extra_fast') && !added.has('vigor')) {
    pushAura('vigor');
  }

  return results;
}

/**
 * Checks if a unit is currently affected by Conviction from an enemy aura bearer.
 */
export function isUnitUnderConviction(sim: Sim, unitId: number): boolean {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) {
    return false;
  }
  const uTeam = sim.team[unitId];
  const ux = sim.x[unitId];
  const uy = sim.y[unitId];
  const r2 = (AURA_DEFINITIONS.conviction.radiusTiles * FP) ** 2;

  for (let b = 0; b < sim.count; b++) {
    if (sim.team[b] === uTeam || sim.cb.hp[b] <= 0 || sim.hidden[b]) continue;
    const auras = getUnitActiveAuras(sim, b);
    if (auras.includes('conviction')) {
      const dx = sim.x[b] - ux;
      const dy = sim.y[b] - uy;
      if (dx * dx + dy * dy <= r2) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a unit has Thorns active (either directly or via friendly bearer in radius).
 */
export function isUnitUnderThorns(sim: Sim, unitId: number): boolean {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) {
    return false;
  }
  const uTeam = sim.team[unitId];
  const ux = sim.x[unitId];
  const uy = sim.y[unitId];
  const r2 = (AURA_DEFINITIONS.thorns.radiusTiles * FP) ** 2;

  for (let b = 0; b < sim.count; b++) {
    if (sim.team[b] !== uTeam || sim.cb.hp[b] <= 0 || sim.hidden[b]) continue;
    const auras = getUnitActiveAuras(sim, b);
    if (auras.includes('thorns')) {
      const dx = sim.x[b] - ux;
      const dy = sim.y[b] - uy;
      if (dx * dx + dy * dy <= r2) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Executes the deterministic simulation step for all active auras across the battlefield.
 * Runs in fixed-timestep increments (every 25 ticks / 1 second).
 */
export function stepAuraSystem(sim: Sim): void {
  const count = sim.count;
  const cb = sim.cb;
  const hp = cb.hp;
  const team = sim.team;
  const hidden = sim.hidden;
  const x = sim.x;
  const y = sim.y;

  // Step all aura bearers
  for (let b = 0; b < count; b++) {
    if (hp[b] <= 0 || hidden[b]) continue;
    const activeAuras = getUnitActiveAuras(sim, b);
    if (activeAuras.length === 0) continue;

    const bx = x[b];
    const by = y[b];
    const bteam = team[b];

    for (const auraId of activeAuras) {
      const def = AURA_DEFINITIONS[auraId];
      if (sim.tick % def.pulseIntervalTicks !== 0) continue;

      const r = def.radiusTiles * FP;
      const r2 = r * r;

      switch (auraId) {
        case 'might':
        case 'blessed_aim':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Bless, 50, 0);
            }
          }
          break;

        case 'holy_fire':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] === bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              const dmg = 4 + sim.rng.int(6);
              strike(sim, u, dmg, dmg + 4, Elem.Fire, 14, b);
            }
          }
          cb.emit(6, bx, by, 3, Elem.Fire);
          break;

        case 'holy_freeze':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] === bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Slow, 50, 0);
              const chill = 2 + sim.rng.int(4);
              strike(sim, u, chill, chill + 2, Elem.Water, 10, b);
            }
          }
          cb.emit(5, bx, by, 0, Elem.Water);
          break;

        case 'holy_shock':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] === bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              const zap = 5 + sim.rng.int(10);
              strike(sim, u, zap, zap + 6, Elem.Air, 16, b);
            }
          }
          cb.emit(6, bx, by, 4, Elem.Air);
          break;

        case 'sanctuary':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] === bteam) continue;
            const fam = cb.family[u] || '';
            const isUndead =
              fam.includes('hollow') ||
              fam.includes('fallen') ||
              fam.includes('bone') ||
              fam.includes('gloom') ||
              fam.includes('ash');
            if (!isUndead) continue;

            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              const smite = 8 + sim.rng.int(8);
              strike(sim, u, smite, smite + 5, Elem.Astral, 20, b);
              // Slight repelling knockback from sanctuary radius
              const distLen = Math.max(1, Math.hypot(dx, dy));
              x[u] = Math.round(x[u] + (dx / distLen) * Math.round(0.4 * FP));
              y[u] = Math.round(y[u] + (dy / distLen) * Math.round(0.4 * FP));
            }
          }
          break;

        case 'fanaticism':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Haste, 50, 0);
              addStatus(sim, u, St.Bless, 50, 0);
            }
          }
          break;

        case 'conviction':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] === bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Weaken, 50, 0);
            }
          }
          break;

        case 'prayer':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2 && hp[u] < cb.hpMax[u]) {
              const heal = 4 + sim.rng.int(4);
              hp[u] = Math.min(cb.hpMax[u], hp[u] + heal);
              cb.emit(7, x[u], y[u], heal, 0);
            }
          }
          break;

        case 'defiance':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Shield, 50, 15);
            }
          }
          break;

        case 'cleansing':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              // Rapidly cleanse negative debuffs & poisons
              for (const st of [St.Poison, St.Burn, St.Slow, St.Weaken]) {
                const k = u * NST + st;
                if (cb.stT[k] > 0) {
                  cb.stT[k] = Math.max(0, cb.stT[k] - 25);
                  if (cb.stT[k] === 0) {
                    cb.stMask[u] &= ~(1 << st);
                    cb.emit(8, x[u], y[u], st + 16, 0);
                  }
                }
              }
            }
          }
          break;

        case 'vigor':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Haste, 50, 0);
            }
          }
          break;

        case 'meditation':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2 && cb.mana[u] < cb.manaMax[u]) {
              cb.mana[u] = Math.min(cb.manaMax[u], cb.mana[u] + 12);
            }
          }
          break;

        case 'redemption': {
          let redeemedCount = 0;
          for (let c = 0; c < count && redeemedCount < 2; c++) {
            if (hp[c] <= 0 && cb.corp[c] > 0) {
              const dx = x[c] - bx;
              const dy = y[c] - by;
              if (dx * dx + dy * dy <= r2) {
                cb.corp[c] = 0;
                redeemedCount++;
                cb.emit(10, x[c], y[c], 2, 0); // corpse redeemed fx
                hp[b] = Math.min(cb.hpMax[b], hp[b] + 30);
                cb.mana[b] = Math.min(cb.manaMax[b], cb.mana[b] + 20);
                cb.emit(7, bx, by, 30, 0);
              }
            }
          }
          break;
        }

        case 'salvation':
        case 'concentration':
          for (let u = 0; u < count; u++) {
            if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy <= r2) {
              addStatus(sim, u, St.Bless, 50, 0);
            }
          }
          break;

        case 'thorns':
          // Thorns reflection is evaluated reactionarily on incoming melee blows
          break;
      }
    }
  }
}
