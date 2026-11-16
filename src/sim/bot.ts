import { isBlockedAt, type GameMap } from '../map';
import { DEFS, Kind, Ord, partAbs, partDef } from './combat';
import { FP, type Command, type Sim } from './sim';
import { Rng } from './rng';
import { St } from './spelldata';
import { knows } from './spells';
import { getSuperUniqueForUnit, type TacticalAiRole } from './super-uniques';

export type { TacticalAiRole };

const COWARD_FAMILIES = new Set(['cinderling', 'ruin-mite', 'maggot-swarm', 'imp']);
const KITER_FAMILIES = new Set([
  'quill-fiend',
  'fetish-blowdart',
  'glasswing',
  'storm-kite',
  'dune-scarab',
  'lantern-eel',
  'rift-moth',
  'redglass-drake',
]);
const SHAMAN_FAMILIES = new Set(['fallen-shaman', 'witch-doctor', 'greater-mummy']);
const HEXER_FAMILIES = new Set([
  'spore-matron',
  'ash-weaver',
  'mire-wisp',
  'frost-bell',
  'night-orchard',
  'morvessa',
  'vesperion',
  'ashkarath',
]);
const TANK_FAMILIES = new Set([
  'flintback',
  'rootbound',
  'salt-crab',
  'basalt-brute',
  'ironbark',
  'wendigo-bruiser',
  'silt-colossus',
  'stormtree',
  'anvilmaw-smith',
  'gorrathul',
]);
const LUNGER_FAMILIES = new Set(['claw-viper', 'dune-lurker', 'gloom-stag', 'dune-beast', 'pale-burrower']);
const CHARGER_FAMILIES = new Set([
  'briar-hound',
  'thorn-boar',
  'sand-raider',
  'crowned-maw',
  'doom-knight',
  'cinderhorn',
  'hollow-knight',
  'hollow-king',
]);

/**
 * Classify any enemy unit into one of the 6 Thornvael tactical AI archetypes.
 */
export function classifyMonsterRole(sim: Sim, id: number): TacticalAiRole {
  const su = getSuperUniqueForUnit(sim, id);
  if (su) return su.ai;

  const cb = sim.cb;
  const fam = cb.family[id] || '';
  const kind = cb.kind[id];

  if (COWARD_FAMILIES.has(fam) || (fam === '' && kind === Kind.Imp)) return 'coward_swarm';
  if (KITER_FAMILIES.has(fam) || kind === Kind.Archer) return 'ranged_kiter';
  if (SHAMAN_FAMILIES.has(fam) || (fam === '' && kind === Kind.Mage)) return 'shaman_reviver';
  if (HEXER_FAMILIES.has(fam) || kind === Kind.Mage) return 'hexer_caster';
  if (TANK_FAMILIES.has(fam) || kind === Kind.Golem) return 'juggernaut_tank';
  if (LUNGER_FAMILIES.has(fam)) return 'ambush_lunger';
  if (CHARGER_FAMILIES.has(fam)) return 'berserker_charger';

  const isBoss = (cb.bossMods[id]?.length ?? 0) > 0 || cb.tier[id] >= 4 || cb.hpMax[id] >= 180;
  if (isBoss) return 'juggernaut_tank';
  if (cb.manaMax[id] > 0) return 'hexer_caster';
  return 'berserker_charger';
}

/**
 * Scripted squads. Commands come out of the same `Command` vocabulary the player uses;
 * the bot has its own PRNG (not part of sim state) because replays use the log, not the bot.
 */
export class Bot {
  private readonly rng: Rng;
  constructor(
    private readonly team: number,
    private readonly squadSize: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  commands(sim: Sim): Command[] {
    const ids: number[] = [];
    for (let i = 0; i < sim.count; i++) {
      if (sim.team[i] === this.team && sim.cb.hp[i] > 0 && !sim.hidden[i]) ids.push(i);
    }
    const squads = Math.ceil(ids.length / this.squadSize);
    const out: Command[] = [];
    // Each squad re-targets every 5 seconds, staggered across squads.
    for (let s = 0; s < squads; s++) {
      if ((sim.tick + s * 7) % 125 !== 1) continue;
      const members = ids.slice(s * this.squadSize, (s + 1) * this.squadSize);
      const here = members.find((id) => sim.moving[id] === 0) ?? members[0];
      const cx = sim.x[here] / FP;
      const cy = sim.y[here] / FP;
      const x = Math.max(1, Math.min(sim.map.w - 2, cx + this.rng.int(21) - 10));
      const y = Math.max(1, Math.min(sim.map.h - 2, cy + this.rng.int(21) - 10));
      out.push({ type: 'move', ids: members, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 });
    }
    return out;
  }
}

export interface DirectorExtra {
  death: [number, number][];
  lastRaid: number;
  raidCount: number;
}

export interface MonsterAiExtra {
  res: [number, number][];
  raised: [number, number[]][];
  windup: [number, number][];
  director?: DirectorExtra;
}

export interface Pack {
  ids: number[];
  x: number; // post in tiles
  y: number;
  hunting: boolean;
  calm: number;
}

/**
 * Monster packs with Thornvael tactical enemy AI:
 * 1. `coward_swarm`: Cinderling/Ruin-Mite/Maggot swarms panic and flee for 60 ticks (3s) when their Shaman/Super-Unique dies or HP < 25%.
 * 2. `ranged_kiter`: Quill Fiends, Dartblowers, Scarabs, Archers kite backwards when enemies close within 3.2 tiles and fire from range.
 * 3. `ambush_lunger` & `berserker_charger`: Flank weakest-armored targets (casters/archers/hero) and enter Berserk frenzy below 40% HP.
 * 4. `juggernaut_tank`: Ironbarks, Rootbounds, Golems intercept line-of-sight to bodyblock for Shamans/Kiters and unleash heavy windups.
 * 5. `shaman_reviver` & `hexer_caster`: Keep backline distance, resurrect corpses (15s cd, max 2), heal wounded elites, and cast curses/bolts.
 */
export class MonsterAi {
  protected resCooldowns = new Map<number, number>();
  protected raisedMinions = new Map<number, Set<number>>();
  protected bossWindups = new Map<number, number>();
  protected panicUntil = new Map<number, number>();
  protected fledForLeader = new Set<number>();
  protected lowHpPanicked = new Set<number>();

  constructor(protected readonly packs: Pack[]) {}

  /** The only changing state: whether each pack is hunting and how long it has been calm. */
  snapshot(): [boolean, number][] {
    return this.packs.map((p) => [p.hunting, p.calm]);
  }

  /** Per-unit timers that must survive a save: resurrect cooldowns, raised minions and boss windups. Sorted for a stable save. */
  snapshotExtra(): MonsterAiExtra {
    const byId = <T,>(a: [number, T][]): [number, T][] => a.sort((p, q) => p[0] - q[0]);
    return {
      res: byId([...this.resCooldowns]),
      raised: byId([...this.raisedMinions].map(([k, v]): [number, number[]] => [k, [...v].sort((a, b) => a - b)])),
      windup: byId([...this.bossWindups]),
    };
  }

  /** Older saves have no extra block; then the timers start empty, as before. */
  restoreExtra(x: MonsterAiExtra | undefined): void {
    this.resCooldowns = new Map(x?.res ?? []);
    this.raisedMinions = new Map((x?.raised ?? []).map(([k, v]) => [k, new Set(v)]));
    this.bossWindups = new Map(x?.windup ?? []);
    this.panicUntil.clear();
    this.fledForLeader.clear();
    this.lowHpPanicked.clear();
  }

  restore(s: readonly [boolean, number][]): void {
    s.forEach(([hunting, calm], i) => {
      this.packs[i].hunting = hunting;
      this.packs[i].calm = calm;
    });
  }

  protected choosePrimaryTarget(sim: Sim, p: Pack, alive: number[], engaged?: number): number {
    const cb = sim.cb;
    if (engaged !== undefined && cb.tgt[engaged] >= 0 && cb.hp[cb.tgt[engaged]] > 0) {
      return cb.tgt[engaged];
    }
    const heroId = sim.hero?.id ?? 0;
    if (cb.hp[heroId] > 0 && sim.team[heroId] !== sim.team[alive[0]]) {
      const hx = sim.x[heroId] / FP;
      const hy = sim.y[heroId] / FP;
      if (Math.hypot(hx - p.x, hy - p.y) <= 18) {
        return heroId;
      }
    }
    let best = -1;
    let bestDist = 16;
    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] > 0 && sim.team[i] !== sim.team[alive[0]] && !sim.hidden[i]) {
        const d = Math.hypot(sim.x[i] / FP - p.x, sim.y[i] / FP - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
    }
    return best;
  }

  protected findWeakestArmorTarget(sim: Sim, unitId: number, fallbackTargetId: number): number {
    const cb = sim.cb;
    const myTeam = sim.team[unitId];
    const ux = sim.x[unitId] / FP;
    const uy = sim.y[unitId] / FP;
    let bestId = fallbackTargetId;
    let bestScore = 1e9;

    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] <= 0 || sim.team[i] === myTeam || sim.hidden[i]) continue;
      const dist = Math.hypot(sim.x[i] / FP - ux, sim.y[i] / FP - uy);
      if (dist > 6.5) continue;
      const armor = partAbs(sim, i, 0) + partAbs(sim, i, 1) + partDef(sim, i, 0);
      const roleBias = cb.kind[i] === Kind.Mage || cb.kind[i] === Kind.Archer ? -12 : cb.kind[i] === Kind.Hero ? -4 : 0;
      const score = armor * 2 + roleBias + dist * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestId = i;
      }
    }
    return bestId;
  }

  protected findNearestEnemy(sim: Sim, unitId: number, fallbackTargetId: number): number {
    const cb = sim.cb;
    const myTeam = sim.team[unitId];
    const ux = sim.x[unitId] / FP;
    const uy = sim.y[unitId] / FP;
    let bestId = fallbackTargetId;
    let bestDist = 1e9;

    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] <= 0 || sim.team[i] === myTeam || sim.hidden[i]) continue;
      const d = Math.hypot(sim.x[i] / FP - ux, sim.y[i] / FP - uy);
      if (d < bestDist) {
        bestDist = d;
        bestId = i;
      }
    }
    return bestId;
  }

  protected issueTacticalOrders(sim: Sim, p: Pack, alive: number[], targetId: number, out: Command[]): void {
    const cb = sim.cb;
    const targetX = sim.x[targetId] / FP;
    const targetY = sim.y[targetId] / FP;

    const cowards: number[] = [];
    const kiters: number[] = [];
    const shamans: number[] = [];
    const hexers: number[] = [];
    const tanks: number[] = [];
    const lungers: number[] = [];
    const chargers: number[] = [];
    const swarmers: number[] = [];

    for (const id of alive) {
      const role = classifyMonsterRole(sim, id);
      const fam = cb.family[id] || '';
      const isGenericSwarmer =
        fam === '' &&
        (cb.bossMods[id]?.length ?? 0) === 0 &&
        cb.tier[id] < 4 &&
        cb.hpMax[id] < 180 &&
        cb.kind[id] === Kind.Gnoll;

      if (isGenericSwarmer) {
        swarmers.push(id);
        continue;
      }

      switch (role) {
        case 'coward_swarm':
          cowards.push(id);
          break;
        case 'ranged_kiter':
          kiters.push(id);
          break;
        case 'shaman_reviver':
          shamans.push(id);
          break;
        case 'hexer_caster':
          hexers.push(id);
          break;
        case 'juggernaut_tank':
          tanks.push(id);
          break;
        case 'ambush_lunger':
          lungers.push(id);
          break;
        case 'berserker_charger':
          chargers.push(id);
          break;
      }
    }

    // Check if a pack leader / shaman / Super-Unique in this pack has died to trigger Coward Swarm panic
    let newlySlainLeader = false;
    for (const memberId of p.ids) {
      if (cb.hp[memberId] <= 0 && !this.fledForLeader.has(memberId)) {
        const memberRole = classifyMonsterRole(sim, memberId);
        const wasLeader =
          memberRole === 'shaman_reviver' ||
          memberRole === 'hexer_caster' ||
          (cb.bossMods[memberId]?.length ?? 0) > 0 ||
          cb.tier[memberId] >= 4 ||
          getSuperUniqueForUnit(sim, memberId) !== undefined;
        if (wasLeader) {
          this.fledForLeader.add(memberId);
          newlySlainLeader = true;
        }
      }
    }

    // 1. Coward Swarm AI (Fallen-style panic retreat for 60 ticks when leader dies or HP < 25%)
    for (const cId of cowards) {
      if (newlySlainLeader) {
        this.panicUntil.set(cId, sim.tick + 60); // 60 ticks = 3 seconds panic retreat
      } else if (cb.hp[cId] * 4 <= cb.hpMax[cId] && !this.lowHpPanicked.has(cId)) {
        this.lowHpPanicked.add(cId);
        this.panicUntil.set(cId, sim.tick + 60);
      }

      const panicEnd = this.panicUntil.get(cId) ?? 0;
      if (sim.tick < panicEnd) {
        const cx = sim.x[cId] / FP;
        const cy = sim.y[cId] / FP;
        const awayDx = cx - targetX || 1;
        const awayDy = cy - targetY || 0;
        const awayLen = Math.hypot(awayDx, awayDy) || 1;
        const retreatX = Math.max(1, Math.min(sim.map.w - 2, Math.round(cx + (awayDx / awayLen) * 4.5)));
        const retreatY = Math.max(1, Math.min(sim.map.h - 2, Math.round(cy + (awayDy / awayLen) * 4.5)));
        out.push({ type: 'order', order: 'retreat', ids: [cId], x: retreatX, y: retreatY });
      } else {
        swarmers.push(cId);
      }
    }

    // 2. Ranged Kiter AI (Quill Fiends, Blowdarts, Scarabs, Glasswings, Archers — NEVER swarm into melee!)
    for (const kId of kiters) {
      const kx = sim.x[kId] / FP;
      const ky = sim.y[kId] / FP;
      const dist = Math.hypot(kx - targetX, ky - targetY);
      const reach = Math.max(5.5, DEFS[cb.kind[kId]].reach / FP);

      if (dist < 3.2) {
        const awayDx = kx - targetX || 1;
        const awayDy = ky - targetY || 0;
        const awayLen = Math.hypot(awayDx, awayDy) || 1;
        const retreatX = Math.max(1, Math.min(sim.map.w - 2, Number((kx + (awayDx / awayLen) * 3.5).toFixed(2))));
        const retreatY = Math.max(1, Math.min(sim.map.h - 2, Number((ky + (awayDy / awayLen) * 3.5).toFixed(2))));
        out.push({ type: 'order', order: 'retreat', ids: [kId], x: retreatX, y: retreatY });
      } else if (dist <= reach) {
        out.push({ type: 'order', order: 'attack', ids: [kId], target: targetId });
      } else {
        out.push({ type: 'order', order: 'attack', ids: [kId], target: targetId, x: targetX, y: targetY });
      }
    }

    // 3. Shaman Reviver & Hexer Caster AI (Backline positioning, Corpse Resurrection, Elite Healing, Curses & Bolts)
    const allCasters = [...shamans, ...hexers];
    for (const sId of allCasters) {
      const resCd = this.resCooldowns.get(sId) ?? 0;
      let raisedSet = this.raisedMinions.get(sId);
      if (!raisedSet) {
        raisedSet = new Set<number>();
        this.raisedMinions.set(sId, raisedSet);
      }
      for (const mId of raisedSet) {
        if (cb.hp[mId] <= 0) raisedSet.delete(mId);
      }

      let didResurrect = false;
      if (knows(sim, sId, 24) && sim.tick >= resCd && raisedSet.size < 2 && cb.mana[sId] >= 30) {
        const sx = sim.x[sId] / FP;
        const sy = sim.y[sId] / FP;
        let bestCorpse = -1;
        let bestCDist = 6.0;
        for (let c = 0; c < sim.count; c++) {
          if (cb.hp[c] <= 0 && cb.corp[c] > 0 && sim.team[c] === sim.team[sId] && !sim.hidden[c]) {
            const cd = Math.hypot(sim.x[c] / FP - sx, sim.y[c] / FP - sy);
            if (cd < bestCDist) {
              bestCDist = cd;
              bestCorpse = c;
            }
          }
        }
        if (bestCorpse >= 0) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: 24, target: bestCorpse });
          this.resCooldowns.set(sId, sim.tick + 375); // strict 15s cooldown
          raisedSet.add(bestCorpse);
          didResurrect = true;
        }
      }

      if (didResurrect) continue;

      const sx = sim.x[sId] / FP;
      const sy = sim.y[sId] / FP;
      const distToTarget = Math.hypot(sx - targetX, sy - targetY);

      if (distToTarget < 3.5) {
        const awayDx = sx - targetX || 1;
        const awayDy = sy - targetY || 0;
        const awayLen = Math.hypot(awayDx, awayDy) || 1;
        const retreatX = Math.max(1, Math.min(sim.map.w - 2, Math.round(sx + (awayDx / awayLen) * 3.5)));
        const retreatY = Math.max(1, Math.min(sim.map.h - 2, Math.round(sy + (awayDy / awayLen) * 3.5)));
        out.push({ type: 'order', order: 'retreat', ids: [sId], x: retreatX, y: retreatY });
        continue;
      }

      // Heal wounded elites/bosses/tanks in the pack (Spell 7: Healing)
      if (knows(sim, sId, 7) && cb.mana[sId] >= 10) {
        let woundedAlly = -1;
        let bestScore = 0.75;
        for (const aId of alive) {
          if (aId === sId || cb.hp[aId] <= 0) continue;
          const ratio = cb.hp[aId] / cb.hpMax[aId];
          if (ratio >= 0.75) continue;
          const dAlly = Math.hypot(sim.x[aId] / FP - sx, sim.y[aId] / FP - sy);
          if (dAlly > 7.0) continue;
          const isEliteOrTank =
            tanks.includes(aId) ||
            (cb.bossMods[aId]?.length ?? 0) > 0 ||
            cb.tier[aId] >= 3 ||
            cb.hpMax[aId] >= 100 ||
            getSuperUniqueForUnit(sim, aId) !== undefined;
          const score = ratio - (isEliteOrTank ? 1.0 : 0);
          if (score < bestScore) {
            bestScore = score;
            woundedAlly = aId;
          }
        }
        if (woundedAlly >= 0) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: 7, target: woundedAlly });
          continue;
        }
      }

      if (distToTarget <= 7.5 && cb.mana[sId] >= 8) {
        if ((knows(sim, sId, 20) || knows(sim, sId, 23)) && !(cb.stMask[targetId] & (1 << St.Weaken))) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: knows(sim, sId, 20) ? 20 : 23, target: targetId });
        } else if (knows(sim, sId, 17) && cb.mana[sId] >= 12 && !(cb.stMask[targetId] & (1 << St.Poison))) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: 17, x: targetX, y: targetY });
        } else if (knows(sim, sId, 4) && !(cb.stMask[targetId] & (1 << St.Slow))) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: 4, target: targetId });
        } else if (knows(sim, sId, 0)) {
          out.push({ type: 'order', order: 'cast', ids: [sId], spell: 0, target: targetId });
        }
      }
    }

    // 4. Juggernaut Tank AI (Bodyblocking line of sight between Shamans/Kiters and Hero + Heavy Windup Slam)
    const protectedBackliners = [...allCasters, ...kiters];
    for (const bId of tanks) {
      const bx = sim.x[bId] / FP;
      const by = sim.y[bId] / FP;
      const d = Math.hypot(bx - targetX, by - targetY);

      let windup = this.bossWindups.get(bId) ?? 0;
      if (windup > 0) {
        windup -= 10;
        this.bossWindups.set(bId, windup);
        if (windup <= 0) {
          out.push({ type: 'order', order: 'attack', ids: [bId], target: targetId, x: targetX, y: targetY });
        } else {
          out.push({ type: 'order', order: 'hold', ids: [bId] });
        }
        continue;
      }

      if (d <= 1.5 && sim.tick % 100 < 10) {
        this.bossWindups.set(bId, 15);
        out.push({ type: 'order', order: 'hold', ids: [bId] });
        continue;
      }

      // If pack has a living shaman or ranged kiter, intercept on the line between the backliner and the enemy
      if (protectedBackliners.length > 0 && d > 1.6) {
        const wardId = protectedBackliners[0];
        const wx = sim.x[wardId] / FP;
        const wy = sim.y[wardId] / FP;
        const dx = targetX - wx;
        const dy = targetY - wy;
        const len = Math.hypot(dx, dy) || 1;
        const stepDist = Math.min(len * 0.55, 2.5);
        const interX = Math.max(1, Math.min(sim.map.w - 2, Number((wx + (dx / len) * stepDist).toFixed(2))));
        const interY = Math.max(1, Math.min(sim.map.h - 2, Number((wy + (dy / len) * stepDist).toFixed(2))));

        if (Math.hypot(bx - interX, by - interY) > 0.85) {
          out.push({ type: 'move', ids: [bId], x: interX, y: interY });
        } else {
          out.push({ type: 'order', order: 'attack', ids: [bId], target: targetId, x: interX, y: interY });
        }
      } else if (sim.cb.ord[bId] === 0 || sim.cb.tgt[bId] < 0 || d > 1.5) {
        out.push({ type: 'order', order: 'attack', ids: [bId], target: targetId, x: targetX, y: targetY });
      }
    }

    // 5. Ambush Lunger & Berserker Charger AI (Flanking sprint onto weakest armor & Berserk below 40% HP)
    const flankers = [...lungers, ...chargers];
    for (const fId of flankers) {
      const fx = sim.x[fId] / FP;
      const fy = sim.y[fId] / FP;
      const isBerserk = cb.hp[fId] * 10 <= cb.hpMax[fId] * 4; // <= 40% HP

      if (isBerserk) {
        // Berserk rage: attack nearest enemy directly without flanking detour or retreat
        const nearest = this.findNearestEnemy(sim, fId, targetId);
        const nx = sim.x[nearest] / FP;
        const ny = sim.y[nearest] / FP;
        out.push({ type: 'order', order: 'attack', ids: [fId], target: nearest, x: nx, y: ny });
        continue;
      }

      // Target lowest-armored enemy (prioritizing Mages/Archers/Hero)
      const weakTarget = this.findWeakestArmorTarget(sim, fId, targetId);
      const wx = sim.x[weakTarget] / FP;
      const wy = sim.y[weakTarget] / FP;
      const dist = Math.hypot(fx - wx, fy - wy);

      if (dist > 2.8 && lungers.includes(fId)) {
        // Flanking arc approach perpendicular to target vector
        const dx = wx - fx;
        const dy = wy - fy;
        const len = Math.hypot(dx, dy) || 1;
        const side = fId & 1 ? 1 : -1;
        const perpX = (-dy / len) * side * 1.8;
        const perpY = (dx / len) * side * 1.8;
        const flankX = Math.max(1, Math.min(sim.map.w - 2, Number((wx + perpX).toFixed(2))));
        const flankY = Math.max(1, Math.min(sim.map.h - 2, Number((wy + perpY).toFixed(2))));
        out.push({ type: 'order', order: 'attack', ids: [fId], target: weakTarget, x: flankX, y: flankY });
      } else {
        out.push({ type: 'order', order: 'attack', ids: [fId], target: weakTarget, x: wx, y: wy });
      }
    }

    // 6. Frontline Swarm AI (wolves, gnolls, grunts surround the hero)
    if (swarmers.length > 0) {
      out.push({ type: 'order', order: 'swarm', ids: swarmers, x: targetX, y: targetY });
    }
  }

  commands(sim: Sim): Command[] {
    const out: Command[] = [];
    if (sim.tick % 10 !== 3) return out;
    const cb = sim.cb;
    for (const p of this.packs) {
      const alive = p.ids.filter((id) => cb.hp[id] > 0);
      if (alive.length === 0) continue;
      const engaged = alive.find((id) => cb.tgt[id] >= 0 && cb.hp[cb.tgt[id]] > 0);
      if (!p.hunting) {
        if (engaged === undefined) continue;
        const t = cb.tgt[engaged];
        p.hunting = true;
        p.calm = 0;
        this.issueTacticalOrders(sim, p, alive, t, out);
        continue;
      }
      p.calm = engaged === undefined ? p.calm + 10 : 0;
      let cx = 0;
      let cy = 0;
      for (const id of alive) {
        cx += sim.x[id];
        cy += sim.y[id];
      }
      const far = Math.hypot(cx / alive.length / FP - p.x, cy / alive.length / FP - p.y) > 22;
      if (p.calm >= 100 || far) {
        p.hunting = false;
        out.push({ type: 'order', order: 'guard', ids: alive, x: p.x, y: p.y });
        continue;
      }

      const primaryTarget = this.choosePrimaryTarget(sim, p, alive, engaged);
      if (primaryTarget >= 0) {
        this.issueTacticalOrders(sim, p, alive, primaryTarget, out);
      }
    }
    return out;
  }
}

export interface SkirmishDirectorOptions {
  team?: number;
  seed?: number;
  squadSize?: number;
  repopCooldown?: number;
  raidInterval?: number;
  scavengeRadius?: number;
  defenseRadius?: number;
  repopCost?: number;
  enableGoldEconomy?: boolean;
  enableRaids?: boolean;
  enableRepopulation?: boolean;
  enableDefense?: boolean;
}

/**
 * Solo Skirmish AI Director (P11 & P14):
 * Orchestrates rival enemy faction / monster commanders on skirmish maps:
 * - Resource Gathering: scouts & scavengers pick up dropped gold sacks, increasing enemy gold.
 * - Camp Repopulation & Recruitment: cleared camps revive fallen minions using accumulated gold or cooldown.
 * - Coordinated Raid Squads: periodically dispatches tactical strike squads to advance and attack player positions.
 * - Stronghold & Base Defense: detects intruders breaching perimeter and rallies defenders to repel intruders.
 * - Sim Determinism: 100% deterministic command log replay without Math.random.
 */
export class SkirmishDirector extends MonsterAi {
  protected deathTicks = new Map<number, number>();
  protected lastRaidTick = 0;
  protected raidCount = 0;
  private readonly rng: Rng;
  readonly options: SkirmishDirectorOptions;

  constructor(packs: Pack[], options: SkirmishDirectorOptions = {}) {
    super(packs);
    this.options = {
      team: options.team ?? 1,
      seed: options.seed ?? 1,
      squadSize: options.squadSize ?? 4,
      repopCooldown: options.repopCooldown ?? 450,
      raidInterval: options.raidInterval ?? 600,
      scavengeRadius: options.scavengeRadius ?? 20,
      defenseRadius: options.defenseRadius ?? 14,
      repopCost: options.repopCost ?? 40,
      enableGoldEconomy: options.enableGoldEconomy ?? true,
      enableRaids: options.enableRaids ?? true,
      enableRepopulation: options.enableRepopulation ?? true,
      enableDefense: options.enableDefense ?? true,
    };
    this.rng = new Rng(this.options.seed ?? 1);
  }

  getRaidCount(): number {
    return this.raidCount;
  }

  getDeathCount(): number {
    return this.deathTicks.size;
  }

  override snapshotExtra(): MonsterAiExtra {
    const base = super.snapshotExtra();
    const byId = <T,>(a: [number, T][]): [number, T][] => a.sort((p, q) => p[0] - q[0]);
    base.director = {
      death: byId([...this.deathTicks]),
      lastRaid: this.lastRaidTick,
      raidCount: this.raidCount,
    };
    return base;
  }

  override restoreExtra(x: MonsterAiExtra | undefined): void {
    super.restoreExtra(x);
    if (x?.director) {
      this.deathTicks = new Map(x.director.death ?? []);
      this.lastRaidTick = x.director.lastRaid ?? 0;
      this.raidCount = x.director.raidCount ?? 0;
    }
  }

  override commands(sim: Sim): Command[] {
    const out: Command[] = super.commands(sim);

    // Staggered director decisions: runs every 25 ticks (1 Hz) at tick % 25 === 7
    if (sim.tick % 25 !== 7) return out;

    // Do not issue director commands if mission is already finished
    if (sim.script && sim.script.st.status !== 0) return out;

    if (this.options.enableDefense) {
      this.checkBaseDefense(sim, out);
    }

    if (this.options.enableGoldEconomy) {
      this.checkResourceGathering(sim, out);
    }

    if (this.options.enableRepopulation) {
      this.checkRepopulation(sim, out);
    }

    if (this.options.enableRaids) {
      this.checkRaidSquads(sim, out);
    }

    return out;
  }

  forceRaid(sim: Sim): Command[] {
    const out: Command[] = [];
    this.lastRaidTick = -9999;
    this.checkRaidSquads(sim, out);
    return out;
  }

  forceScavenge(sim: Sim): Command[] {
    const out: Command[] = [];
    this.checkResourceGathering(sim, out);
    return out;
  }

  forceRepopulate(sim: Sim): Command[] {
    const out: Command[] = [];
    this.checkRepopulation(sim, out);
    return out;
  }

  private checkBaseDefense(sim: Sim, out: Command[]): void {
    const cb = sim.cb;
    const team = this.options.team ?? 1;
    const defRadiusSq = (this.options.defenseRadius ?? 14) ** 2;

    for (const p of this.packs) {
      if (p.hunting) continue;
      const alive = p.ids.filter((id) => cb.hp[id] > 0 && sim.team[id] === team);
      if (alive.length === 0) continue;

      let intruder = -1;
      let closestIntruderDistSq = defRadiusSq;

      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] !== team && cb.hp[i] > 0 && !sim.hidden[i]) {
          const ix = sim.x[i] / FP;
          const iy = sim.y[i] / FP;
          const d2 = (ix - p.x) ** 2 + (iy - p.y) ** 2;
          if (d2 < closestIntruderDistSq) {
            closestIntruderDistSq = d2;
            intruder = i;
          }
        }
      }

      if (intruder >= 0) {
        p.hunting = true;
        p.calm = 0;
        this.issueTacticalOrders(sim, p, alive, intruder, out);
      }
    }
  }

  private checkResourceGathering(sim: Sim, out: Command[]): void {
    const cb = sim.cb;
    const team = this.options.team ?? 1;
    const scavengeRadSq = (this.options.scavengeRadius ?? 20) ** 2;

    const scavengers: number[] = [];
    for (let i = 0; i < sim.count; i++) {
      if (
        sim.team[i] === team &&
        cb.hp[i] > 0 &&
        !sim.hidden[i] &&
        cb.tgt[i] < 0 &&
        cb.ord[i] !== Ord.Pickup &&
        cb.ord[i] !== Ord.Attack
      ) {
        scavengers.push(i);
      }
    }
    if (scavengers.length === 0) return;

    for (let s = 0; s < 64; s++) {
      if (cb.sG[s] <= 0) continue;
      const sx = cb.sX[s] / FP;
      const sy = cb.sY[s] / FP;

      let bestScavenger = -1;
      let bestDistSq = scavengeRadSq;

      for (const u of scavengers) {
        const ux = sim.x[u] / FP;
        const uy = sim.y[u] / FP;
        const d2 = (ux - sx) ** 2 + (uy - sy) ** 2;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestScavenger = u;
        }
      }

      if (bestScavenger >= 0) {
        out.push({ type: 'order', order: 'pickup', ids: [bestScavenger], x: sx, y: sy });
        const idx = scavengers.indexOf(bestScavenger);
        if (idx >= 0) scavengers.splice(idx, 1);
        if (scavengers.length === 0) break;
      }
    }
  }

  private checkRepopulation(sim: Sim, out: Command[]): void {
    const cb = sim.cb;
    const team = this.options.team ?? 1;
    const cooldown = this.options.repopCooldown ?? 450;
    const cost = this.options.enableGoldEconomy ? (this.options.repopCost ?? 40) : 0;

    for (const p of this.packs) {
      for (const id of p.ids) {
        if (sim.team[id] !== team) continue;
        if (cb.hp[id] <= 0) {
          if (!this.deathTicks.has(id)) {
            this.deathTicks.set(id, sim.tick);
          } else {
            const deathTick = this.deathTicks.get(id)!;
            if (sim.tick - deathTick >= cooldown) {
              if (cost === 0 || cb.gold[team] >= cost) {
                const targetX = Math.floor(p.x);
                const targetY = Math.floor(p.y);
                out.push({ type: 'repopulate', id, x: targetX, y: targetY, cost });
                this.deathTicks.delete(id);
                break;
              }
            }
          }
        } else {
          this.deathTicks.delete(id);
        }
      }
    }
  }

  private checkRaidSquads(sim: Sim, out: Command[]): void {
    const interval = this.options.raidInterval ?? 600;
    if (sim.tick - this.lastRaidTick < interval) return;

    const cb = sim.cb;
    const team = this.options.team ?? 1;

    let targetId = -1;
    if (sim.hero && cb.hp[sim.hero.id] > 0 && sim.team[sim.hero.id] !== team) {
      targetId = sim.hero.id;
    } else {
      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] !== team && cb.hp[i] > 0 && !sim.hidden[i]) {
          targetId = i;
          break;
        }
      }
    }
    if (targetId < 0) return;

    const tx = sim.x[targetId] / FP;
    const ty = sim.y[targetId] / FP;

    const candidates: number[] = [];
    for (const p of this.packs) {
      if (p.hunting) continue;
      for (const id of p.ids) {
        if (
          sim.team[id] === team &&
          cb.hp[id] > 0 &&
          !sim.hidden[id] &&
          cb.tgt[id] < 0 &&
          cb.ord[id] !== Ord.Pickup
        ) {
          candidates.push(id);
        }
      }
    }

    const squadSize = this.options.squadSize ?? 4;
    if (candidates.length < 2) return;

    const squad = candidates.slice(0, squadSize);

    let avgDist = 0;
    for (const id of squad) {
      avgDist += Math.hypot(sim.x[id] / FP - tx, sim.y[id] / FP - ty);
    }
    avgDist /= squad.length;

    if (avgDist > 12) {
      out.push({ type: 'move', ids: squad, x: tx, y: ty });
    } else {
      out.push({ type: 'order', order: 'attack', ids: squad, target: targetId, x: tx, y: ty });
    }

    this.lastRaidTick = sim.tick;
    this.raidCount++;
  }
}

export interface Scenario {
  teams: number[];
  kinds: number[];
  /** Start tile per unit. */
  tiles: [number, number][];
  packs: Pack[];
  tiers?: number[];
  families?: string[];
  bossMods?: string[][];
}

/** Nearest open tile (spiral) to (x, y) that no earlier unit took. */
function freeTile(map: GameMap, taken: Set<number>, x: number, y: number): [number, number] {
  for (let r = 0; r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = x + dx;
        const py = y + dy;
        if (isBlockedAt(map, px, py) || taken.has(py * map.w + px)) continue;
        taken.add(py * map.w + px);
        return [px, py];
      }
    }
  }
  return [x, y];
}

/** The test fight: a hero's squad of 12 in the start meadow against five monster packs. */
export function fightScenario(map: GameMap): Scenario {
  const sc: Scenario = { teams: [], kinds: [], tiles: [], packs: [] };
  const taken = new Set<number>();
  const add = (team: number, kind: number, x: number, y: number): number => {
    sc.teams.push(team);
    sc.kinds.push(kind);
    sc.tiles.push(freeTile(map, taken, x, y));
    return sc.teams.length - 1;
  };
  const mine = [Kind.Hero, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Archer, Kind.Archer, Kind.Archer, Kind.Mage, Kind.Mage];
  mine.forEach((k, n) => add(0, k, 6 + (n % 4), map.h - 8 + Math.floor(n / 4)));
  const pack = (x: number, y: number, kinds: number[]): void => {
    const ids = kinds.map((k, n) => add(1, k, x + (n % 3), y + Math.floor(n / 3)));
    const [px, py] = sc.tiles[ids[0]]; // the post is a tile the pack really stands on
    sc.packs.push({ ids, x: px + 0.5, y: py + 0.5, hunting: false, calm: 0 });
  };
  pack(24, map.h - 14, [Kind.Gnoll, Kind.Gnoll, Kind.Gnoll]);
  pack(34, 30, [Kind.Gnoll, Kind.Gnoll, Kind.Imp]);
  pack(28, 10, [Kind.Imp, Kind.Imp, Kind.Gnoll]);
  pack(46, 14, [Kind.Golem, Kind.Imp, Kind.Imp]);
  pack(56, 36, [Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Archer]);
  return sc;
}

/** 150 against 150 in the open, for the combat frame-rate benchmark. Both sides get a swarm order. */
export function battleScenario(map: GameMap): Scenario {
  const sc: Scenario = { teams: [], kinds: [], tiles: [], packs: [] };
  const taken = new Set<number>();
  const mix = [Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Gnoll, Kind.Gnoll, Kind.Imp];
  for (let i = 0; i < 300; i++) {
    const team = i < 150 ? 0 : 1;
    const n = i % 150;
    const kind = team === 0 ? [Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Mage][n % 4] : mix[n % mix.length];
    const col = n % 15;
    const row = Math.floor(n / 15);
    const cx = team === 0 ? 5 + col : 32 + col;
    sc.teams.push(team);
    sc.kinds.push(kind);
    sc.tiles.push(freeTile(map, taken, cx, map.h - 12 + row));
  }
  return sc;
}

export function placeScenario(sim: Sim, sc: Scenario): void {
  sc.tiles.forEach(([x, y], i) => sim.place(i, x, y));
}

/** Pack `count` units shoulder to shoulder into the start meadow (0.55 tile apart) for crowd tests. */
export function setupCrowd(sim: Sim, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = 2.3 + (i % 21) * 0.55;
    const y = sim.map.h - 11.7 + Math.floor(i / 21) * 0.55;
    sim.x[i] = sim.tx[i] = Math.round(x * FP);
    sim.y[i] = sim.ty[i] = Math.round(y * FP);
  }
}

/** Place units: team 0 in the start meadow and the rest spread over open ground. */
export function setupSquads(sim: Sim): void {
  let b = 0;
  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] === 0) {
      const k = i;
      sim.place(i, 4 + (k % 6), sim.map.h - 10 + Math.floor(k / 6));
    } else {
      // walk the map in a scan and take free tiles
      for (;;) {
        const x = 16 + ((b * 7) % (sim.map.w - 18));
        const y = 2 + ((b * 13) % (sim.map.h - 4));
        b++;
        if (!sim.map.blocked[y * sim.map.w + x]) {
          sim.place(i, x, y);
          break;
        }
      }
    }
  }
}
