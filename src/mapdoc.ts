import { bakeBlocked, bakeLight, type GameMap, type MapObject, ObjectKind, Terrain } from './map';
import type { Scenario } from './sim/bot';
import { DEFS, Kind } from './sim/combat';
import { ITEMS } from './sim/items';
import { SPELLS } from './sim/spelldata';
import { actionDef, checkDef, type MissionDef, type Param, type Ref, type Trigger } from './sim/script';

/**
 * The map file. One JSON document holds terrain, objects, units, regions, the mission script and
 * the mission text, so a mission is a single diffable file. Terrain and height are run-length
 * encoded as [value, count, value, count, ...] in reading order.
 *
 * Versions: 1 stored raw arrays, called the text `strings` and the once-flag `runOnce`.
 * 2 (current) uses run-length arrays, `text` and `once`. Older files are migrated on load.
 */
export const MAP_FORMAT = 'thornvael-map';
export const MAP_VERSION = 2;
export const MIN_SIDE = 16;
export const MAX_SIDE = 128;

export interface UnitDef {
  kind: number;
  team: number;
  x: number;
  y: number;
  group?: number; // script group id (1 and up)
  pack?: number; // monster pack id: pack members guard their post together
  dormant?: boolean; // starts phased out
  vip?: boolean;
}
export interface Region {
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface MapDoc {
  format: typeof MAP_FORMAT;
  version: number;
  name: string;
  w: number;
  h: number;
  terrain: number[];
  height: number[];
  objects: (MapObject & { owner?: number; hp?: number })[];
  units: UnitDef[];
  regions: Region[];
  players: string[];
  triggers: Trigger[];
  /** Briefing and message text, by key: title, body, obj.N, msg.N, msg.N.who, win, fail.N. */
  text: Record<string, string>;
  /** Starting day offset in ticks; 0 is morning. */
  day?: number;
}

export function rleEncode(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

export function rleDecode(r: readonly number[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < r.length && k < n; i += 2) {
    const end = Math.min(n, k + r[i + 1]);
    out.fill(r[i], k, end);
    k = end;
  }
  return out;
}

/** Bring any known older document up to the current version. Throws on junk. */
export function migrate(raw: unknown): MapDoc {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a map file.');
  const d = raw as Record<string, unknown>;
  if (d.format !== MAP_FORMAT) throw new Error('Not a map file.');
  let v = Number(d.version);
  if (!Number.isInteger(v) || v < 1) throw new Error('Unknown map version.');
  if (v > MAP_VERSION) throw new Error(`This map needs a newer game (map version ${v}).`);
  const doc = structuredClone(d) as Record<string, unknown>;
  if (v === 1) {
    doc.terrain = rleEncode(doc.terrain as number[]);
    doc.height = rleEncode(doc.height as number[]);
    doc.text = doc.strings ?? {};
    delete doc.strings;
    doc.triggers = ((doc.triggers as Record<string, unknown>[]) ?? []).map((t) => {
      const { runOnce, ...rest } = t;
      return { ...rest, once: runOnce ?? rest.once ?? false };
    });
    v = 2;
  }
  doc.version = v;
  return doc as unknown as MapDoc;
}

const isInt = (v: unknown): v is number => Number.isInteger(v);

function paramError(p: Param, v: unknown, doc: MapDoc, groups: Set<number>): string | null {
  if (!isInt(v)) return `${p.name}: not a whole number`;
  switch (p.kind) {
    case 'x':
      return v < 0 || v >= doc.w ? `${p.name}: outside the map` : null;
    case 'y':
      return v < 0 || v >= doc.h ? `${p.name}: outside the map` : null;
    case 'player':
      return v < 0 || v > 3 ? `${p.name}: player 0 to 3` : null;
    case 'unit':
      return v < 0 || v >= doc.units.length ? `${p.name}: no such unit` : null;
    case 'group':
      return groups.has(v) ? null : `${p.name}: no unit is in group ${v}`;
    case 'item':
      return v < 0 || v >= ITEMS.length ? `${p.name}: no such item` : null;
    case 'spell':
      return v < 0 || v >= SPELLS.length ? `${p.name}: no such spell` : null;
    case 'building':
      return v < 0 || v >= doc.objects.filter((o) => o.kind === ObjectKind.House).length ? `${p.name}: no such building` : null;
    case 'enum':
      return v < 0 || v >= (p.options?.length ?? 0) ? `${p.name}: not an option` : null;
    default:
      return null;
  }
}

/** Every problem found in a map, as readable lines. An empty list means the map can be played. */
export function validate(doc: MapDoc): string[] {
  const errs: string[] = [];
  if (!isInt(doc.w) || !isInt(doc.h) || doc.w < MIN_SIDE || doc.h < MIN_SIDE || doc.w > MAX_SIDE || doc.h > MAX_SIDE) return [`Size must be ${MIN_SIDE} to ${MAX_SIDE} tiles per side.`];
  const n = doc.w * doc.h;
  const terrain = rleDecode(doc.terrain, n);
  const blocked = bakeBlocked(doc.w, doc.h, terrain, doc.objects);
  if (doc.terrain.reduce((s, v, i) => s + (i % 2 ? v : 0), 0) !== n) errs.push('Terrain does not cover the whole map.');
  if (doc.height.reduce((s, v, i) => s + (i % 2 ? v : 0), 0) !== n) errs.push('Height does not cover the whole map.');
  if (doc.units.length < 1 || doc.units.length > 300) errs.push('A map holds 1 to 300 units.');
  const taken = new Set<number>();
  const groups = new Set<number>();
  doc.units.forEach((u, i) => {
    if (!isInt(u.kind) || u.kind < 0 || u.kind >= DEFS.length) errs.push(`Unit ${i}: unknown kind.`);
    else if (!isInt(u.team) || u.team < 0 || u.team > 3) errs.push(`Unit ${i}: team must be 0 to 3.`);
    else if (!isInt(u.x) || !isInt(u.y) || u.x < 0 || u.y < 0 || u.x >= doc.w || u.y >= doc.h) errs.push(`Unit ${i}: outside the map.`);
    else if (blocked[u.y * doc.w + u.x]) errs.push(`Unit ${i}: stands on blocked ground.`);
    else if (taken.has(u.y * doc.w + u.x)) errs.push(`Unit ${i}: shares a tile with another unit.`);
    else taken.add(u.y * doc.w + u.x);
    if (u.group) groups.add(u.group);
  });
  const hero = doc.units[0];
  if (hero && (hero.kind !== Kind.Hero || hero.team !== 0)) errs.push('Unit 0 must be your hero (kind Hero, team 0).');
  doc.triggers.forEach((t, i) => {
    const where = `Trigger ${t.id || i}`;
    if (t.conds.length > 3) errs.push(`${where}: at most 3 conditions.`);
    if (t.acts.length > 4) errs.push(`${where}: at most 4 actions.`);
    const refs: [Ref, boolean][] = [...t.conds.flatMap((c): [Ref, boolean][] => [[c.a, true], [c.b, true]]), ...t.acts.map((a): [Ref, boolean] => [a, false])];
    for (const [r, isCheck] of refs) {
      const def = isCheck ? checkDef(r.k) : actionDef(r.k);
      if (!def) {
        errs.push(`${where}: unknown ${isCheck ? 'check' : 'action'} "${r.k}".`);
        continue;
      }
      if (r.a.length !== def.params.length) errs.push(`${where}: ${def.label} needs ${def.params.length} values.`);
      else def.params.forEach((p, k) => {
        const e = paramError(p, r.a[k], doc, groups);
        if (e) errs.push(`${where}: ${def.label}, ${e}.`);
      });
    }
    for (const c of t.conds) if (!isInt(c.op) || c.op < 0 || c.op > 5) errs.push(`${where}: bad comparison.`);
  });
  return errs;
}

export interface LoadedMission {
  doc: MapDoc;
  map: GameMap;
  scenario: Scenario;
  def: MissionDef;
}

/** Turn a valid document into what the game runs on. */
export function loadDoc(raw: unknown): LoadedMission {
  const doc = migrate(raw);
  const errs = validate(doc);
  if (errs.length) throw new Error(errs.slice(0, 6).join('\n'));
  const n = doc.w * doc.h;
  const terrain = rleDecode(doc.terrain, n);
  const height = rleDecode(doc.height, n);
  const objects: MapObject[] = doc.objects.map((o) => ({ kind: o.kind, x: o.x, y: o.y }));
  const map: GameMap = { w: doc.w, h: doc.h, terrain, height, blocked: bakeBlocked(doc.w, doc.h, terrain, objects), objects, light: bakeLight(doc.w, doc.h, height) };
  const scenario: Scenario = { teams: [], kinds: [], tiles: [], packs: [] };
  const packs = new Map<number, number[]>();
  const groups: Record<number, number[]> = {};
  const def: MissionDef = { triggers: doc.triggers, groups, vip: [], home: [], dormant: [], buildings: [] };
  doc.units.forEach((u, i) => {
    scenario.teams.push(u.team);
    scenario.kinds.push(u.kind);
    scenario.tiles.push([u.x, u.y]);
    def.home.push([u.x, u.y]);
    if (u.group) (groups[u.group] ??= []).push(i);
    if (u.pack) packs.set(u.pack, [...(packs.get(u.pack) ?? []), i]);
    if (u.dormant) def.dormant.push(i);
    if (u.vip) def.vip.push(i);
  });
  for (const ids of packs.values()) {
    const [x, y] = scenario.tiles[ids[0]];
    scenario.packs.push({ ids, x: x + 0.5, y: y + 0.5, hunting: false, calm: 0 });
  }
  for (const o of doc.objects) if (o.kind === ObjectKind.House) def.buildings.push({ x: o.x, y: o.y, owner: o.owner ?? 1, hp: o.hp ?? 100 });
  return { doc, map, scenario, def };
}

/** A blank, playable map: grass with a hero in the south-west corner. */
export function blankDoc(w = 48, h = 36, name = 'New map'): MapDoc {
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name,
    w,
    h,
    terrain: rleEncode(new Uint8Array(w * h).fill(Terrain.Grass)),
    height: rleEncode(new Uint8Array(w * h).fill(1)),
    objects: [],
    units: [{ kind: Kind.Hero, team: 0, x: 3, y: h - 4 }],
    regions: [],
    players: ['You', 'Monsters', 'Neutral', 'Allies'],
    triggers: [],
    text: { title: name, body: 'Describe the mission here.', win: 'Victory!', 'fail.1': 'Your hero has fallen.' },
  };
}
