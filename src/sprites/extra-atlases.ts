import { Rectangle, Texture } from 'pixi.js';

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

export async function loadPackedAtlas(jsonRelPath: string): Promise<PackedAtlas | null> {
  if (typeof fetch !== 'function' || typeof Image === 'undefined') return null;
  const cleanRel = jsonRelPath.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL ?? './';
  const jsonUrl = `${base}${cleanRel}`;
  const dir = cleanRel.includes('/') ? `${cleanRel.slice(0, cleanRel.lastIndexOf('/') + 1)}` : '';
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) return null;
    const sheet = (await res.json()) as PackedAtlasJson;
    if (!sheet?.frames || !sheet?.meta?.image) return null;
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
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

export async function loadAllExtraAtlases(): Promise<ExtraAtlases> {
  const [
    propsWave2,
    spellicons,
    projectiles,
    townnpcs,
    envAnims,
    bossTelegraphs,
    cityBuildings,
  ] = await Promise.all([
    loadPackedAtlas('props-wave2/props-wave2.json'),
    loadPackedAtlas('spellicons/spellicons.json'),
    loadPackedAtlas('projectiles/projectiles.json'),
    loadPackedAtlas('townnpcs/townnpcs.json'),
    loadPackedAtlas('art-wave3/env-anims.json'),
    loadPackedAtlas('art-wave3/boss-telegraphs.json'),
    loadPackedAtlas('art-wave3/city-buildings.json'),
  ]);
  return {
    propsWave2,
    spellicons,
    projectiles,
    townnpcs,
    envAnims,
    bossTelegraphs,
    cityBuildings,
  };
}
