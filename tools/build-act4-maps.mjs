// Reproducible Act IV 256x256 map generator.
// Reads original m36..m46 maps (never overwrites them) and writes m36-*-256.map.json .. m46-*-256.map.json.
// Usage: node tools/build-act4-maps.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaleMissionMap } from './lib/scale-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MISSIONS = path.join(here, '..', 'src', 'missions');
const TARGET = 256;

const ACT4_FILES = [
  'm36-heartland-march',
  'm37-shattered-beacons',
  'm38-besieged-wall',
  'm39-flight-of-malrik',
  'm40-twofold-assault',
  'm41-gauntlet-of-iron',
  'm42-outer-rampart',
  'm43-three-roads-siege',
  'm44-threshold-choice',
  'm45-crown-of-order',
  'm46-ember-reckoning',
];

const summary = ACT4_FILES.map((name) => scaleMissionMap(MISSIONS, name, TARGET));
console.log(`Generated ${summary.length} Act IV ${TARGET}x${TARGET} maps:`);
for (const s of summary) {
  console.log(`  ${s.file}: ${s.w}x${s.h}, units=${s.units}, objects=${s.objects}, triggers=${s.triggers}`);
}
