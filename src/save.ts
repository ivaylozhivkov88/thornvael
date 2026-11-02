import type { CarryoverState } from './carryover';
import type { Campaign, CampaignProgress } from './campaign';
import { parseRecord, type CampaignRecord } from './flow';
import { loadDoc, type MapDoc } from './mapdoc';
import { createMission, type MissionGame } from './mission';
import type { Snapshot } from './sim/sim';

/**
 * Save files. A save holds the whole map document, the seed, the sim snapshot, the monster AI state
 * and a little UI state, so it resumes exactly on any device and does not depend on the map files
 * the game ships with. The same envelope goes into IndexedDB (typed arrays as they are) and into an
 * exported file (JSON, typed arrays as base64). See docs/SAVE-FORMAT.md.
 *
 * Versions: 1 lacked teams/towns, 2 added both, 3 added carryover, 4 adds campaign snapshots.
 */
export const SAVE_FORMAT = 'thornvael-save';
export const SAVE_VERSION = 4;
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
  carry?: CarryoverState; // legacy carryover; alone it cannot identify a campaign
  campaign?: CampaignRecord; // versioned (v: 1), independent snapshot of the campaign at capture time
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
  return { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, gameVersion: GAME_VERSION, createdAt: now, name, label, state: { ...state, ...(state.campaign ? { campaign: campaignSnapshot(state.campaign) } : {}) } };
}

const strings = (a: unknown): a is string[] => Array.isArray(a) && a.every((x) => typeof x === 'string' && x.length > 0);
const integers = (a: unknown): a is number[] => Array.isArray(a) && a.every(Number.isSafeInteger);
const uint = (n: unknown): boolean => Number.isSafeInteger(n) && (n as number) >= 0;
function validProgress(p: CampaignProgress | undefined): boolean {
  return !!p && uint(p.difficulty) && p.difficulty <= 2 && strings(p.unlocked) && strings(p.completed)
    && typeof p.node === 'string' && p.unlocked.includes(p.node) && p.completed.every((id) => p.unlocked.includes(id)) && uint(p.townVisits);
}

/** Validate at the file/storage boundary and detach every nested field from the live record. */
export function campaignSnapshot(raw: unknown): CampaignRecord {
  const r = parseRecord(raw);
  const bad = (): never => { throw new Error('This campaign snapshot is damaged or from an unsupported version.'); };
  if (!r || !validProgress(r.progress) || ![0, 1].includes(r.hero.cls) || typeof r.hero.female !== 'boolean') return bad();
  if (r.last !== null && (!r.last || typeof r.last.node !== 'string' || !r.progress.unlocked.includes(r.last.node)
    || typeof r.last.win !== 'boolean' || typeof r.last.text !== 'string' || ![r.last.up, r.last.size, r.last.gold].every(uint))) return bad();
  if (r.carry !== null) {
    const co = r.carry;
    const h = co?.hero;
    if (!co || !h || !validProgress(co.progress) || !uint(co.gold) || !uint(co.shopSeed)
      || !Array.isArray(co.mercs) || !co.mercs.every((m) => m && uint(m.kind) && uint(m.hpPct) && m.hpPct >= 1 && m.hpPct <= 100)
      || !uint(h.id) || ![0, 1].includes(h.cls) || typeof h.female !== 'boolean' || ![0, 1, 2].includes(h.diff)
      || !integers(h.attr) || h.attr.length !== 4 || !integers(h.skill) || h.skill.length !== 3
      || !integers(h.use) || h.use.length !== 3 || !integers(h.eq) || h.eq.length !== 8 || !uint(h.known)
      || !Array.isArray(h.inv) || !h.inv.every((s) => s && uint(s.item) && uint(s.n) && s.n > 0)
      || (h.hits !== undefined && (!integers(h.hits) || h.hits.length !== 4))
      || (co.slots !== undefined && !integers(co.slots)) || (co.upkeep !== undefined && !uint(co.upkeep))) return bad();
  }
  return structuredClone(r);
}

/** A legacy node/carryover is not proof of identity. Never consult the device's current record. */
export function campaignForSave(save: SaveFile, campaign: Campaign): CampaignRecord | null {
  if (!save.state.campaign) return null;
  const rec = campaignSnapshot(save.state.campaign);
  const ids = new Set(campaign.nodes.map((n) => n.id));
  const p = rec.progress;
  if (!save.state.node || !p.unlocked.includes(save.state.node) || [...p.unlocked, ...p.completed, p.node].some((id) => !ids.has(id))) {
    throw new Error('This save does not match its campaign.');
  }
  return rec;
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
  if (s.saveVersion < 4) {
    // Old formats never captured a campaign. Do not manufacture one from node/carry/current storage.
    delete s.state.campaign;
    s.saveVersion = 4;
  }
  if (s.state.campaign !== undefined) {
    s.state.campaign = campaignSnapshot(s.state.campaign);
    if (!s.state.node || !s.state.campaign.progress.unlocked.includes(s.state.node)) throw new Error('This save does not match its campaign.');
  }
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
