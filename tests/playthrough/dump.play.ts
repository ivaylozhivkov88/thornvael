import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseCampaign } from '../../src/campaign';
import { loadDoc } from '../../src/mapdoc';
import { BUILT_IN, createMission } from '../../src/mission';

const OUT = new URL('../../../.planning/evidence/act1-playthrough/maps.json', import.meta.url);
it('dump act1 maps', () => {
  const c = parseCampaign(JSON.parse(readFileSync(new URL('../../public/data/campaign.json', import.meta.url), 'utf8')));
  const out: unknown[] = [];
  for (const n of c.nodes.filter((x) => x.act === 1 && x.id !== 'town-redmarsh')) {
    const doc = loadDoc(BUILT_IN[n.map]) as unknown as { regions?: unknown[]; units?: { team: number; x: number; y: number }[] };
    const g = createMission(loadDoc(BUILT_IN[n.map]), 1);
    const m = g.sim.map;
    out.push({ id: n.id, kind: n.kind, pos: n.pos, w: m.w, h: m.h, terrain: Buffer.from(m.terrain).toString('base64'), light: Buffer.from(m.light).toString('base64'), regions: doc.regions ?? [], enemies: (doc.units ?? []).filter((u) => u.team === 1).map((u) => [u.x, u.y]) });
  }
  mkdirSync(new URL('./', OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
});
