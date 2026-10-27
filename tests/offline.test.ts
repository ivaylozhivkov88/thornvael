import { describe, expect, it } from 'vitest';
import { downloadChapter, parseManifest, removeChapter, verifyChapter, type Env } from '../src/offline';
import { decodeBundle, encodeBundle } from '../src/savebundle';
import manifestJson from '../public/chapter1-manifest.json';
import { readFileSync } from 'node:fs';

function fakeEnv(files: Record<string, number>, opts: { shortOn?: string; failOn?: string } = {}) {
  const store = new Map<string, Response>();
  const cache = {
    match: async (u: string) => store.get(u)?.clone(),
    put: async (u: string, r: Response) => void store.set(u, r),
    delete: async (u: string) => store.delete(u),
  };
  const env: Env = {
    caches: { open: async () => cache as unknown as Cache },
    base: '/t/',
    fetchFn: async (u) => {
      const p = u.replace('/t/', '');
      if (p === opts.failOn) throw new Error('offline');
      const n = p in files ? files[p] : -1;
      if (n < 0) return new Response('', { status: 404 });
      return new Response(new Uint8Array(p === opts.shortOn ? n - 1 : n));
    },
  };
  return { env, store };
}
const man = parseManifest({ id: 'x', cache: 'c', files: [{ path: 'a.json', size: 10 }, { path: 'b.m4a', size: 20 }] });

describe('chapter download', () => {
  it('downloads, reports progress and verifies', async () => {
    const { env } = fakeEnv({ 'a.json': 10, 'b.m4a': 20 });
    const seen: number[] = [];
    const r = await downloadChapter(env, man, (d) => seen.push(d));
    expect(r.ok).toBe(true);
    expect(seen.at(-1)).toBe(30);
    expect((await verifyChapter(env, man)).missing).toEqual([]);
  });
  it('never stores a short file and reports it missing', async () => {
    const { env, store } = fakeEnv({ 'a.json': 10, 'b.m4a': 20 }, { shortOn: 'b.m4a' });
    const r = await downloadChapter(env, man, () => {});
    expect(r).toMatchObject({ ok: false, have: 1, missing: ['b.m4a'] });
    expect(store.has('/t/b.m4a')).toBe(false);
  });
  it('survives a network error and resumes only what is missing', async () => {
    const bad = fakeEnv({ 'a.json': 10, 'b.m4a': 20 }, { failOn: 'a.json' });
    expect((await downloadChapter(bad.env, man, () => {})).missing).toEqual(['a.json']);
    const good = fakeEnv({ 'a.json': 10, 'b.m4a': 20 });
    await downloadChapter(good.env, man, () => {});
    let fetched = 0;
    const counting: Env = { ...good.env, fetchFn: async (u, i) => (fetched++, good.env.fetchFn(u, i)) };
    expect((await downloadChapter(counting, man, () => {})).ok).toBe(true);
    expect(fetched).toBe(0);
  });
  it('removes the chapter', async () => {
    const { env } = fakeEnv({ 'a.json': 10, 'b.m4a': 20 });
    await downloadChapter(env, man, () => {});
    await removeChapter(env, man);
    expect((await verifyChapter(env, man)).have).toBe(0);
  });
  it('rejects a malformed manifest', () => {
    expect(() => parseManifest({ cache: 'c', files: [{ path: '../x', size: 1 }] })).toThrow();
  });
  it('the generated manifest lists real files with real sizes', () => {
    const m = parseManifest(manifestJson);
    expect(m.cache).toBe('thornvael-ch1-v1');
    expect(m.files.some((f) => f.path === 'data/items.json')).toBe(true);
    for (const f of m.files) expect(readFileSync(new URL(`../public/${f.path}`, import.meta.url)).length).toBe(f.size);
  });
});

describe('save bundle', () => {
  it('returns null for a plain save and throws on a damaged bundle', () => {
    expect(decodeBundle('{"v":1}')).toBeNull();
    expect(decodeBundle('not json')).toBeNull();
    expect(() => decodeBundle('{"thornvaelBundle":1,"saves":[{"id":"a","text":"x"}]}')).toThrow();
    expect(encodeBundle([])).toContain('thornvaelBundle');
  });
});
