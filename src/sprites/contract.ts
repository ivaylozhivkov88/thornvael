// Sprite contract v1 (docs/SPRITE-CONTRACT.md): pure checks for a packed unit atlas.

export const CONTRACT_VERSION = 1;
export const DIRECTIONS = 16;
export const ANIMS: Record<string, number> = { stand: 4, walk: 8 };
export const OPTIONAL_ANIMS = ['attack', 'cast', 'hurt', 'die'];
export const MAX_ATLAS = 2048;

export interface SheetFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  anchor?: { x: number; y: number };
}

export interface UnitSheet {
  frames: Record<string, SheetFrame>;
  animations?: Record<string, string[]>;
  meta: {
    image: string;
    size: { w: number; h: number };
    thornvael?: {
      contract: number;
      unit: string;
      directions: number;
      cell: [number, number];
      anims: Record<string, number>;
      mask: string;
    };
  };
}

export const frameName = (unit: string, anim: string, dir: number, n: number): string =>
  `${unit}/${anim}/${String(dir).padStart(2, '0')}/${String(n).padStart(2, '0')}`;

const overlap = (a: SheetFrame['frame'], b: SheetFrame['frame']): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Returns a list of problems; an empty list means the sheet conforms. */
export function checkSheet(input: unknown): string[] {
  const errs: string[] = [];
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(input) || !record(input.meta)) return ['meta.thornvael is missing'];
  const sheet = input as unknown as UnitSheet;
  const t = sheet.meta?.thornvael;
  if (!t) return ['meta.thornvael is missing'];
  if (!record(t) || !Array.isArray(t.cell) || t.cell.length !== 2 || !record(t.anims) || !record(sheet.meta.size) || !record(sheet.frames))
    return ['invalid atlas metadata shape'];
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  const basename = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]*\.png$/.test(v);
  if (typeof t.unit !== 'string' || !/^[a-z][a-z0-9-]*$/.test(t.unit)) errs.push('invalid unit id');
  if (!basename(sheet.meta.image) || !basename(t.mask) || sheet.meta.image === t.mask) errs.push('image and mask must be distinct local PNG basenames');
  if (!t.cell.every(positive) || !positive(sheet.meta.size.w) || !positive(sheet.meta.size.h)) return [...errs, 'invalid atlas dimensions'];
  if (Object.values(t.anims).some((n) => !positive(n) || n > 64)) return [...errs, 'invalid animation frame count'];
  if (t.contract !== CONTRACT_VERSION) errs.push(`contract version ${t.contract}, expected ${CONTRACT_VERSION}`);
  if (t.directions !== DIRECTIONS) errs.push(`directions ${t.directions}, expected ${DIRECTIONS}`);
  const [cw, ch] = t.cell;
  if (cw % 8 || ch % 8 || cw <= 0 || ch <= 0) errs.push(`cell ${cw}x${ch} is not a multiple of 8`);
  const { w, h } = sheet.meta.size;
  if (w > MAX_ATLAS || h > MAX_ATLAS) errs.push(`atlas ${w}x${h} exceeds ${MAX_ATLAS}`);
  if (!t.mask) errs.push('mask file name is missing');
  for (const a of Object.keys(ANIMS)) if (!(a in t.anims)) errs.push(`animation ${a} is required`);
  for (const [a, n] of Object.entries(t.anims)) {
    if (!(a in ANIMS) && !OPTIONAL_ANIMS.includes(a)) errs.push(`animation ${a} is not in the contract`);
    if (a in ANIMS && n !== ANIMS[a]) errs.push(`animation ${a} has ${n} frames, expected ${ANIMS[a]}`);
    for (let d = 0; d < DIRECTIONS; d++) {
      for (let i = 0; i < n; i++) {
        const name = frameName(t.unit, a, d, i);
        const f = sheet.frames[name];
        if (!f) { errs.push(`missing frame ${name}`); continue; }
        const r = f.frame;
        if (!r || !Number.isSafeInteger(r.x) || !Number.isSafeInteger(r.y) || !positive(r.w) || !positive(r.h)) {
          errs.push(`${name} has invalid rectangle`); continue;
        }
        if (f.rotated || f.trimmed) errs.push(`${name} must be unrotated and untrimmed`);
        if (f.sourceSize && (f.sourceSize.w !== cw || f.sourceSize.h !== ch)) errs.push(`${name} sourceSize differs from cell`);
        if (f.anchor && (f.anchor.x !== 0.5 || f.anchor.y !== 0.85)) errs.push(`${name} has incorrect feet anchor`);
        if (r.w !== cw || r.h !== ch) errs.push(`${name} is ${r.w}x${r.h}, cell is ${cw}x${ch}`);
        if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) errs.push(`${name} lies outside the atlas`);
      }
    }
  }
  const names = Object.keys(sheet.frames);
  const expected = Object.values(t.anims).reduce((s, n) => s + n * DIRECTIONS, 0);
  if (names.length !== expected) errs.push(`${names.length} frames in sheet, contract expects ${expected}`);
  if (sheet.animations) {
    for (const [anim, count] of Object.entries(t.anims)) {
      const list = sheet.animations[anim];
      const want = Array.from({ length: DIRECTIONS * count }, (_, i) => frameName(t.unit, anim, Math.floor(i / count), i % count));
      if (!Array.isArray(list) || list.length !== want.length || list.some((name, i) => name !== want[i])) errs.push(`animation ${anim} has incorrect frame sequence`);
    }
  }
  if (errs.length === 0) {
    const rs = names.map((n) => sheet.frames[n].frame);
    for (let i = 0; i < rs.length && errs.length < 5; i++)
      for (let j = i + 1; j < rs.length; j++) if (overlap(rs[i], rs[j])) { errs.push(`frames ${names[i]} and ${names[j]} overlap`); break; }
  }
  return errs;
}
