import { Elem, strike } from './combat';
import { FP, safeSlideTo } from './path';
import type { Sim } from './sim';
import { NST, St } from './spelldata';
import { addStatus } from './spells';

const EMPTY_AURAS: AuraId[] = [];
const CLEANSE_STATUSES = [St.Poison, St.Burn, St.Slow, St.Weaken] as const;

/**
 * Vanguard Aura Roster and Simulation Engine
 *
 * All 17 tactical auras implemented:
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
      'Increases physical damage dealt by the bearer and friendly party members within radius. Soft pulsing amber/orange ring with radiating mini-spikes.',
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
      'When enemies hit the bearer or an ally with a melee attack, physical damage is reflected back to the attacker. Sharp jagged blood-red spikes pointing outward around feet.',
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
      'Passively and actively boosts Attack Rating for the bearer and friendly party members. Golden radial starburst ring with rotating rays.',
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
      'Drastically increases attack speed, attack rating, and physical damage of the bearer and party. Aggressive spinning serrated gold/crimson gear with orbiting motes.',
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
      'Regenerates Life for the bearer and all party members within radius. Soothing azure/white soft ring with rising healing glimmers.',
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
      'Greatly increases Defense rating for the bearer and all party members. Steely silver/blue fortified shield crests rotating on ground.',
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
      'Rapidly reduces poison and curse duration for the bearer and all party members within radius. Emerald/teal mist ring rapidly reducing poison & curse duration.',
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
      'Boosts walk/run speed, maximum stamina, and stamina recovery for the bearer and party. Fast spinning bright green directional chevron arrows with motion dust.',
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
      'Dramatically increases Mana regeneration rate for the bearer and all party members within radius. Deep sapphire/indigo mystical mandala ring.',
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
      'Dramatically increases Fire, Cold, and Lightning resistances for the bearer and party. Radiant golden prism dome ring protecting against Fire, Cold, Lightning.',
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
 * Resolves explicit hero aura, explicit monster mods, and maps legacy elite mods.
 */
export function getUnitActiveAuras(sim: Sim, unitId: number): AuraId[] {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) {
    return EMPTY_AURAS;
  }

  const isHero = sim.hero?.id === unitId;
  const heroAura = isHero ? sim.hero!.activeAura : undefined;
  const mods = sim.cb.bossMods[unitId];
  if ((!isHero || !heroAura || !isAuraId(heroAura)) && (!mods || mods.length === 0)) {
    return EMPTY_AURAS;
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
  if (isHero && heroAura && isAuraId(heroAura)) {
    pushAura(heroAura);
  }

  // 2. Monster / Boss modifiers
  if (mods && mods.length > 0) {
    for (const m of mods) {
      if (isAuraId(m)) {
        pushAura(m);
      }
    }

    // 3. Mod mappings from standard elite affixes to Vanguard auras
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
  sim.ensureGrid();
  const uTeam = sim.team[unitId];
  const ux = sim.x[unitId];
  const uy = sim.y[unitId];
  const rTiles = AURA_DEFINITIONS.conviction.radiusTiles;
  const r2 = (rTiles * FP) ** 2;
  const { w, h } = sim.map;
  const cs = sim.cellStart;
  const ce = sim.cellEnd;
  const ci = sim.cellItems;
  const rc = sim.spatialHash.rowCount;
  const cx = Math.max(0, Math.min(w - 1, ux >> 8));
  const cy = Math.max(0, Math.min(h - 1, uy >> 8));
  const tr = Math.ceil(rTiles);
  const gy0 = Math.max(0, cy - tr);
  const gy1 = Math.min(h - 1, cy + tr);
  const gx0 = Math.max(0, cx - tr);
  const gx1 = Math.min(w - 1, cx + tr);

  for (let gy = gy0; gy <= gy1; gy++) {
    if (rc[gy] === 0) continue;
    const row = gy * w;
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = row + gx;
      const end = ce[c];
      for (let q = cs[c]; q < end; q++) {
        const b = ci[q];
        if (sim.team[b] === uTeam || sim.peace[(sim.team[b] & 3) * 4 + (uTeam & 3)]) continue;
        const auras = getUnitActiveAuras(sim, b);
        if (auras.length === 0 || !auras.includes('conviction')) continue;
        const dx = sim.x[b] - ux;
        const dy = sim.y[b] - uy;
        if (dx * dx + dy * dy <= r2) return true;
      }
    }
  }
  return false;
}

/** Returns the elemental resistance bonus granted by any nearby friendly Salvation aura bearer. */
export function getSalvationResistBonus(sim: Sim, unitId: number): number {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) return 0;
  sim.ensureGrid();
  const uTeam = sim.team[unitId];
  const ux = sim.x[unitId];
  const uy = sim.y[unitId];
  const rTiles = AURA_DEFINITIONS.salvation.radiusTiles;
  const r2 = (rTiles * FP) ** 2;
  const { w, h } = sim.map;
  const cs = sim.cellStart;
  const ce = sim.cellEnd;
  const ci = sim.cellItems;
  const rc = sim.spatialHash.rowCount;
  const cx = Math.max(0, Math.min(w - 1, ux >> 8));
  const cy = Math.max(0, Math.min(h - 1, uy >> 8));
  const tr = Math.ceil(rTiles);
  const gy0 = Math.max(0, cy - tr);
  const gy1 = Math.min(h - 1, cy + tr);
  const gx0 = Math.max(0, cx - tr);
  const gx1 = Math.min(w - 1, cx + tr);

  for (let gy = gy0; gy <= gy1; gy++) {
    if (rc[gy] === 0) continue;
    const row = gy * w;
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = row + gx;
      const end = ce[c];
      for (let q = cs[c]; q < end; q++) {
        const b = ci[q];
        if (sim.team[b] !== uTeam) continue;
        const auras = getUnitActiveAuras(sim, b);
        if (auras.length === 0 || !auras.includes('salvation')) continue;
        const dx = sim.x[b] - ux;
        const dy = sim.y[b] - uy;
        if (dx * dx + dy * dy <= r2) return 35;
      }
    }
  }
  return 0;
}

/**
 * Checks if a unit has Thorns active (either directly or via friendly bearer in radius).
 */
export function isUnitUnderThorns(sim: Sim, unitId: number): boolean {
  if (unitId < 0 || unitId >= sim.count || sim.cb.hp[unitId] <= 0 || sim.hidden[unitId]) {
    return false;
  }
  sim.ensureGrid();
  const uTeam = sim.team[unitId];
  const ux = sim.x[unitId];
  const uy = sim.y[unitId];
  const rTiles = AURA_DEFINITIONS.thorns.radiusTiles;
  const r2 = (rTiles * FP) ** 2;
  const { w, h } = sim.map;
  const cs = sim.cellStart;
  const ce = sim.cellEnd;
  const ci = sim.cellItems;
  const rc = sim.spatialHash.rowCount;
  const cx = Math.max(0, Math.min(w - 1, ux >> 8));
  const cy = Math.max(0, Math.min(h - 1, uy >> 8));
  const tr = Math.ceil(rTiles);
  const gy0 = Math.max(0, cy - tr);
  const gy1 = Math.min(h - 1, cy + tr);
  const gx0 = Math.max(0, cx - tr);
  const gx1 = Math.min(w - 1, cx + tr);

  for (let gy = gy0; gy <= gy1; gy++) {
    if (rc[gy] === 0) continue;
    const row = gy * w;
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = row + gx;
      const end = ce[c];
      for (let q = cs[c]; q < end; q++) {
        const b = ci[q];
        if (sim.team[b] !== uTeam) continue;
        const auras = getUnitActiveAuras(sim, b);
        if (auras.length === 0 || !auras.includes('thorns')) continue;
        const dx = sim.x[b] - ux;
        const dy = sim.y[b] - uy;
        if (dx * dx + dy * dy <= r2) return true;
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
  sim.ensureGrid();
  const count = sim.count;
  const cb = sim.cb;
  const hp = cb.hp;
  const team = sim.team;
  const hidden = sim.hidden;
  const x = sim.x;
  const y = sim.y;
  const { w, h } = sim.map;
  const cs = sim.cellStart;
  const ce = sim.cellEnd;
  const ci = sim.cellItems;
  const rc = sim.spatialHash.rowCount;

  // Step all aura bearers
  for (let b = 0; b < count; b++) {
    if (hp[b] <= 0 || hidden[b]) continue;
    const activeAuras = getUnitActiveAuras(sim, b);
    if (activeAuras.length === 0) continue;

    const bx = x[b];
    const by = y[b];
    const bteam = team[b];
    const cx = Math.max(0, Math.min(w - 1, bx >> 8));
    const cy = Math.max(0, Math.min(h - 1, by >> 8));

    for (const auraId of activeAuras) {
      const def = AURA_DEFINITIONS[auraId];
      if (sim.tick % def.pulseIntervalTicks !== 0) continue;

      if (auraId === 'thorns') continue;

      const tr = Math.ceil(def.radiusTiles);
      const r = def.radiusTiles * FP;
      const r2 = r * r;

      if (auraId === 'redemption') {
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
        continue;
      }

      const gy0 = Math.max(0, cy - tr);
      const gy1 = Math.min(h - 1, cy + tr);
      const gx0 = Math.max(0, cx - tr);
      const gx1 = Math.min(w - 1, cx + tr);

      for (let gy = gy0; gy <= gy1; gy++) {
        if (rc[gy] === 0) continue;
        const row = gy * w;
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = row + gx;
          const end = ce[cell];
          for (let q = cs[cell]; q < end; q++) {
            const u = ci[q];
            if (hp[u] <= 0 || hidden[u]) continue;
            const dx = x[u] - bx;
            const dy = y[u] - by;
            if (dx * dx + dy * dy > r2) continue;

            switch (auraId) {
              case 'might':
              case 'blessed_aim':
              case 'salvation':
              case 'concentration':
                if (team[u] === bteam) addStatus(sim, u, St.Bless, 50, 0);
                break;

              case 'holy_fire':
                if (team[u] !== bteam && !sim.peace[(bteam & 3) * 4 + (team[u] & 3)]) {
                  const dmg = 4 + sim.rng.int(6);
                  strike(sim, u, dmg, dmg + 4, Elem.Fire, 14, b);
                }
                break;

              case 'holy_freeze':
                if (team[u] !== bteam && !sim.peace[(bteam & 3) * 4 + (team[u] & 3)]) {
                  addStatus(sim, u, St.Slow, 50, 0);
                  const chill = 2 + sim.rng.int(4);
                  strike(sim, u, chill, chill + 2, Elem.Water, 10, b);
                }
                break;

              case 'holy_shock':
                if (team[u] !== bteam && !sim.peace[(bteam & 3) * 4 + (team[u] & 3)]) {
                  const zap = 5 + sim.rng.int(10);
                  strike(sim, u, zap, zap + 6, Elem.Air, 16, b);
                }
                break;

              case 'sanctuary':
                if (team[u] !== bteam && !sim.peace[(bteam & 3) * 4 + (team[u] & 3)]) {
                  const fam = cb.family[u] || '';
                  const isUndead =
                    fam.includes('hollow') ||
                    fam.includes('fallen') ||
                    fam.includes('bone') ||
                    fam.includes('gloom') ||
                    fam.includes('ash');
                  if (isUndead) {
                    const smite = 8 + sim.rng.int(8);
                    strike(sim, u, smite, smite + 5, Elem.Astral, 20, b);
                    const distLen = Math.max(1, Math.hypot(dx, dy));
                    const slid = safeSlideTo(
                      sim.map,
                      x[u],
                      y[u],
                      x[u] + (dx / distLen) * Math.round(0.4 * FP),
                      y[u] + (dy / distLen) * Math.round(0.4 * FP),
                    );
                    x[u] = slid.x;
                    y[u] = slid.y;
                    sim.markGridDirty();
                  }
                }
                break;

              case 'fanaticism':
                if (team[u] === bteam) {
                  addStatus(sim, u, St.Haste, 50, 0);
                  addStatus(sim, u, St.Bless, 50, 0);
                }
                break;

              case 'conviction':
                if (team[u] !== bteam && !sim.peace[(bteam & 3) * 4 + (team[u] & 3)]) addStatus(sim, u, St.Weaken, 50, 0);
                break;

              case 'prayer':
                if (team[u] === bteam && hp[u] < cb.hpMax[u]) {
                  const heal = 4 + sim.rng.int(4);
                  hp[u] = Math.min(cb.hpMax[u], hp[u] + heal);
                  cb.emit(7, x[u], y[u], heal, 0);
                }
                break;

              case 'defiance':
                if (team[u] === bteam) addStatus(sim, u, St.Shield, 50, 15);
                break;

              case 'cleansing':
                if (team[u] === bteam) {
                  for (const st of CLEANSE_STATUSES) {
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
                break;

              case 'vigor':
                if (team[u] === bteam) addStatus(sim, u, St.Haste, 50, 0);
                break;

              case 'meditation':
                if (team[u] === bteam && cb.mana[u] < cb.manaMax[u]) {
                  cb.mana[u] = Math.min(cb.manaMax[u], cb.mana[u] + 12);
                }
                break;
            }
          }
        }
      }

      if (auraId === 'holy_fire') cb.emit(6, bx, by, 3, Elem.Fire);
      else if (auraId === 'holy_freeze') cb.emit(5, bx, by, 0, Elem.Water);
      else if (auraId === 'holy_shock') cb.emit(6, bx, by, 4, Elem.Air);
    }
  }
}
