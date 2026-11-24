import { Rectangle, Texture } from 'pixi.js';
import { DEFAULT_ATLAS_CONCURRENCY, DEFAULT_LOAD_TIMEOUT_MS, fetchWithTimeout, runWithPool } from './load-pool';

export interface AtlasFrameRect {
  frame: { x: number; y: number; w: number; h: number };
  anchor?: { x: number; y: number };
}

export interface PackedAtlasJson {
  frames: Record<string, AtlasFrameRect>;
  meta: {
    image: string;
    size?: { w: number; h: number };
  };
}

export interface PackedAtlas {
  readonly baseTexture: Texture;
  readonly textures: Record<string, Texture>;
  readonly anchors: Record<string, { x: number; y: number }>;
}

export interface ExtraAtlases {
  propsWave2: PackedAtlas | null;
  spellicons: PackedAtlas | null;
  projectiles: PackedAtlas | null;
  townnpcs: PackedAtlas | null;
  envAnims: PackedAtlas | null;
  bossTelegraphs: PackedAtlas | null;
  cityBuildings: PackedAtlas | null;
}

export async function loadPackedAtlas(
  jsonRelPath: string,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
): Promise<PackedAtlas | null> {
  if (typeof fetch !== 'function' || typeof Image === 'undefined') return null;
  const cleanRel = jsonRelPath.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL ?? './';
  const jsonUrl = `${base}${cleanRel}`;
  const dir = cleanRel.includes('/') ? `${cleanRel.slice(0, cleanRel.lastIndexOf('/') + 1)}` : '';
  try {
    const res = await fetchWithTimeout(jsonUrl, timeoutMs);
    if (!res.ok) return null;
    const sheet = (await res.json()) as PackedAtlasJson;
    if (!sheet?.frames || !sheet?.meta?.image) return null;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      let settled = false;
      const done = (val: HTMLImageElement | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = timeoutMs > 0 && Number.isFinite(timeoutMs)
        ? setTimeout(() => done(null), timeoutMs)
        : undefined;
      el.onload = () => done(el);
      el.onerror = () => done(null);
      el.src = `${base}${dir}${sheet.meta.image}`;
    });
    if (!img) return null;
    const baseTexture = Texture.from(img);
    baseTexture.source.scaleMode = 'nearest';
    const textures: Record<string, Texture> = {};
    const anchors: Record<string, { x: number; y: number }> = {};
    for (const [key, entry] of Object.entries(sheet.frames)) {
      const f = entry.frame;
      if (!f || f.w <= 0 || f.h <= 0) continue;
      textures[key] = new Texture({
        source: baseTexture.source,
        frame: new Rectangle(f.x, f.y, f.w, f.h),
      });
      if (entry.anchor) {
        anchors[key] = { x: entry.anchor.x, y: entry.anchor.y };
      }
    }
    return { baseTexture, textures, anchors };
  } catch {
    return null;
  }
}

export async function loadAllExtraAtlases(
  concurrency = DEFAULT_ATLAS_CONCURRENCY,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
): Promise<ExtraAtlases> {
  const paths = [
    'props-wave2/props-wave2.json',
    'spellicons/spellicons.json',
    'projectiles/projectiles.json',
    'townnpcs/townnpcs.json',
    'art-wave3/env-anims.json',
    'art-wave3/boss-telegraphs.json',
    'art-wave3/city-buildings.json',
  ] as const;
  const settled = await runWithPool(
    paths.map((p) => () => loadPackedAtlas(p, timeoutMs)),
    concurrency,
  );
  const pick = (idx: number): PackedAtlas | null => {
    const r = settled[idx];
    return r && r.status === 'fulfilled' ? r.value : null;
  };
  return {
    propsWave2: pick(0),
    spellicons: pick(1),
    projectiles: pick(2),
    townnpcs: pick(3),
    envAnims: pick(4),
    bossTelegraphs: pick(5),
    cityBuildings: pick(6),
  };
}
