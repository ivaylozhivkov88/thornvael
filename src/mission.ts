import { loadDoc, type LoadedMission } from './mapdoc';
import {
  BUILT_IN_NAMES,
  SKIRMISH_MAP_NAMES,
  TEST_KEY,
  createMission,
  loadMissionByName,
  type MissionDirectors,
  type MissionGame,
} from './mission-runtime';
export {
  BUILT_IN_NAMES,
  SKIRMISH_MAP_NAMES,
  TEST_KEY,
  createMission,
  loadMissionByName,
  type MissionDirectors,
  type MissionGame,
};
import ashentier from './missions/ashen-tier.map.json';
import blackwater from './missions/blackwater-reach.map.json';
import blood from './missions/blood-at-the-ford.map.json';
import crossroads from './missions/crossroads-of-ash.map.json';
import fen from './missions/whispers-in-the-fen.map.json';
import glade from './missions/bracken-glade.map.json';
import inward from './missions/inward-march.map.json';
import market from './missions/thornwick-market.map.json';
import redmarshOutpost from './missions/redmarsh-outpost.map.json';
import oakhavenBastion from './missions/oakhaven-bastion.map.json';
import highcrestCitadel from './missions/highcrest-citadel.map.json';
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
import m12_128 from './missions/m12-redmarsh-border-128.map.json';
import m13_128 from './missions/m13-twin-passes-128.map.json';
import m14_128 from './missions/m14-scattered-scouts-128.map.json';
import m15_128 from './missions/m15-outpost-palisade-128.map.json';
import m16_128 from './missions/m16-wardstone-rupture-128.map.json';
import m17_128 from './missions/m17-mire-convoy-128.map.json';
import m18_128 from './missions/m18-granary-raid-128.map.json';
import m19_128 from './missions/m19-hexer-capture-128.map.json';
import m20_128 from './missions/m20-deep-quarry-128.map.json';
import m21_128 from './missions/m21-lean-garrison-128.map.json';
import m22_128 from './missions/m22-fleeing-column-128.map.json';
import m23_128 from './missions/m23-fork-of-spears-128.map.json';
import m24_192 from './missions/m24-pledge-at-oakhaven-192.map.json';
import m25_192 from './missions/m25-cinder-wards-192.map.json';
import m26_192 from './missions/m26-sundered-ranks-192.map.json';
import m27_192 from './missions/m27-field-infirmary-192.map.json';
import m28_192 from './missions/m28-sunken-citadel-192.map.json';
import m29_192 from './missions/m29-hourglass-rescue-192.map.json';
import m30_192 from './missions/m30-starved-bastion-192.map.json';
import m31_192 from './missions/m31-riverlock-crossing-192.map.json';
import m32_192 from './missions/m32-elder-juggernaut-192.map.json';
import m33_192 from './missions/m33-high-stakes-gambit-192.map.json';
import m34_192 from './missions/m34-clashing-banners-192.map.json';
import m35_192 from './missions/m35-burning-harbor-192.map.json';
import m36_256 from './missions/m36-heartland-march-256.map.json';
import m37_256 from './missions/m37-shattered-beacons-256.map.json';
import m38_256 from './missions/m38-besieged-wall-256.map.json';
import m39_256 from './missions/m39-flight-of-malrik-256.map.json';
import m40_256 from './missions/m40-twofold-assault-256.map.json';
import m41_256 from './missions/m41-gauntlet-of-iron-256.map.json';
import m42_256 from './missions/m42-outer-rampart-256.map.json';
import m43_256 from './missions/m43-three-roads-siege-256.map.json';
import m44_256 from './missions/m44-threshold-choice-256.map.json';
import m45_256 from './missions/m45-crown-of-order-256.map.json';
import m46_256 from './missions/m46-ember-reckoning-256.map.json';
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
  'redmarsh-outpost': redmarshOutpost,
  'oakhaven-bastion': oakhavenBastion,
  'highcrest-citadel': highcrestCitadel,
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
  'm12-128': m12_128,
  'm13-128': m13_128,
  'm14-128': m14_128,
  'm15-128': m15_128,
  'm16-128': m16_128,
  'm17-128': m17_128,
  'm18-128': m18_128,
  'm19-128': m19_128,
  'm20-128': m20_128,
  'm21-128': m21_128,
  'm22-128': m22_128,
  'm23-128': m23_128,
  m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35,
  'm24-192': m24_192,
  'm25-192': m25_192,
  'm26-192': m26_192,
  'm27-192': m27_192,
  'm28-192': m28_192,
  'm29-192': m29_192,
  'm30-192': m30_192,
  'm31-192': m31_192,
  'm32-192': m32_192,
  'm33-192': m33_192,
  'm34-192': m34_192,
  'm35-192': m35_192,
  m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46,
  'm36-256': m36_256,
  'm37-256': m37_256,
  'm38-256': m38_256,
  'm39-256': m39_256,
  'm40-256': m40_256,
  'm41-256': m41_256,
  'm42-256': m42_256,
  'm43-256': m43_256,
  'm44-256': m44_256,
  'm45-256': m45_256,
  'm46-256': m46_256,
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
