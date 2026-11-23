#!/usr/bin/env node
/**
 * Scans mission and skirmish maps for playable regions (>10 tiles from any Water/Rock)
 * that have no object or unit within 10 tiles.
 */
import fs from 'node:fs';
import path from 'node:path';

function rleDecode(r, n) {
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < r.length && k < n; i += 2) {
    const end = Math.min(n, k + r[i + 1]);
    out.fill(r[i], k, end);
    k = end;
  }
  return out;
}

export function auditEmptyAreas(dirs = ['src/missions', 'public/maps/skirmish']) {
  const findings = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.map.json')).sort()) {
      const full = path.join(dir, f);
      const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (doc.w > 256 || doc.h > 256) continue; // skip macro stitched worlds
      const terrain = rleDecode(doc.terrain, doc.w * doc.h);
      const pts = [
        ...(doc.objects || []).map((o) => [o.x, o.y]),
        ...(doc.units || []).map((u) => [u.x, u.y]),
      ];
      let emptyCells = 0;
      for (let y = 10; y < doc.h - 10; y += 10) {
        for (let x = 10; x < doc.w - 10; x += 10) {
          const t = terrain[y * doc.w + x];
          if (t === 2 || t === 3) continue; // Water or Rock
          const near = pts.some(([px, py]) => Math.hypot(px - x, py - y) <= 10);
          if (!near) emptyCells++;
        }
      }
      if (emptyCells > 0) findings.push({ file: `${dir}/${f}`, emptyCells });
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('empty-areas.mjs')) {
  const hits = auditEmptyAreas();
  console.log(`Empty-areas audit: ${hits.length} maps with sparse 10-tile cells`);
  for (const h of hits.slice(0, 20)) console.log(`  ${h.file}: ${h.emptyCells} empty cells`);
}
