import { beforeEach, describe, expect, it, vi } from 'vitest';
import campaign from '../public/data/campaign.json';
import { completeNode, parseCampaign } from '../src/campaign';
import { afterMission, afterTown, newRecord, RECORD_KEY, type CampaignRecord } from '../src/flow';
import { loadDoc, type MapDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { campaignForSave, decodeSave, encodeSave, makeSave, resumeSave, SAVE_VERSION } from '../src/save';
import { decodeBundle, encodeBundle } from '../src/savebundle';
import { AUTO, exportAllSaves, getRecord, getSave, importSaveText, putRecord, putSave, restoreSaveCampaign } from '../src/savedb';
import { createHero, startState } from '../src/sim/hero';

const camp = parseCampaign(campaign);
const town = 'town-thornwick';
const fen = 'm02-whispers-in-the-fen';
const result = { text: 'Won', up: 1, size: 1, gold: 90 };

// Small transactional IndexedDB double: structured clones and commits only on completion.
// Exercises the real savedb import/export/restore functions without adding a runtime dependency.
let disk = new Map<IDBValidKey, unknown>();
let failWrite = false;
const db = {
  transaction: (_store: string, mode = 'readonly') => {
    const pending = new Map(disk);
    const ops: (() => void)[] = [];
    const tx = { error: null as Error | null, oncomplete: () => {}, onerror: () => {}, onabort: () => {}, objectStore: () => store };
    const request = (fn: () => unknown) => {
      const req = { result: undefined as unknown };
      ops.push(() => { req.result = structuredClone(fn()); });
      return req;
    };
    const store = {
      get: (key: IDBValidKey) => request(() => pending.get(key)),
      getAllKeys: () => request(() => [...pending.keys()].sort()),
      getAll: () => request(() => [...pending.keys()].sort().map((key) => pending.get(key))),
      put: (value: unknown, key: IDBValidKey) => request(() => { pending.set(key, structuredClone(value)); return key; }),
      add: (value: unknown, key: IDBValidKey) => request(() => {
        if (pending.has(key)) throw new Error('Duplicate key');
        pending.set(key, structuredClone(value));
        return key;
      }),
    };
    queueMicrotask(() => {
      try {
        for (const op of ops) op();
        if (mode === 'readwrite') {
          if (failWrite) throw new Error('Storage full');
          disk = pending;
        }
        tx.oncomplete();
      } catch (e) {
        tx.error = e as Error;
        tx.onabort();
      }
    });
    return tx;
  },
};
vi.stubGlobal('indexedDB', {
  open: () => {
    const req = { result: db, onsuccess: () => {} };
    queueMicrotask(() => req.onsuccess());
    return req;
  },
});

function progressed(): CampaignRecord {
  const rec = newRecord(camp, { cls: 1, female: true }, 2);
  rec.progress = completeNode(camp, rec.progress, camp.start);
  rec.progress.townVisits = 3;
  rec.carry = { hero: startState(0, 1, true, 2), gold: 90, mercs: [{ kind: 2, hpPct: 60 }], shopSeed: 43, progress: structuredClone(rec.progress), slots: [1, -1, 2] };
  return rec;
}

function slot(rec?: CampaignRecord, node = fen) {
  const g = createMission(loadDoc(BUILT_IN.fen), 7);
  createHero(g.sim, 0, 1, true, 2);
  g.sim.step(g.ai.commands(g.sim));
  return makeSave('A', 'Saved A', {
    doc: BUILT_IN.fen as MapDoc, seed: 7, snap: g.sim.snapshot(), ai: g.ai.snapshot(),
    ui: { cam: [12, 34, 1], groups: [], slots: [], selected: [0] }, node,
    ...(rec ? { campaign: rec } : {}),
  }, 123);
}

beforeEach(() => {
  disk = new Map();
  failWrite = false;
});

describe('campaign save identity', () => {
  it('save A → New Game B → load A restores A, then safely wins a node locked in B', async () => {
    const a = progressed();
    const saved = slot(a);
    await putRecord(RECORD_KEY, a);
    await putSave('A', saved);
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putRecord(RECORD_KEY, b);
    const loaded = await getSave('A');
    const restored = await restoreSaveCampaign(loaded!, camp);
    expect(restored).toEqual(a);
    expect(restored).not.toBe(a);
    expect(await getRecord(RECORD_KEY)).toEqual(a);
    expect(resumeSave(loaded!).sim.hash()).toBe(resumeSave(saved).sim.hash());
    const won = afterMission(camp, restored!, fen, true, restored!.carry, result);
    await putRecord(RECORD_KEY, won);
    expect(won.progress.completed).toEqual([camp.start, fen]);
    expect(won.progress.unlocked).toContain('m03-nightfall-at-ravenwatch');
    expect(b.progress).toMatchObject({ difficulty: 0, completed: [], unlocked: [camp.start] });
  });

  it('town saves restore the original visit count and carryover instead of New Game B', async () => {
    const a = progressed();
    const s = slot(a, town);
    await putRecord(RECORD_KEY, newRecord(camp, { cls: 0, female: false }, 0));
    const restored = await restoreSaveCampaign(decodeSave(encodeSave(s)), camp);
    const left = afterTown(camp, restored!, town, restored!.carry);
    expect(left.progress.townVisits).toBe(4);
    expect(left.carry?.gold).toBe(90);
    expect(left.hero).toEqual(a.hero);
  });

  it('loading a standalone save cannot activate the device campaign', async () => {
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putRecord(RECORD_KEY, b);
    const s = slot();
    delete s.state.node;
    expect(await restoreSaveCampaign(s, camp)).toBeNull();
    expect(await getRecord(RECORD_KEY)).toEqual(b);
  });

  it('capture and file restore detach all nested campaign data', () => {
    const a = progressed();
    const s = slot(a);
    a.progress.unlocked.length = 0;
    a.carry!.hero.inv.length = 0;
    a.carry!.gold = 0;
    const restored = campaignForSave(decodeSave(encodeSave(s)), camp)!;
    expect(restored.progress.unlocked).toContain(fen);
    expect(restored.carry?.gold).toBe(90);
    expect(restored.carry?.hero.inv.length).toBeGreaterThan(0);
    restored.progress.completed.push(fen);
    expect(s.state.campaign?.progress.completed).toEqual([camp.start]);
  });

  for (const version of [1, 2, 3]) {
    it(`legacy v${version} saves still resume but node/carry cannot bind them to campaign B`, async () => {
      const b = newRecord(camp, { cls: 0, female: false }, 0);
      await putRecord(RECORD_KEY, b);
      const s = slot();
      s.saveVersion = version;
      s.state.carry = progressed().carry!;
      if (version === 1) { delete s.state.snap.team; delete s.state.snap.town; }
      const legacy = decodeSave(encodeSave(s));
      expect(legacy.saveVersion).toBe(SAVE_VERSION);
      expect(legacy.state.campaign).toBeUndefined();
      expect(await restoreSaveCampaign(legacy, camp)).toBeNull();
      expect(await getRecord(RECORD_KEY)).toEqual(b);
      expect(() => resumeSave(legacy)).not.toThrow();
    });
  }

  it('refuses a malformed, future-version or locked-node snapshot without touching storage', async () => {
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putRecord(RECORD_KEY, b);
    const s = slot(progressed());
    s.state.campaign!.v = 2 as never;
    expect(() => decodeSave(encodeSave(s))).toThrow(/campaign snapshot/);
    s.state.campaign = progressed();
    s.state.campaign.progress.completed = null as never;
    expect(() => decodeSave(encodeSave(s))).toThrow(/campaign snapshot/);
    s.state.campaign = b;
    await expect(restoreSaveCampaign(s, camp)).rejects.toThrow(/match its campaign/);
    expect(await getRecord(RECORD_KEY)).toEqual(b);
  });
});

describe('complete portable backups', () => {
  it('exports slots and standalone map progress, then restores both on a fresh device', async () => {
    const a = progressed();
    const s = slot(a);
    await putSave(AUTO, s);
    await putSave('manual', s);
    // Standalone progress is newer than the mid-mission slots and must survive independently.
    const mapRecord = afterTown(camp, a, town, a.carry);
    await putRecord(RECORD_KEY, mapRecord);
    const text = (await exportAllSaves())!;
    expect(JSON.parse(text).thornvaelBundle).toBe(2);
    expect(decodeBundle(text)?.campaign).toEqual(mapRecord);
    disk.clear();
    await importSaveText(text);
    expect(await getRecord(RECORD_KEY)).toEqual(mapRecord);
    const ids = [...disk.keys()].filter((key) => key !== RECORD_KEY);
    expect(ids).toHaveLength(2);
    expect(disk.has(AUTO)).toBe(false);
    const imported = await getSave(String(ids[0]));
    expect(resumeSave(imported!).sim.hash()).toBe(resumeSave(s).sim.hash());
    expect((await restoreSaveCampaign(imported!, camp))?.progress.townVisits).toBe(3);
  });

  it('campaign-only backup on fresh storage restores unlocks, hero, carryover and town visits', async () => {
    const a = progressed();
    await putRecord(RECORD_KEY, a);
    const text = (await exportAllSaves())!;
    expect(decodeBundle(text)?.saves).toEqual([]);
    disk.clear();
    await importSaveText(text);
    expect(disk.size).toBe(1);
    expect(await getRecord(RECORD_KEY)).toEqual(a);
  });

  it('a backup can hold campaign B independently of an older slot A', async () => {
    const a = progressed();
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putSave('A', slot(a));
    await putRecord(RECORD_KEY, b);
    const text = (await exportAllSaves())!;
    disk.clear();
    await importSaveText(text);
    expect(await getRecord(RECORD_KEY)).toEqual(b);
    const id = [...disk.keys()].find((key) => key !== RECORD_KEY)!;
    expect(await restoreSaveCampaign((await getSave(String(id)))!, camp)).toEqual(a);
    expect(await getRecord(RECORD_KEY)).toEqual(a);
  });

  it('v1 bundles and single legacy saves import without replacing an unrelated campaign or autosave', async () => {
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    const old = slot();
    old.saveVersion = 3;
    await putRecord(RECORD_KEY, b);
    await putSave(AUTO, slot(b, camp.start));
    const autoBefore = await getSave(AUTO);
    await importSaveText(JSON.stringify({ thornvaelBundle: 1, saves: [
      { id: AUTO, text: encodeSave(old) }, { id: RECORD_KEY, text: encodeSave(old) },
    ] }));
    await importSaveText(encodeSave(old));
    expect(disk.size).toBe(5);
    expect(await getRecord(RECORD_KEY)).toEqual(b);
    expect(await getSave(AUTO)).toEqual(autoBefore);
  });

  it('validates every entry and campaign before writing anything', async () => {
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putRecord(RECORD_KEY, b);
    const entries = [{ id: 'A', text: encodeSave(slot(progressed())) }, { id: 'bad', text: 'broken' }];
    await expect(importSaveText(JSON.stringify({ thornvaelBundle: 2, saves: entries, campaign: progressed() }))).rejects.toThrow();
    await expect(importSaveText(JSON.stringify({ thornvaelBundle: 2, saves: entries.slice(0, 1), campaign: { v: 99 } }))).rejects.toThrow();
    expect(disk.size).toBe(1);
    expect(await getRecord(RECORD_KEY)).toEqual(b);
  });

  it('storage failure rolls back both imported slots and campaign', async () => {
    const b = newRecord(camp, { cls: 0, female: false }, 0);
    await putRecord(RECORD_KEY, b);
    failWrite = true;
    await expect(importSaveText(encodeBundle([{ id: 'A', file: slot(progressed()) }], progressed()))).rejects.toThrow('Storage full');
    expect(disk.size).toBe(1);
    expect(await getRecord(RECORD_KEY)).toEqual(b);
  });

  it('empty storage has nothing to export; broken records cannot silently disappear from a backup', async () => {
    expect(await exportAllSaves()).toBeNull();
    await putRecord(RECORD_KEY, { v: 99 });
    await expect(exportAllSaves()).rejects.toThrow(/campaign snapshot/);
  });

  it('rejects unsupported and damaged bundle envelopes explicitly', () => {
    expect(decodeBundle(encodeSave(slot()))).toBeNull();
    expect(() => decodeBundle('{"thornvaelBundle":99,"saves":[]}')).toThrow(/unsupported/);
    expect(() => decodeBundle('{"thornvaelBundle":2,"saves":[]}')).toThrow(/campaign snapshot/);
    expect(() => decodeBundle('{"thornvaelBundle":1}')).toThrow(/damaged/);
  });
});
