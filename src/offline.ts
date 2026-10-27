/**
 * Chapter downloads: copies the files listed in chapter1-manifest.json into one named cache so the chapter plays in airplane mode.
 * Verification is by byte length against the manifest, so a cut-off download is never reported as ready.
 * Everything takes `caches` and `fetchFn` as parameters so Vitest can run it without a browser.
 */
export interface ManifestFile {
  path: string;
  size: number;
}
export interface Manifest {
  id: string;
  cache: string;
  total: number;
  files: ManifestFile[];
}
export interface ChapterCheck {
  ok: boolean;
  have: number;
  missing: string[];
}
export interface Env {
  caches: Pick<CacheStorage, 'open'>;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  base: string;
}

export function parseManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest> | null;
  if (!m || typeof m.cache !== 'string' || !Array.isArray(m.files)) throw new Error('bad manifest');
  for (const f of m.files) if (typeof f.path !== 'string' || !Number.isInteger(f.size) || f.size < 0 || f.path.includes('..')) throw new Error('bad manifest entry');
  return { id: String(m.id), cache: m.cache, total: m.files.reduce((a, f) => a + f.size, 0), files: m.files };
}

export async function loadManifest(env: Env): Promise<Manifest> {
  const r = await env.fetchFn(`${env.base}chapter1-manifest.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`manifest ${r.status}`);
  return parseManifest(await r.json());
}

const urlOf = (env: Env, f: ManifestFile): string => `${env.base}${f.path}`;

/** Which manifest files are in the cache with exactly the expected size. */
export async function verifyChapter(env: Env, m: Manifest): Promise<ChapterCheck> {
  const cache = await env.caches.open(m.cache);
  const missing: string[] = [];
  for (const f of m.files) {
    const hit = await cache.match(urlOf(env, f));
    const ok = hit ? (await hit.arrayBuffer()).byteLength === f.size : false;
    if (!ok) missing.push(f.path);
  }
  return { ok: missing.length === 0, have: m.files.length - missing.length, missing };
}

/** Download every missing file; `onProgress` gets bytes done and total. Failed files are returned, not thrown. */
export async function downloadChapter(env: Env, m: Manifest, onProgress: (done: number, total: number) => void): Promise<ChapterCheck> {
  const cache = await env.caches.open(m.cache);
  const before = await verifyChapter(env, m);
  const todo = new Set(before.missing);
  let done = m.files.filter((f) => !todo.has(f.path)).reduce((a, f) => a + f.size, 0);
  onProgress(done, m.total);
  for (const f of m.files) {
    if (!todo.has(f.path)) continue;
    try {
      const r = await env.fetchFn(urlOf(env, f), { cache: 'reload' });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== f.size) continue; // cut off or changed on the server: do not store a bad copy
      await cache.put(urlOf(env, f), new Response(buf, { headers: { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream' } }));
      done += f.size;
      onProgress(done, m.total);
    } catch {
      /* offline or aborted: counted as missing by the final check */
    }
  }
  return verifyChapter(env, m);
}

export async function removeChapter(env: Env, m: Manifest): Promise<void> {
  const cache = await env.caches.open(m.cache);
  for (const f of m.files) await cache.delete(urlOf(env, f));
}
