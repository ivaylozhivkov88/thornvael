import type { GameMap } from '../map';
import type { Preferences } from '../preferences';
import { Kind } from './combat';
import { FP, type Sim } from './sim';
import { SPELLS, type SpellDef, St } from './spelldata';
import { cosLut, sinLut } from './trig';

export type SquadStance = 'hold' | 'guard' | 'aggressive';

export interface AutoCastAction {
  spellId: number;
  targetId?: number;
  targetX: number;
  targetY: number;
  reason: 'emergency_heal' | 'buff_ally' | 'offensive_cast';
}

export interface HighGroundBonus {
  rangeBonus: number;
  accuracyMult: number;
  critBonusPct: number;
  label: string;
}

export interface AutoNavigateResult {
  haltedByEnemy: boolean;
  enemyId?: number;
  enemyDist?: number;
  nextX?: number;
  nextY?: number;
  arrived: boolean;
}

export interface LootSweepResult {
  canLoot: boolean;
  reason?: 'enemies_nearby' | 'no_loot';
  collectedGold: number;
  gatheredItems: number;
  targets: { x: number; y: number; kind: 'gold' | 'item'; amountOrId: number }[];
}

/**
 * P0.1 Authentic Spell Auto-Cast Engine:
 * Deterministically evaluates whether a caster unit should cast an automated
 * healing, defensive buff, or offensive spell without player micromanagement.
 */
export function evaluateAutoCast(
  sim: Sim,
  unitId: number,
  prefs?: Preferences,
  autoCastSpells?: ReadonlyArray<number>,
): AutoCastAction | null {
  const mode = prefs?.autoCastMode ?? 'per-spell';
  if (mode === 'off') return null;

  const cb = sim.cb;
  if (cb.hp[unitId] <= 0 || cb.cd[unitId] > 0) return null;

  const casterX = sim.x[unitId] / FP;
  const casterY = sim.y[unitId] / FP;
  const currentMana = cb.mana[unitId];
  const maxMana = Math.max(1, cb.manaMax[unitId]);
  const manaReserveThreshold = (maxMana * (prefs?.manaReservePct ?? 15)) / 100;
  const autoHealPctThreshold = prefs?.autoHealThresholdPct ?? 65;

  // Candidate spells to consider
  const candidateSpellIds: number[] = [];
  if (autoCastSpells && autoCastSpells.length > 0) {
    candidateSpellIds.push(...autoCastSpells);
  } else if (mode === 'smart') {
    // Standard smart spell pool
    candidateSpellIds.push(7, 19, 0, 4, 1); // Healing, Stone Skin, Fire Bolt, Frost Bolt, Fireball
  } else {
    // 'per-spell' default to Healing (7) if known
    candidateSpellIds.push(7);
  }

  for (const sid of candidateSpellIds) {
    if (sid < 0) continue;
    const def: SpellDef | undefined = SPELLS[sid];
    const cost = def ? def.cost : 12;
    if (currentMana < cost) continue;

    const reach = def?.reach ?? 6;
    const isHealing = def ? def.heal || sid === 7 || def.name.toLowerCase().includes('heal') : sid === 7;
    const isDefensiveBuff = def
      ? def.st >= 0 && (def.st === St.Bless || def.st === St.Shield || def.st === St.Haste || def.st === St.Stone)
      : sid === 19;
    const isOffensive = !isHealing && !isDefensiveBuff;

    // 1. Healing Spells: prioritized by Hero -> Melee -> Ranged with HP <= threshold
    if (isHealing) {
      let bestTargetId = -1;
      let lowestHpPct = autoHealPctThreshold;
      let highestPriority = -1; // 3 = hero, 2 = melee, 1 = ranged

      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] !== sim.team[unitId] || cb.hp[i] <= 0) continue;
        const tx = sim.x[i] / FP;
        const ty = sim.y[i] / FP;
        const dist = Math.hypot(tx - casterX, ty - casterY);
        if (dist > reach) continue;

        const hpPct = (cb.hp[i] / Math.max(1, cb.hpMax[i])) * 100;
        if (hpPct > autoHealPctThreshold) continue;

        const isHero = sim.hero !== null && i === sim.hero.id;
        const isMelee = cb.kind[i] === Kind.Warrior || cb.kind[i] === Kind.Golem;
        const priority = isHero ? 3 : isMelee ? 2 : 1;

        if (priority > highestPriority || (priority === highestPriority && hpPct < lowestHpPct)) {
          highestPriority = priority;
          lowestHpPct = hpPct;
          bestTargetId = i;
        }
      }

      if (bestTargetId >= 0) {
        return {
          spellId: sid,
          targetId: bestTargetId,
          targetX: sim.x[bestTargetId] / FP,
          targetY: sim.y[bestTargetId] / FP,
          reason: 'emergency_heal',
        };
      }
    }

    // 2. Defensive Buff Spells: apply to unbuffed allies in combat
    if (isDefensiveBuff && def) {
      const statusBit = 1 << def.st;
      // In-combat check: caster or team has active target
      const inCombat = cb.tgt[unitId] >= 0;
      if (inCombat) {
        let bestTargetId = -1;
        let highestPriority = -1;

        for (let i = 0; i < sim.count; i++) {
          if (sim.team[i] !== sim.team[unitId] || cb.hp[i] <= 0) continue;
          if (cb.stMask[i] & statusBit) continue; // Already buffed

          const tx = sim.x[i] / FP;
          const ty = sim.y[i] / FP;
          const dist = Math.hypot(tx - casterX, ty - casterY);
          if (dist > reach) continue;

          const isHero = sim.hero !== null && i === sim.hero.id;
          const isMelee = cb.kind[i] === Kind.Warrior || cb.kind[i] === Kind.Golem;
          const priority = isHero ? 3 : isMelee ? 2 : 1;

          if (priority > highestPriority) {
            highestPriority = priority;
            bestTargetId = i;
          }
        }

        if (bestTargetId >= 0) {
          return {
            spellId: sid,
            targetId: bestTargetId,
            targetX: sim.x[bestTargetId] / FP,
            targetY: sim.y[bestTargetId] / FP,
            reason: 'buff_ally',
          };
        }
      }
    }

    // 3. Offensive Spells: fire at current target while respecting mana reserve
    if (isOffensive) {
      // Must preserve emergency mana reserve
      if (currentMana - cost < manaReserveThreshold) continue;

      let targetId = cb.tgt[unitId];
      if (targetId < 0 || targetId >= sim.count || sim.team[targetId] === sim.team[unitId] || cb.hp[targetId] <= 0) {
        // Find nearest visible living enemy within reach
        let nearestDist = reach;
        targetId = -1;
        for (let i = 0; i < sim.count; i++) {
          if (sim.team[i] === sim.team[unitId] || cb.hp[i] <= 0) continue;
          const ex = sim.x[i] / FP;
          const ey = sim.y[i] / FP;
          const dist = Math.hypot(ex - casterX, ey - casterY);
          if (dist <= nearestDist) {
            nearestDist = dist;
            targetId = i;
          }
        }
      }

      if (targetId >= 0 && cb.hp[targetId] > 0) {
        const ex = sim.x[targetId] / FP;
        const ey = sim.y[targetId] / FP;
        if (Math.hypot(ex - casterX, ey - casterY) <= reach) {
          return {
            spellId: sid,
            targetId,
            targetX: ex,
            targetY: ey,
            reason: 'offensive_cast',
          };
        }
      }
    }
  }

  return null;
}

/**
 * P0.2 Squad Stances & Chokepoint Discipline:
 * Returns the maximum chase / pursuit distance for a given stance.
 */
export function getChaseRadiusForStance(stance: SquadStance, isRanged: boolean): number {
  switch (stance) {
    case 'hold':
      // 0 chase for melee (hold ground / chokepoint blocking), ranged can attack within natural reach
      return isRanged ? 7.0 : 0.0;
    case 'guard':
      // Defensive leash of 3 tiles from defensive anchor
      return 3.0;
    case 'aggressive':
      // Free pursuit up to 9 tiles
      return 9.0;
  }
}

/**
 * P0.2 Regroup Formation:
 * Calculates a combat-ready 2-rank formation around the hero
 * (front rank melee warriors, back rank ranged archers/mages).
 */
export function computeRegroupFormation(
  sim: Sim,
  heroId: number,
  squadIds: ReadonlyArray<number>,
  forwardAngle?: number,
): { id: number; targetX: number; targetY: number }[] {
  const hx = sim.x[heroId] / FP;
  const hy = sim.y[heroId] / FP;
  const angle = forwardAngle ?? ((sim.dir[heroId] ?? 0) * Math.PI) / 8;

  // Forward and perpendicular normal vectors (deterministic LUT)
  const fx = cosLut(angle);
  const fy = sinLut(angle);
  const nx = -fy;
  const ny = fx;

  const melee: number[] = [];
  const ranged: number[] = [];

  for (const id of squadIds) {
    if (id === heroId || sim.cb.hp[id] <= 0) continue;
    const kind = sim.cb.kind[id];
    if (kind === Kind.Warrior || kind === Kind.Golem) {
      melee.push(id);
    } else {
      ranged.push(id);
    }
  }

  const result: { id: number; targetX: number; targetY: number }[] = [];

  // Front Rank: Melee warriors positioned 1.5 tiles forward along hero's facing
  for (let i = 0; i < melee.length; i++) {
    const offset = (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 1.2;
    result.push({
      id: melee[i]!,
      targetX: Math.round(hx + fx * 1.5 + nx * offset),
      targetY: Math.round(hy + fy * 1.5 + ny * offset),
    });
  }

  // Back Rank: Ranged archers & mages positioned 1.5 tiles behind hero
  for (let i = 0; i < ranged.length; i++) {
    const offset = (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 1.2;
    result.push({
      id: ranged[i]!,
      targetX: Math.round(hx - fx * 1.5 + nx * offset),
      targetY: Math.round(hy - fy * 1.5 + ny * offset),
    });
  }

  return result;
}

/**
 * P0.3 High Ground Tactical Advantage:
 * Calculates elevation delta from map height layer and returns range & accuracy modifiers.
 */
export function computeHighGroundBonus(
  map: GameMap,
  attackerX: number,
  attackerY: number,
  targetX: number,
  targetY: number,
): HighGroundBonus {
  const ax = Math.max(0, Math.min(map.w - 1, Math.floor(attackerX)));
  const ay = Math.max(0, Math.min(map.h - 1, Math.floor(attackerY)));
  const tx = Math.max(0, Math.min(map.w - 1, Math.floor(targetX)));
  const ty = Math.max(0, Math.min(map.h - 1, Math.floor(targetY)));

  const hAttacker = map.height ? (map.height[ay * map.w + ax] ?? 0) : 0;
  const hTarget = map.height ? (map.height[ty * map.w + tx] ?? 0) : 0;
  const dh = hAttacker - hTarget;

  if (dh >= 2) {
    return {
      rangeBonus: 1.5,
      accuracyMult: 1.15,
      critBonusPct: 10,
      label: 'High Ground (+15% Acc, +1.5 Range)',
    };
  }

  if (dh <= -2) {
    return {
      rangeBonus: 0,
      accuracyMult: 0.85,
      critBonusPct: 0,
      label: 'Low Ground (-15% Acc)',
    };
  }

  return {
    rangeBonus: 0,
    accuracyMult: 1.0,
    critBonusPct: 0,
    label: 'Neutral Elevation',
  };
}

/**
 * Auto-Go Navigation with Ambush Guard:
 * Progressively advances squad toward target, but instantly halts
 * the march if an enemy is detected within visual range (8 tiles).
 */
export function stepAutoNavigate(
  sim: Sim,
  heroId: number,
  squadIds: ReadonlyArray<number>,
  goalX: number,
  goalY: number,
  visionRadiusTiles: number = 8,
): AutoNavigateResult {
  const hx = sim.x[heroId] / FP;
  const hy = sim.y[heroId] / FP;
  const distToGoal = Math.hypot(hx - goalX, hy - goalY);

  if (distToGoal <= 2.0) {
    return { haltedByEnemy: false, arrived: true };
  }

  // Ambush Guard check across all living squad members
  const checkUnits = [heroId, ...squadIds];
  for (const uid of checkUnits) {
    if (sim.cb.hp[uid] <= 0) continue;
    const ux = sim.x[uid] / FP;
    const uy = sim.y[uid] / FP;

    for (let e = 0; e < sim.count; e++) {
      if (sim.team[e] === sim.team[heroId] || sim.cb.hp[e] <= 0) continue;
      const ex = sim.x[e] / FP;
      const ey = sim.y[e] / FP;
      const edist = Math.hypot(ex - ux, ey - uy);
      if (edist <= visionRadiusTiles) {
        return {
          haltedByEnemy: true,
          enemyId: e,
          enemyDist: edist,
          arrived: false,
        };
      }
    }
  }

  // Advance step toward goal
  const angle = Math.atan2(goalY - hy, goalX - hx);
  const stepDist = Math.min(distToGoal, 2.5);
  const nextX = hx + cosLut(angle) * stepDist;
  const nextY = hy + sinLut(angle) * stepDist;

  return {
    haltedByEnemy: false,
    nextX,
    nextY,
    arrived: false,
  };
}

/**
 * Auto-Loot Sweep:
 * When no live enemies are within radiusTiles, gathers nearby
 * gold sacks and item bags around the squad.
 */
export function performLootSweep(sim: Sim, heroId: number, radiusTiles: number = 8): LootSweepResult {
  const hx = sim.x[heroId] / FP;
  const hy = sim.y[heroId] / FP;
  const cb = sim.cb;

  // 1. Safety check: any live enemies nearby?
  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] !== sim.team[heroId] && cb.hp[i] > 0) {
      const ex = sim.x[i] / FP;
      const ey = sim.y[i] / FP;
      if (Math.hypot(ex - hx, ey - hy) <= radiusTiles) {
        return {
          canLoot: false,
          reason: 'enemies_nearby',
          collectedGold: 0,
          gatheredItems: 0,
          targets: [],
        };
      }
    }
  }

  // 2. Scan gold sacks and item bags
  const targets: { x: number; y: number; kind: 'gold' | 'item'; amountOrId: number }[] = [];
  let collectedGold = 0;
  let gatheredItems = 0;

  for (let s = 0; s < cb.sG.length; s++) {
    if (cb.sG[s] <= 0) continue;
    const sx = cb.sX[s] / FP;
    const sy = cb.sY[s] / FP;
    if (Math.hypot(sx - hx, sy - hy) <= radiusTiles) {
      targets.push({ x: sx, y: sy, kind: 'gold', amountOrId: cb.sG[s] });
      collectedGold += cb.sG[s];
    }
  }

  for (let b = 0; b < cb.bI.length; b++) {
    if (cb.bI[b] <= 0) continue;
    const bx = cb.bX[b] / FP;
    const by = cb.bY[b] / FP;
    if (Math.hypot(bx - hx, by - hy) <= radiusTiles) {
      targets.push({ x: bx, y: by, kind: 'item', amountOrId: cb.bI[b] });
      gatheredItems++;
    }
  }

  if (targets.length === 0) {
    return {
      canLoot: true,
      reason: 'no_loot',
      collectedGold: 0,
      gatheredItems: 0,
      targets: [],
    };
  }

  return {
    canLoot: true,
    collectedGold,
    gatheredItems,
    targets,
  };
}
