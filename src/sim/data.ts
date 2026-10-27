import { ATTR_NAMES, CLS_BOTH, CLS_MAGE, CLS_WARRIOR, Ik, PART_NAMES, SLOT_NAMES, setItems, type ItemDef } from './items';
import { MAX_SPELLS, SPELLS, St, Tk, setSpells, type SpellDef } from './spelldata';

/**
 * Game data tables (items.json, spells.json) turned into the typed arrays the sim reads.
 * Names in the files are words ("fire", "torso"), so the files stay readable and editable by hand.
 * Throws with the entry name on any unknown word, so a broken file fails loudly at start.
 */

type Raw = Record<string, unknown>;
export interface DataFiles {
  items: unknown;
  spells: unknown;
}

const SCHOOLS = ['fire', 'water', 'air', 'earth', 'astral'];
const TARGETS = Object.keys(Tk).map((k) => k.toLowerCase());
const STATUSES = Object.keys(St).map((k) => k.toLowerCase());
const KINDS = Object.keys(Ik).map((k) => k.toLowerCase());
const SLOTS = SLOT_NAMES.map((s) => s.toLowerCase());
const ATTRS = ATTR_NAMES.map((s) => s.toLowerCase());
const CLASSES: Record<string, number> = { warrior: CLS_WARRIOR, mage: CLS_MAGE, both: CLS_BOTH };

function listOf(file: unknown, key: string): Raw[] {
  const f = file as Raw | null;
  if (!f || f.version !== 1 || !Array.isArray(f[key])) throw new Error(`${key}.json: expected { version: 1, ${key}: [...] }`);
  return f[key] as Raw[];
}

function word(e: Raw, key: string, words: readonly string[], fallback?: number): number {
  const v = e[key];
  if (v === undefined && fallback !== undefined) return fallback;
  const n = words.indexOf(String(v));
  if (n < 0) throw new Error(`${String(e.name)}: unknown ${key} "${String(v)}"`);
  return n;
}

const num = (e: Raw, key: string, fallback = 0): number => {
  const v = e[key] ?? fallback;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${String(e.name)}: ${key} must be a number`);
  return v;
};

function tuple<N extends number>(e: Raw, key: string, n: N): number[] {
  const v = e[key];
  if (v === undefined) return Array<number>(n).fill(0);
  if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== 'number')) throw new Error(`${String(e.name)}: ${key} must be ${n} numbers`);
  return v as number[];
}

export function parseSpells(file: unknown): SpellDef[] {
  const out = listOf(file, 'spells').map((e) => ({
    name: String(e.name),
    school: word(e, 'school', SCHOOLS) + 1,
    tk: word(e, 'target', TARGETS),
    cost: num(e, 'cost'),
    cd: Math.min(255, num(e, 'cd')),
    reach: num(e, 'reach'),
    min: num(e, 'min'),
    max: num(e, 'max'),
    radius: num(e, 'radius'),
    count: num(e, 'count', 1),
    heal: e.heal === true,
    st: e.status === undefined ? -1 : word(e, 'status', STATUSES),
    dur: num(e, 'dur'),
    val: num(e, 'val'),
  }));
  if (out.length > MAX_SPELLS) throw new Error(`spells.json: at most ${MAX_SPELLS} spells`);
  return out;
}

/** Needs the spells installed first: scrolls and tomes name the spell they teach. */
export function parseItems(file: unknown): ItemDef[] {
  return listOf(file, 'items').map((e) => {
    const kind = word(e, 'kind', KINDS);
    const cover = e.cover === undefined ? [] : (e.cover as unknown[]);
    if (!Array.isArray(cover)) throw new Error(`${String(e.name)}: cover must be a list of body parts`);
    let mask = 0;
    for (const p of cover) {
      const k = PART_NAMES.indexOf(String(p) as (typeof PART_NAMES)[number]);
      if (k < 0) throw new Error(`${String(e.name)}: unknown body part "${String(p)}"`);
      mask |= 1 << k;
    }
    const spell = e.spell === undefined ? -1 : SPELLS.findIndex((s) => s.name === e.spell);
    if (e.spell !== undefined && spell < 0) throw new Error(`${String(e.name)}: no spell named "${String(e.spell)}"`);
    const cls = e.cls === undefined ? CLS_BOTH : CLASSES[String(e.cls)];
    if (cls === undefined) throw new Error(`${String(e.name)}: unknown cls "${String(e.cls)}"`);
    const tier = num(e, 'tier', 1);
    if (tier < 1 || tier > 5) throw new Error(`${String(e.name)}: tier must be 1..5`);
    return {
      name: String(e.name),
      kind,
      slot: kind === Ik.Gear ? word(e, 'slot', SLOTS) : -1,
      tier,
      w: num(e, 'w'),
      cls,
      need: word(e, 'need', ATTRS, 0),
      needv: num(e, 'needv'),
      min: num(e, 'min'),
      max: num(e, 'max'),
      acc: num(e, 'acc'),
      cover: mask,
      def: num(e, 'def'),
      abs: num(e, 'abs'),
      res: tuple(e, 'res', 5) as unknown as ItemDef['res'],
      attr: tuple(e, 'attr', 4) as unknown as ItemDef['attr'],
      hp: num(e, 'hp'),
      mana: num(e, 'mana'),
      pow: num(e, 'pow'),
      heal: num(e, 'heal'),
      restore: num(e, 'restore'),
      grow: e.grow === undefined ? 0 : word(e, 'grow', ATTRS) + 1,
      spell,
    };
  });
}

/** Install both tables. Call once before any Sim is built (main.ts, editor.ts, tests/setup.ts). */
export function installData(files: DataFiles): void {
  setSpells(parseSpells(files.spells));
  setItems(parseItems(files.items));
}
