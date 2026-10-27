import { loadDoc, type LoadedMission } from './mapdoc';
import { MonsterAi, placeScenario } from './sim/bot';
import { ScriptRuntime } from './sim/script';
import { Sim } from './sim/sim';
import blood from './missions/blood-at-the-ford.map.json';
import market from './missions/thornwick-market.map.json';

/** Missions that ship with the game, by the name used in `?mission=`. */
export const BUILT_IN: Record<string, unknown> = { ford: blood, market };

export const TEST_KEY = 'thornvael.testmap';

export interface MissionGame {
  loaded: LoadedMission;
  sim: Sim;
  ai: MonsterAi;
}

/** Build the sim for a loaded mission: units placed, script attached, monsters on watch. */
export function createMission(loaded: LoadedMission, seed = 1): MissionGame {
  const { scenario, map, def, doc } = loaded;
  const sim = new Sim(map, seed, scenario.teams, { combat: true, kinds: scenario.kinds, dayOffset: doc.day ?? 0 });
  placeScenario(sim, scenario);
  sim.settle();
  sim.attachTowns(doc.towns ?? []);
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
  const doc = BUILT_IN[name];
  if (!doc) throw new Error(`Unknown mission "${name}".`);
  return loadDoc(doc);
}
