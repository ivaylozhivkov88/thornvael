/**
 * Seeded foe scattering for zoned world maps (docs/ACT-POLISH-PLAYBOOK.md §5).
 * Moves the ordinary packs of every zone to new places, adds packs up to the target density and
 * makes some of the new packs elite. Pure: the result is a new document, so saves keep it as is.
 */
import { loadDoc, type MapDoc } from './mapdoc';
import { mulberry32 } from './map-generator';
import { D2R_BOSS_MODS, hashString } from './sim/respawn';

type Unit = MapDoc['units'][number];

export const FOES_PER_1000 = 3;
const MAX_UNITS = 750; // the map format allows 768
const ELITE_PACKS: [number, number][] = [[1, 2], [4, 5], [6, 8]]; // per zone, by difficulty
const KEEP_OUT = 10; // tiles kept free around the town and the zone doors

export function scatterFoes(doc: MapDoc, sessionSeed: number, difficulty: number): MapDoc {
  if (!doc.zones?.length) return doc;
  const out = structuredClone(doc);
  const rng = mulberry32((sessionSeed ^ hashString(doc.name)) >>> 0);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const { map } = loadDoc(doc);
  const { w, h } = out;

  // Only tiles the hero can walk to.
  const reach = new Uint8Array(w * h);
  const open = [out.units[0].y * w + out.units[0].x];
  reach[open[0]] = 1;
  for (let i = 0; i < open.length; i++) {
    const t = open[i];
    const x = t % w;
    for (const n of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w]) {
      if (n >= 0 && n < w * h && !reach[n] && !map.blocked[n]) {
        reach[n] = 1;
        open.push(n);
      }
    }
  }

  const keepOut = [
    ...out.zones!.filter((z) => !z.group),
    ...out.zones!.flatMap((z) => (z.doors ?? []).map((d) => ({ x: d.x, y: d.y, w: 1, h: 1 }))),
  ];
  const allowed = (x: number, y: number) =>
    !keepOut.some((r) => x >= r.x - KEEP_OUT && x < r.x + r.w + KEEP_OUT && y >= r.y - KEEP_OUT && y < r.y + r.h + KEEP_OUT);

  const zones = out.zones!.flatMap((z) => {
    if (!z.group) return [];
    const foes = out.units.filter((u) => u.group === z.group && u.team !== 0);
    const tiles: number[] = [];
    let walkable = 0;
    for (let y = z.y; y < Math.min(h, z.y + z.h); y++) {
      for (let x = z.x; x < Math.min(w, z.x + z.w); x++) {
        if (!reach[y * w + x]) continue;
        walkable++;
        if (allowed(x, y)) tiles.push(y * w + x);
      }
    }
    if (!foes.length || !tiles.length) return [];
    return [{ z, foes, tiles, want: Math.max(0, Math.round((walkable * FOES_PER_1000) / 1000) - foes.length) }];
  });

  const total = zones.reduce((s, v) => s + v.want, 0);
  const scale = total ? Math.min(1, Math.max(0, MAX_UNITS - out.units.length) / total) : 0;

  const taken = new Set(out.units.map((u) => u.y * w + u.x));
  /** `size` free tiles close to a random spot of the zone. */
  const spot = (tiles: number[], size: number): [number, number][] | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const c = tiles[int(0, tiles.length - 1)];
      const found: [number, number][] = [];
      for (let r = 0; r <= 3 && found.length < size; r++) {
        for (let dy = -r; dy <= r && found.length < size; dy++) {
          for (let dx = -r; dx <= r && found.length < size; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = (c % w) + dx;
            const y = Math.floor(c / w) + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            if (reach[y * w + x] && !taken.has(y * w + x) && allowed(x, y)) found.push([x, y]);
          }
        }
      }
      if (found.length === size) {
        for (const [x, y] of found) taken.add(y * w + x);
        return found;
      }
    }
    return null;
  };

  let pack = Math.max(0, ...out.units.map((u) => u.pack ?? 0));
  for (const { z, foes, tiles, want } of zones) {
    // Existing ordinary packs move; named units keep their post.
    const packs = new Map<number, Unit[]>();
    for (const u of foes) if (u.pack) packs.set(u.pack, [...(packs.get(u.pack) ?? []), u]);
    for (const members of packs.values()) {
      if (members.some((u) => u.vip || u.bossMods?.length)) continue;
      const at = spot(tiles, members.length);
      if (at) members.forEach((u, i) => ([u.x, u.y] = at[i]));
    }

    const kinds = foes.filter((u) => !u.vip && !u.bossMods?.length);
    if (!kinds.length) continue;
    let left = Math.floor(want * scale);
    const added: Unit[] = [];
    while (left > 0) {
      const size = Math.min(left, int(3, 6));
      const at = spot(tiles, size);
      if (!at) break;
      const base = kinds[int(0, kinds.length - 1)];
      pack++;
      for (const [x, y] of at) {
        const u: Unit = { kind: base.kind, team: base.team, x, y, group: z.group, pack, dormant: true };
        if (base.tier !== undefined) u.tier = base.tier;
        if (base.family) u.family = base.family;
        out.units.push(u);
        added.push(u);
      }
      left -= size;
    }

    const leaders = added.filter((u, i) => i === 0 || added[i - 1].pack !== u.pack);
    const [min, max] = ELITE_PACKS[difficulty] ?? ELITE_PACKS[1];
    for (let n = Math.min(leaders.length, int(min, max)); n > 0; n--) {
      const [leader] = leaders.splice(int(0, leaders.length - 1), 1);
      const first = int(0, D2R_BOSS_MODS.length - 1);
      const second = (first + int(1, D2R_BOSS_MODS.length - 1)) % D2R_BOSS_MODS.length;
      leader.bossMods = [D2R_BOSS_MODS[first], D2R_BOSS_MODS[second]];
    }
  }
  return out;
}
