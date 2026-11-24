// Reproducible Act III 192x192 map generator.
// Reads original m24..m35 maps (never overwrites them) and writes m24-*-192.map.json .. m35-*-192.map.json.
// Usage: node tools/build-act3-maps.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaleMissionMap } from './lib/scale-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MISSIONS = path.join(here, '..', 'src', 'missions');
const TARGET = 192;

const ACT3_FILES = [
  'm24-pledge-at-oakhaven',
  'm25-cinder-wards',
  'm26-sundered-ranks',
  'm27-field-infirmary',
  'm28-sunken-citadel',
  'm29-hourglass-rescue',
  'm30-starved-bastion',
  'm31-riverlock-crossing',
  'm32-elder-juggernaut',
  'm33-high-stakes-gambit',
  'm34-clashing-banners',
  'm35-burning-harbor',
];

const summary = ACT3_FILES.map((name) => scaleMissionMap(MISSIONS, name, TARGET));
console.log(`Generated ${summary.length} Act III ${TARGET}x${TARGET} maps:`);
for (const s of summary) {
  console.log(`  ${s.file}: ${s.w}x${s.h}, units=${s.units}, objects=${s.objects}, triggers=${s.triggers}`);
}
