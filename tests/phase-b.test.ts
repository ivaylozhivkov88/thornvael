import { describe, expect, it } from 'vitest';
import { BUILT_IN, missionFromName } from '../src/mission';
import { BUILT_IN_NAMES, createMission, loadMissionByName } from '../src/mission-runtime';
import { LruVramManager, estimateTextureBytes } from '../src/render/vram-manager';

describe('Phase B1: dynamic mission code-splitting parity', () => {
  it('matches legacy BUILT_IN keys exactly and excludes internal opening slice from BUILT_IN_NAMES', () => {
    const syncKeys = Object.keys(BUILT_IN).sort();
    const asyncKeys = [...BUILT_IN_NAMES].sort();
    expect(asyncKeys).toEqual(syncKeys);
    expect(BUILT_IN_NAMES.has('kids-paradise-opening')).toBe(false);
  });

  it('dynamically loads representative campaign acts, bosses, skirmish maps, and produces identical sim state', async () => {
    const samples = ['ford', 'm14-128', 'm25-192', 'm36-256', 'ossuary', 'skirmish-twin-fords', 'kids-paradise-opening'];
    for (const key of samples) {
      const loadedAsync = await loadMissionByName(key);
      const loadedSync = missionFromName(key);
      expect(loadedAsync.doc.name).toBe(loadedSync.doc.name);
      expect(loadedAsync.map.w).toBe(loadedSync.map.w);
      expect(loadedAsync.map.h).toBe(loadedSync.map.h);

      const gameAsync = createMission(loadedAsync, 42);
      const gameSync = createMission(loadedSync, 42);
      expect(gameAsync.sim.hash()).toBe(gameSync.sim.hash());
    }
  });

  it('rejects unknown mission keys cleanly', async () => {
    await expect(loadMissionByName('nonexistent-mission-xyz')).rejects.toThrow('Unknown mission');
  });
});

describe('Phase B2: PixiJS v8 LruVramManager', () => {
  it('tracks bytes, evicts LRU unpinned entries over budget, and respects touch() promotion', () => {
    const evicted: string[] = [];
    const mgr = new LruVramManager(1000);

    mgr.register({ key: 'a', bytes: 400, onEvict: () => evicted.push('a') });
    mgr.register({ key: 'b', bytes: 400, onEvict: () => evicted.push('b') });
    expect(mgr.stats()).toMatchObject({ usedBytes: 800, evictableBytes: 800, entryCount: 2, evictions: 0 });

    // Promote 'a' to MRU so 'b' becomes LRU
    expect(mgr.touch('a')).toBe(true);
    expect(mgr.touch('missing')).toBe(false);

    // Adding 'c' (400B -> 1200B > 1000B) should evict 'b' only
    const count = mgr.register({ key: 'c', bytes: 400, onEvict: () => evicted.push('c') });
    expect(count).toBe(1);
    expect(evicted).toEqual(['b']);
    expect(mgr.keys()).toEqual(['a', 'c']);
    expect(mgr.stats()).toMatchObject({ usedBytes: 800, evictions: 1 });
  });

  it('never evicts pinned entries or entries locked by canEvict', () => {
    const evicted: string[] = [];
    const locked = new Set(['locked']);
    const canEvict = (key: string): boolean => !locked.has(key);

    const mgr = new LruVramManager(1000);
    mgr.register({ key: 'baseline', bytes: 500, pinned: true, onEvict: () => evicted.push('baseline') }, canEvict);
    mgr.register({ key: 'locked', bytes: 300, onEvict: () => evicted.push('locked') }, canEvict);
    mgr.register({ key: 'idle', bytes: 300, onEvict: () => evicted.push('idle') }, canEvict);

    // Total 1100B > 1000B: baseline is pinned, locked is protected -> idle must be evicted first
    expect(evicted).toEqual(['idle']);
    expect(mgr.has('baseline')).toBe(true);
    expect(mgr.has('locked')).toBe(true);
    expect(mgr.stats()).toMatchObject({ usedBytes: 800, pinnedBytes: 500, evictableBytes: 300 });

    // Unlock and exceed budget again
    locked.delete('locked');
    mgr.register({ key: 'new', bytes: 400, onEvict: () => evicted.push('new') }, canEvict);
    expect(evicted).toEqual(['idle', 'locked']);
    expect(mgr.has('baseline')).toBe(true);
    expect(mgr.has('new')).toBe(true);
  });

  it('enforces budget when unpinning, and supports release/clear/estimateTextureBytes', () => {
    const evicted: string[] = [];
    const locked = new Set(['u2']);
    const canEvict = (key: string): boolean => !locked.has(key);
    const mgr = new LruVramManager(700);
    mgr.register({ key: 'p', bytes: 500, pinned: true, onEvict: () => evicted.push('p') }, canEvict);
    mgr.register({ key: 'u', bytes: 400, onEvict: () => evicted.push('u') }, canEvict);
    // Exceeds 700 while 'p' is pinned -> 'u' is evicted immediately
    expect(evicted).toEqual(['u']);

    // Register 'u2' while locked so it stays pinned by canEvict despite 500+400 > 700
    mgr.register({ key: 'u2', bytes: 400, onEvict: () => evicted.push('u2') }, canEvict);
    expect(mgr.keys()).toEqual(['p', 'u2']);

    // Unpinning 'p' drops pinnedBytes and immediately evicts 'p' to satisfy budget
    const evictedOnUnpin = mgr.setPinned('p', false, canEvict);
    expect(evictedOnUnpin).toBe(1);
    expect(evicted).toEqual(['u', 'p']);
    expect(mgr.keys()).toEqual(['u2']);

    expect(mgr.release('u2', false)).toBe(true);
    expect(mgr.stats().usedBytes).toBe(0);

    mgr.register({ key: 'x', bytes: estimateTextureBytes(256, 256), onEvict: () => evicted.push('x') });
    expect(estimateTextureBytes(256, 256)).toBe(262144);
    mgr.clear(true);
    expect(evicted).toEqual(['u', 'p', 'x']);
    expect(mgr.stats().entryCount).toBe(0);
  });
});
