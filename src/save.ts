import type { CarryoverState } from './carryover';
import { loadDoc, type MapDoc } from './mapdoc';
import { createMission, type MissionGame } from './mission';
import type { Snapshot } from './sim/sim';

/**
 * Save files. A save holds the whole map document, the seed, the sim snapshot, the monster AI state
 * and a little UI state, so it resumes exactly on any device and does not depend on the map files
 * the game ships with. The same envelope goes into IndexedDB (typed arrays as they are) and into an
 * exported file (JSON, typed arrays as base64). See docs/SAVE-FORMAT.md.
 *
 * Versions: 1 had sim snapshots without `team` and `town` (Phase 7 sims). 2 (current) has both.
 */
export const SAVE_FORMAT = 'thornvael-save';
export const SAVE_VERSION = 3;
export const GAME_VERSION = '0.8.0';

export interface SaveUi {
  cam: [number, number, number]; // camera x, y (screen pixels at that zoom) and zoom
  groups: number[][];
  slots: number[];
  selected: number[];
}
export interface SaveState {
  doc: MapDoc;
  seed: number;
  snap: Snapshot;
  ai: [boolean, number][];
  ui: SaveUi;
  node?: string; // campaign node this save belongs to; Continue and ?load return to that node's flow
  carry?: CarryoverState; // campaign progress and what the hero takes along; absent in skirmish and test saves
}
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  saveVersion: number;
  gameVersion: string;
  createdAt: number;
  name: string;
  label: string; // mission, hero and time, for the slot list
  state: SaveState;
}

export function makeSave(name: string, label: string, state: SaveState, now = Date.now()): SaveFile {
  return { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, gameVersion: GAME_VERSION, createdAt: now, name, label, state };
}

// ---- file encoding ----

const TYPED = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array } as const;
type TypedName = keyof typeof TYPED;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** JSON text of a save. Typed arrays become { $t: name, b: base64 }. */
export function encodeSave(save: SaveFile): string {
  return JSON.stringify(save, (_k, v: unknown) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const name = v.constructor.name as TypedName;
      if (name in TYPED) return { $t: name, b: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    }
    return v;
  });
}

/** Parse an exported save, bring it up to the current version and check it. Throws a readable error. */
export function decodeSave(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text, (_k, v: unknown) => {
      if (v && typeof v === 'object' && '$t' in v && 'b' in v) {
        const { $t, b } = v as { $t: string; b: string };
        const T = TYPED[$t as TypedName];
        if (!T) throw new Error(`unknown array type ${$t}`);
        const bytes = fromB64(b);
        return new T(bytes.buffer as ArrayBuffer, 0, bytes.byteLength / T.BYTES_PER_ELEMENT);
      }
      return v;
    });
  } catch (e) {
    throw new Error(`This file is not a save: ${(e as Error).message}`);
  }
  return migrateSave(raw);
}

/** Bring any known older save up to the current version. Throws on anything else. */
export function migrateSave(raw: unknown): SaveFile {
  const s = raw as SaveFile;
  if (!s || typeof s !== 'object' || s.format !== SAVE_FORMAT) throw new Error('This file is not a save.');
  if (!Number.isInteger(s.saveVersion) || s.saveVersion < 1) throw new Error('This save has no version.');
  if (s.saveVersion > SAVE_VERSION) throw new Error(`This save is from a newer version of the game (${s.gameVersion}). Update the game first.`);
  if (!s.state?.doc || !s.state.snap) throw new Error('This save is damaged.');
  if (s.saveVersion < 2) {
    // Version 1 snapshots carry no teams (taken from the map) and no town state (towns start fresh).
    s.state.snap.team ??= Uint8Array.from(s.state.doc.units.map((u) => u.team));
    s.saveVersion = 2;
  }
  if (s.saveVersion < 3) s.saveVersion = 3; // version 3 only adds the optional `carry` field
  return s;
}

/** Rebuild the game a save was taken from and put it back exactly where it was. */
export function resumeSave(save: SaveFile): MissionGame {
  const st = save.state;
  const g = createMission(loadDoc(st.doc), st.seed);
  if (st.snap.x.length !== g.sim.count) throw new Error('This save does not match its map.');
  g.sim.restore(st.snap);
  g.ai.restore(st.ai);
  return g;
}
