import { loadDoc, type LoadedMission } from './mapdoc';
import { BOSS_PROFILES, BossPhaseController, type CampaignBossId } from './sim/ai/boss-phases';
import { CompanionController } from './sim/ai/companion-orders';
import { EliteDirector } from './sim/ai/elite-director';
import { WORLD_SHRINE_KINDS, WorldEventsDirector } from './sim/ai/shrines-events';
import { DIFFICULTY_TIERS, SkirmishModeController } from './sim/ai/skirmish-modes';
import { MonsterAi, SkirmishDirector, placeScenario } from './sim/bot';
import { Kind } from './sim/combat';
import { placeCampaignGoldPiles } from './sim/loot';
import { applyDynamicSessionRespawn } from './sim/respawn';
import { ScriptRuntime } from './sim/script';
import { Sim } from './sim/sim';

export const TEST_KEY = 'thornvael.testmap';

export const SKIRMISH_MAP_NAMES = new Set([
  'Bracken Glade',
  'Scarlet Ridge',
  'Tidebreak Cove',
  'Blackwater Reach',
  'Crossroads of Ash',
  'Shattered Shore',
  'Twin Furies',
  'Inward March',
  'Muddlefen',
  'Shallow Ford',
  'Ashen Tier',
  'Twin Fords of Alder',
  'The Cinder Hourglass',
  'Sunken Causeway',
  'Blackmire Basin',
  'Split-Stone Passes',
  'Lantern Hedge Maze',
  'Vigil of Ironcamp',
  'Four-Corner Keep',
  'Wardstone Atoll',
  'Riverlock Crossroads',
  'Throne of Cinders',
  'Grand Iron Estuary',
]);

export interface MissionDirectors {
  elites: EliteDirector;
  events: WorldEventsDirector;
  bosses: BossPhaseController[];
  companions: CompanionController[];
  skirmishMode: SkirmishModeController | null;
  tierName: string;
}

export interface MissionGame {
  loaded: LoadedMission;
  sim: Sim;
  ai: MonsterAi;
  directors?: MissionDirectors;
}

type MapModuleLoader = () => Promise<{ default: unknown }>;

const loadOssuary: MapModuleLoader = () => import('./missions/weeping-ossuary.map.json');
const loadGullet: MapModuleLoader = () => import('./missions/gullet-of-dunes.map.json');
const loadDrowned: MapModuleLoader = () => import('./missions/drowned-choir.map.json');
const loadCinder: MapModuleLoader = () => import('./missions/cinder-throne.map.json');

/** Dynamic per-act/skirmish mission loaders for Vite code-splitting (zero eager JSON in initial bundle). */
export const BUILTIN_MISSION_LOADERS: Readonly<Record<string, MapModuleLoader>> = {
  ford: () => import('./missions/blood-at-the-ford.map.json'),
  market: () => import('./missions/thornwick-market.map.json'),
  'redmarsh-outpost': () => import('./missions/redmarsh-outpost.map.json'),
  'oakhaven-bastion': () => import('./missions/oakhaven-bastion.map.json'),
  fen: () => import('./missions/whispers-in-the-fen.map.json'),
  ravenwatch: () => import('./missions/nightfall-at-ravenwatch.map.json'),
  sanctum: () => import('./missions/the-sunken-sanctum.map.json'),
  glade: () => import('./missions/bracken-glade.map.json'),
  scarlet: () => import('./missions/scarlet-ridge.map.json'),
  tidebreak: () => import('./missions/tidebreak-cove.map.json'),
  blackwater: () => import('./missions/blackwater-reach.map.json'),
  crossroads: () => import('./missions/crossroads-of-ash.map.json'),
  shattered: () => import('./missions/shattered-shore.map.json'),
  twinfuries: () => import('./missions/twin-furies.map.json'),
  inward: () => import('./missions/inward-march.map.json'),
  muddlefen: () => import('./missions/muddlefen.map.json'),
  shallowford: () => import('./missions/shallow-ford.map.json'),
  ashentier: () => import('./missions/ashen-tier.map.json'),
  m05: () => import('./missions/m05-lantern-passage.map.json'),
  m06: () => import('./missions/m06-greywood-supply.map.json'),
  m07: () => import('./missions/m07-split-vanguard.map.json'),
  m08: () => import('./missions/m08-alder-bridge.map.json'),
  m09: () => import('./missions/m09-ironhide-hunt.map.json'),
  m10: () => import('./missions/m10-undervault-links.map.json'),
  m11: () => import('./missions/m11-ashbrook-retreat.map.json'),
  m12: () => import('./missions/m12-redmarsh-border.map.json'),
  m13: () => import('./missions/m13-twin-passes.map.json'),
  m14: () => import('./missions/m14-scattered-scouts.map.json'),
  m15: () => import('./missions/m15-outpost-palisade.map.json'),
  m16: () => import('./missions/m16-wardstone-rupture.map.json'),
  m17: () => import('./missions/m17-mire-convoy.map.json'),
  m18: () => import('./missions/m18-granary-raid.map.json'),
  m19: () => import('./missions/m19-hexer-capture.map.json'),
  m20: () => import('./missions/m20-deep-quarry.map.json'),
  m21: () => import('./missions/m21-lean-garrison.map.json'),
  m22: () => import('./missions/m22-fleeing-column.map.json'),
  m23: () => import('./missions/m23-fork-of-spears.map.json'),
  m24: () => import('./missions/m24-pledge-at-oakhaven.map.json'),
  m25: () => import('./missions/m25-cinder-wards.map.json'),
  m26: () => import('./missions/m26-sundered-ranks.map.json'),
  m27: () => import('./missions/m27-field-infirmary.map.json'),
  m28: () => import('./missions/m28-sunken-citadel.map.json'),
  m29: () => import('./missions/m29-hourglass-rescue.map.json'),
  m30: () => import('./missions/m30-starved-bastion.map.json'),
  m31: () => import('./missions/m31-riverlock-crossing.map.json'),
  m32: () => import('./missions/m32-elder-juggernaut.map.json'),
  m33: () => import('./missions/m33-high-stakes-gambit.map.json'),
  m34: () => import('./missions/m34-clashing-banners.map.json'),
  m35: () => import('./missions/m35-burning-harbor.map.json'),
  m36: () => import('./missions/m36-heartland-march.map.json'),
  m37: () => import('./missions/m37-shattered-beacons.map.json'),
  m38: () => import('./missions/m38-besieged-wall.map.json'),
  m39: () => import('./missions/m39-flight-of-malrik.map.json'),
  m40: () => import('./missions/m40-twofold-assault.map.json'),
  m41: () => import('./missions/m41-gauntlet-of-iron.map.json'),
  m42: () => import('./missions/m42-outer-rampart.map.json'),
  m43: () => import('./missions/m43-three-roads-siege.map.json'),
  m44: () => import('./missions/m44-threshold-choice.map.json'),
  m45: () => import('./missions/m45-crown-of-order.map.json'),
  m46: () => import('./missions/m46-ember-reckoning.map.json'),
  'weeping-ossuary': loadOssuary,
  'gullet-of-dunes': loadGullet,
  'drowned-choir': loadDrowned,
  'cinder-throne': loadCinder,
  'map1-border-fords': () => import('./missions/map1-border-fords.map.json'),
  'map2-redmarsh-wastes': () => import('./missions/map2-redmarsh-wastes.map.json'),
  'map3-iron-coast': () => import('./missions/map3-iron-coast.map.json'),
  'map4-obsidian-caldera': () => import('./missions/map4-obsidian-caldera.map.json'),
  'skirmish-twin-fords': () => import('./missions/skirmish-twin-fords.map.json'),
  'skirmish-ash-hourglass': () => import('./missions/skirmish-ash-hourglass.map.json'),
  'skirmish-sunken-causeway': () => import('./missions/skirmish-sunken-causeway.map.json'),
  'skirmish-fen-attrition': () => import('./missions/skirmish-fen-attrition.map.json'),
  'skirmish-quarry-passes': () => import('./missions/skirmish-quarry-passes.map.json'),
  'skirmish-lantern-labyrinth': () => import('./missions/skirmish-lantern-labyrinth.map.json'),
  'skirmish-night-bastion': () => import('./missions/skirmish-night-bastion.map.json'),
  'skirmish-four-corners': () => import('./missions/skirmish-four-corners.map.json'),
  'skirmish-wardstone-ring': () => import('./missions/skirmish-wardstone-ring.map.json'),
  'skirmish-riverlock-cross': () => import('./missions/skirmish-riverlock-cross.map.json'),
  'skirmish-citadel-crown': () => import('./missions/skirmish-citadel-crown.map.json'),
  'skirmish-grand-estuary': () => import('./missions/skirmish-grand-estuary.map.json'),
  ossuary: loadOssuary,
  gullet: loadGullet,
  drowned: loadDrowned,
  cinder: loadCinder,
};

export const BUILT_IN_NAMES: ReadonlySet<string> = new Set(Object.keys(BUILTIN_MISSION_LOADERS));

function initMissionDirectors(loaded: LoadedMission, sim: Sim, seed: number, useDirector: boolean): MissionDirectors {
  const elites = new EliteDirector(seed);
  const events = new WorldEventsDirector(seed);
  const bosses: BossPhaseController[] = [];
  const companions: CompanionController[] = [];

  for (let i = 0; i < (loaded.doc.shrines?.length ?? 0); i++) {
    const sh = loaded.doc.shrines![i];
    events.addShrine(WORLD_SHRINE_KINDS[i % WORLD_SHRINE_KINDS.length], sh.x * 256, sh.y * 256);
  }

  for (let i = 0; i < sim.count; i++) {
    const fam = loaded.scenario.families?.[i] as CampaignBossId | undefined;
    if (fam && fam in BOSS_PROFILES) {
      bosses.push(new BossPhaseController(fam, sim.cb.hpMax[i], seed + i));
    }
    const tier = loaded.scenario.tiers?.[i] ?? 0;
    if (sim.team[i] === 1 && tier >= 3) {
      elites.spawnPack([{ id: i, x: sim.x[i], y: sim.y[i], maxHp: sim.cb.hpMax[i] }], 1);
    }
    if (sim.team[i] === 0 && sim.cb.kind[i] !== Kind.Hero) {
      const arch = sim.cb.kind[i] === Kind.Archer ? 'archer' : sim.cb.kind[i] === Kind.Mage ? 'mage' : 'warrior';
      companions.push(new CompanionController(i, arch, sim.x[i], sim.y[i], sim.cb.hpMax[i]));
    }
  }

  const skirmishMode = useDirector ? new SkirmishModeController('capture_shrines') : null;
  return { elites, events, bosses, companions, skirmishMode, tierName: DIFFICULTY_TIERS[0].name };
}

/** Build the sim for a loaded mission: units placed, script attached, monsters on watch. */
export function createMission(
  loaded: LoadedMission,
  seed = 1,
  options?: {
    director?: boolean;
    sessionSeed?: number;
    nodeId?: string;
    act?: 1 | 2 | 3 | 4;
  },
): MissionGame {
  const { scenario, map, def, doc } = loaded;
  const sim = new Sim(map, seed, scenario.teams, {
    combat: true,
    kinds: scenario.kinds,
    dayOffset: doc.day ?? 0,
    tiers: scenario.tiers,
    families: scenario.families,
    bossMods: scenario.bossMods,
  });
  placeScenario(sim, scenario);
  sim.settle();
  sim.attachTowns(doc.towns ?? []);
  if (doc.shrines?.length) sim.attachShrines(doc.shrines);
  sim.attachScript(new ScriptRuntime(structuredClone(def)));
  // Spawn interactive clickable gold piles alongside chests and monster camps (isolated PRNG)
  placeCampaignGoldPiles(sim, doc);

  // If dynamic session respawn is requested for a wilderness mission, apply it
  if (options?.sessionSeed && (!doc.towns || doc.towns.length === 0)) {
    applyDynamicSessionRespawn(sim, scenario, options.sessionSeed, options.nodeId ?? doc.name, options.act ?? 1);
  }

  const useDirector = options?.director ?? SKIRMISH_MAP_NAMES.has(doc.name);
  const ai = useDirector
    ? new SkirmishDirector(structuredClone(scenario.packs), { seed, team: 1 })
    : new MonsterAi(structuredClone(scenario.packs));
  const directors = initMissionDirectors(loaded, sim, seed, useDirector);
  return { loaded, sim, ai, directors };
}

/** Dynamically load a built-in mission chunk on demand, or `test` from localStorage. */
export async function loadMissionByName(name: string): Promise<LoadedMission> {
  if (name === 'test') {
    const raw = localStorage.getItem(TEST_KEY);
    if (!raw) throw new Error('No test map found. Open the editor and press Test play.');
    return loadDoc(JSON.parse(raw));
  }
  if (name === 'kids-paradise-opening') {
    const mod = await import('./missions/kids-paradise-opening.map.json');
    return loadDoc(mod.default);
  }
  if (name === 'act1-world') {
    const mod = await import('./worlds/act1-world.map.json');
    return loadDoc(mod.default);
  }
  const loader = BUILTIN_MISSION_LOADERS[name];
  if (!loader) throw new Error(`Unknown mission "${name}".`);
  const mod = await loader();
  return loadDoc(mod.default);
}
