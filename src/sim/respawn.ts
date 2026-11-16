import type { Scenario } from './bot';
import { FP, type Sim } from './sim';
import { mulberry32 } from '../map-generator';
import { Kind, DEFS } from './combat';
import { getSuperUniquesForAct, spawnSuperUniqueInPack } from './super-uniques';

export const D2R_BOSS_MODS = [
  'extra_fast',
  'extra_strong',
  'stone_skin',
  'lightning_enchanted',
  'fire_enchanted',
  'cold_enchanted',
  'spectral_hit',
  'mana_burn',
  'magic_resistant',
  'blessed_aura',
  'cursed',
  'teleporting',
] as const;

export type D2RBossMod = (typeof D2R_BOSS_MODS)[number];

const ACT_BIOME_FAMILIES: Record<number, { mobs: string[]; elites: string[]; tierRange: [number, number] }> = {
  1: {
    mobs: ['briar-hound', 'thorn-boar', 'quill-fiend', 'fallen-shaman'],
    elites: ['rootbound', 'wendigo-bruiser', 'chief-ironhide'],
    tierRange: [1, 2],
  },
  2: {
    mobs: ['mire-wisp', 'salt-crab', 'fetish-blowdart', 'spore-matron'],
    elites: ['flintback', 'witch-doctor', 'bog-behemoth'],
    tierRange: [2, 3],
  },
  3: {
    mobs: ['dune-lurker', 'sand-raider', 'dune-scarab', 'claw-viper'],
    elites: ['basalt-brute', 'crowned-maw', 'stormtree'],
    tierRange: [3, 4],
  },
  4: {
    mobs: ['cinderling', 'ash-weaver', 'doom-knight', 'cinderhorn'],
    elites: ['redglass-drake', 'anvilmaw-smith', 'infernal-colossus'],
    tierRange: [4, 5],
  },
};

/** Deterministic string hash helper for seed mixing */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Apply dynamic D2R session respawn to a wilderness mission.
 * Jitters monster pack positions, introduces champion and elite packs with D2R affixes,
 * and scales families/tiers according to Act biome.
 * Fully deterministic given the same sessionSeed and nodeId.
 */
export function applyDynamicSessionRespawn(
  sim: Sim,
  scenario: Scenario,
  sessionSeed: number,
  nodeId = 'mission',
  act: 1 | 2 | 3 | 4 = 1,
): { championsCount: number; elitesCount: number; superUniquesCount: number; superUniques: string[] } {
  const seed = (sessionSeed ^ hashString(nodeId)) >>> 0;
  const rng = mulberry32(seed);

  const randInt = (min: number, max: number): number => {
    return Math.floor(rng() * (max - min + 1)) + min;
  };

  const biome = ACT_BIOME_FAMILIES[act] ?? ACT_BIOME_FAMILIES[1];
  const cb = sim.cb;
  const map = sim.map;
  const w = map.w;
  const h = map.h;

  let championsCount = 0;
  let elitesCount = 0;
  let superUniquesCount = 0;
  const superUniques: string[] = [];

  // Identify pack leaders among enemy units (team 1)
  const enemyPackLeaders: number[] = [];
  const enemyMinions: number[] = [];

  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] === 0 || sim.hidden[i]) continue;
    // Don't modify friendly units or dormant units
    const isVip = sim.script?.def.vip.includes(i) ?? false;

    // Check if this unit is a pack leader in scenario
    const isPackLeader = scenario.packs.some((p) => p.ids[0] === i);
    if (isPackLeader && !isVip) {
      enemyPackLeaders.push(i);
    } else if (!isVip) {
      enemyMinions.push(i);
    }
  }

  // Shuffle pack leaders deterministically to pick Champions & Elites
  for (let i = enemyPackLeaders.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = enemyPackLeaders[i];
    enemyPackLeaders[i] = enemyPackLeaders[j];
    enemyPackLeaders[j] = tmp;
  }

  const numElites = Math.min(enemyPackLeaders.length, Math.max(1, Math.min(2, Math.floor(enemyPackLeaders.length * 0.25))));
  const numChampions = Math.min(enemyPackLeaders.length - numElites, Math.max(1, Math.min(3, Math.floor(enemyPackLeaders.length * 0.35))));

  // Assign Elite leaders (2 D2R affixes, higher tier, boss minion aura)
  for (let k = 0; k < numElites; k++) {
    const u = enemyPackLeaders[k];
    const mod1Idx = randInt(0, D2R_BOSS_MODS.length - 1);
    let mod2Idx = randInt(0, D2R_BOSS_MODS.length - 1);
    if (mod2Idx === mod1Idx) mod2Idx = (mod2Idx + 1) % D2R_BOSS_MODS.length;

    const eliteMods = [D2R_BOSS_MODS[mod1Idx], D2R_BOSS_MODS[mod2Idx]];
    (cb.bossMods as string[][])[u] = eliteMods;

    const eliteFamily = biome.elites[randInt(0, biome.elites.length - 1)];
    (cb.family as string[])[u] = eliteFamily;
    (cb.tier as unknown as number[])[u] = Math.min(5, biome.tierRange[1] + 1);

    // Buff elite HP & stats
    cb.hpMax[u] = Math.round(cb.hpMax[u] * 1.5);
    cb.hp[u] = cb.hpMax[u];

    elitesCount++;
  }

  // Assign Champion leaders (1 D2R affix, gold tint, increased speed)
  for (let k = numElites; k < numElites + numChampions; k++) {
    const u = enemyPackLeaders[k];
    const modIdx = randInt(0, D2R_BOSS_MODS.length - 1);
    const champMod = D2R_BOSS_MODS[modIdx];

    (cb.bossMods as string[][])[u] = [champMod, 'champion'];
    (cb.family as string[])[u] = biome.mobs[randInt(0, biome.mobs.length - 1)];
    (cb.tier as unknown as number[])[u] = Math.min(5, biome.tierRange[1]);

    cb.hpMax[u] = Math.round(cb.hpMax[u] * 1.25);
    cb.hp[u] = cb.hpMax[u];

    championsCount++;
  }

  // Spawn 1-2 Named Super-Unique bosses with their retinue in wilderness zones
  const actSuperPool = [...getSuperUniquesForAct(act)];
  for (let i = actSuperPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = actSuperPool[i];
    actSuperPool[i] = actSuperPool[j];
    actSuperPool[j] = tmp;
  }

  const maxSuperUniques = enemyPackLeaders.length >= 3 ? 2 : enemyPackLeaders.length >= 1 ? 1 : 0;
  for (let s = 0; s < maxSuperUniques && s < actSuperPool.length; s++) {
    // Pick from the end of enemyPackLeaders so we keep elite/champion variety too
    const leaderId = enemyPackLeaders[enemyPackLeaders.length - 1 - s];
    const pack = scenario.packs.find((p) => p.ids[0] === leaderId);
    if (pack) {
      const spawned = spawnSuperUniqueInPack(sim, pack, actSuperPool[s]);
      if (spawned) {
        superUniquesCount++;
        elitesCount++;
        superUniques.push(spawned.def.id);
      }
    }
  }

  // Deterministically jitter positions of monster packs around walkable paths
  for (const pack of scenario.packs) {
    const jitterX = randInt(-2, 2);
    const jitterY = randInt(-2, 2);

    for (const uid of pack.ids) {
      if (sim.team[uid] === 0 || sim.hidden[uid]) continue;
      const curTx = Math.floor(sim.x[uid] / FP);
      const curTy = Math.floor(sim.y[uid] / FP);

      const newTx = Math.max(1, Math.min(w - 2, curTx + jitterX));
      const newTy = Math.max(1, Math.min(h - 2, curTy + jitterY));

      const idx = newTy * w + newTx;
      // If target tile is walkable and not blocked
      if (map.blocked && !map.blocked[idx]) {
        sim.x[uid] = (newTx + 0.5) * FP;
        sim.y[uid] = (newTy + 0.5) * FP;
        sim.tx[uid] = sim.x[uid];
        sim.ty[uid] = sim.y[uid];
        cb.px[uid] = sim.x[uid];
        cb.py[uid] = sim.y[uid];
      }
    }
  }

  return { championsCount, elitesCount, superUniquesCount, superUniques };
}
