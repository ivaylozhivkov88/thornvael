import { loadDoc, type LoadedMission } from './mapdoc';
import { MonsterAi, placeScenario } from './sim/bot';
import { ScriptRuntime } from './sim/script';
import { Sim } from './sim/sim';
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
};

export const TEST_KEY = 'thornvael.testmap';

export interface MissionGame {
  loaded: LoadedMission;
  sim: Sim;
  ai: MonsterAi;
}

/** Build the sim for a loaded mission: units placed, script attached, monsters on watch. */
export function createMission(loaded: LoadedMission, seed = 1): MissionGame {
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
  return { loaded, sim, ai: new MonsterAi(structuredClone(scenario.packs)) };
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
