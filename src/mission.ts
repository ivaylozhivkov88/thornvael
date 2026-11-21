import { loadDoc, type LoadedMission } from './mapdoc';
import { MonsterAi, SkirmishDirector, placeScenario } from './sim/bot';
import { Kind } from './sim/combat';
import { BOSS_PROFILES, BossPhaseController, type CampaignBossId } from './sim/ai/boss-phases';
import { CompanionController } from './sim/ai/companion-orders';
import { EliteDirector } from './sim/ai/elite-director';
import { WORLD_SHRINE_KINDS, WorldEventsDirector } from './sim/ai/shrines-events';
import { DIFFICULTY_TIERS, SkirmishModeController } from './sim/ai/skirmish-modes';
import { ScriptRuntime } from './sim/script';
import { Sim } from './sim/sim';
import { applyDynamicSessionRespawn } from './sim/respawn';
import { placeCampaignGoldPiles } from './sim/loot';
import ashentier from './missions/ashen-tier.map.json';
import blackwater from './missions/blackwater-reach.map.json';
import blood from './missions/blood-at-the-ford.map.json';
import crossroads from './missions/crossroads-of-ash.map.json';
import fen from './missions/whispers-in-the-fen.map.json';
import glade from './missions/bracken-glade.map.json';
import inward from './missions/inward-march.map.json';
import market from './missions/thornwick-market.map.json';
import muddlefen from './missions/muddlefen.map.json';
import opening from './missions/kids-paradise-opening.map.json';
import ravenwatch from './missions/nightfall-at-ravenwatch.map.json';
import sanctum from './missions/the-sunken-sanctum.map.json';
import scarlet from './missions/scarlet-ridge.map.json';
import shallowford from './missions/shallow-ford.map.json';
import shattered from './missions/shattered-shore.map.json';
import tidebreak from './missions/tidebreak-cove.map.json';
import twinfuries from './missions/twin-furies.map.json';
import m05 from './missions/m05-lantern-passage.map.json';
import m06 from './missions/m06-greywood-supply.map.json';
import m07 from './missions/m07-split-vanguard.map.json';
import m08 from './missions/m08-alder-bridge.map.json';
import m09 from './missions/m09-ironhide-hunt.map.json';
import m10 from './missions/m10-undervault-links.map.json';
import m11 from './missions/m11-ashbrook-retreat.map.json';
import m12 from './missions/m12-redmarsh-border.map.json';
import m13 from './missions/m13-twin-passes.map.json';
import m14 from './missions/m14-scattered-scouts.map.json';
import m15 from './missions/m15-outpost-palisade.map.json';
import m16 from './missions/m16-wardstone-rupture.map.json';
import m17 from './missions/m17-mire-convoy.map.json';
import m18 from './missions/m18-granary-raid.map.json';
import m19 from './missions/m19-hexer-capture.map.json';
import m20 from './missions/m20-deep-quarry.map.json';
import m21 from './missions/m21-lean-garrison.map.json';
import m22 from './missions/m22-fleeing-column.map.json';
import m23 from './missions/m23-fork-of-spears.map.json';
import m24 from './missions/m24-pledge-at-oakhaven.map.json';
import m25 from './missions/m25-cinder-wards.map.json';
import m26 from './missions/m26-sundered-ranks.map.json';
import m27 from './missions/m27-field-infirmary.map.json';
import m28 from './missions/m28-sunken-citadel.map.json';
import m29 from './missions/m29-hourglass-rescue.map.json';
import m30 from './missions/m30-starved-bastion.map.json';
import m31 from './missions/m31-riverlock-crossing.map.json';
import m32 from './missions/m32-elder-juggernaut.map.json';
import m33 from './missions/m33-high-stakes-gambit.map.json';
import m34 from './missions/m34-clashing-banners.map.json';
import m35 from './missions/m35-burning-harbor.map.json';
import m36 from './missions/m36-heartland-march.map.json';
import m37 from './missions/m37-shattered-beacons.map.json';
import m38 from './missions/m38-besieged-wall.map.json';
import m39 from './missions/m39-flight-of-malrik.map.json';
import m40 from './missions/m40-twofold-assault.map.json';
import m41 from './missions/m41-gauntlet-of-iron.map.json';
import m42 from './missions/m42-outer-rampart.map.json';
import m43 from './missions/m43-three-roads-siege.map.json';
import m44 from './missions/m44-threshold-choice.map.json';
import m45 from './missions/m45-crown-of-order.map.json';
import m46 from './missions/m46-ember-reckoning.map.json';
import ossuary from './missions/weeping-ossuary.map.json';
import gullet from './missions/gullet-of-dunes.map.json';
import drowned from './missions/drowned-choir.map.json';
import cinder from './missions/cinder-throne.map.json';
import map1_border_fords from './missions/map1-border-fords.map.json';
import map2_redmarsh_wastes from './missions/map2-redmarsh-wastes.map.json';
import map3_iron_coast from './missions/map3-iron-coast.map.json';
import map4_obsidian_caldera from './missions/map4-obsidian-caldera.map.json';

import sk_skirmish_twin_fords from './missions/skirmish-twin-fords.map.json';
import sk_skirmish_ash_hourglass from './missions/skirmish-ash-hourglass.map.json';
import sk_skirmish_sunken_causeway from './missions/skirmish-sunken-causeway.map.json';
import sk_skirmish_fen_attrition from './missions/skirmish-fen-attrition.map.json';
import sk_skirmish_quarry_passes from './missions/skirmish-quarry-passes.map.json';
import sk_skirmish_lantern_labyrinth from './missions/skirmish-lantern-labyrinth.map.json';
import sk_skirmish_night_bastion from './missions/skirmish-night-bastion.map.json';
import sk_skirmish_four_corners from './missions/skirmish-four-corners.map.json';
import sk_skirmish_wardstone_ring from './missions/skirmish-wardstone-ring.map.json';
import sk_skirmish_riverlock_cross from './missions/skirmish-riverlock-cross.map.json';
import sk_skirmish_citadel_crown from './missions/skirmish-citadel-crown.map.json';
import sk_skirmish_grand_estuary from './missions/skirmish-grand-estuary.map.json';

/** Missions that ship with the game, by the name used in `?mission=`. */
export const BUILT_IN: Record<string, unknown> = {
  ford: blood,
  market,
  fen,
  ravenwatch,
  sanctum,
  glade,
  scarlet,
  tidebreak,
  blackwater,
  crossroads,
  shattered,
  twinfuries,
  inward,
  muddlefen,
  shallowford,
  ashentier,
  m05, m06, m07, m08, m09, m10, m11,
  m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23,
  m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35,
  m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46,
  'weeping-ossuary': ossuary,
  'gullet-of-dunes': gullet,
  'drowned-choir': drowned,
  'cinder-throne': cinder,
  'map1-border-fords': map1_border_fords,
  'map2-redmarsh-wastes': map2_redmarsh_wastes,
  'map3-iron-coast': map3_iron_coast,
  'map4-obsidian-caldera': map4_obsidian_caldera,
  'skirmish-twin-fords': sk_skirmish_twin_fords,
  'skirmish-ash-hourglass': sk_skirmish_ash_hourglass,
  'skirmish-sunken-causeway': sk_skirmish_sunken_causeway,
  'skirmish-fen-attrition': sk_skirmish_fen_attrition,
  'skirmish-quarry-passes': sk_skirmish_quarry_passes,
  'skirmish-lantern-labyrinth': sk_skirmish_lantern_labyrinth,
  'skirmish-night-bastion': sk_skirmish_night_bastion,
  'skirmish-four-corners': sk_skirmish_four_corners,
  'skirmish-wardstone-ring': sk_skirmish_wardstone_ring,
  'skirmish-riverlock-cross': sk_skirmish_riverlock_cross,
  'skirmish-citadel-crown': sk_skirmish_citadel_crown,
  'skirmish-grand-estuary': sk_skirmish_grand_estuary,
  ossuary,
  gullet,
  drowned,
  cinder,
};

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
  // Spawn interactive clickable gold piles alongside chests and monster camps
  placeCampaignGoldPiles(sim, doc, sim.rng);

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

/** The mission a page asked for: a built-in name, or `test` for the map the editor stored. Throws a readable error. */
export function missionFromName(name: string): LoadedMission {
  if (name === 'test') {
    const raw = localStorage.getItem(TEST_KEY);
    if (!raw) throw new Error('No test map found. Open the editor and press Test play.');
    return loadDoc(JSON.parse(raw));
  }
  const doc = name === 'kids-paradise-opening' ? opening : BUILT_IN[name];
  if (!doc) throw new Error(`Unknown mission "${name}".`);
  return loadDoc(doc);
}
