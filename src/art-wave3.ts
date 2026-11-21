/**
 * Art Wave 3 - Environmental Animations & World Decals (Thornvael)
 *
 * Drives environmental animations from `public/art-wave3/env-anims.json`:
 * - Torch flicker (in dungeons, crypts, catacombs, and town building sconces): 6 frames
 * - Bonfire flare (in town squares, garrison camps, and creature banks): 6 frames
 * - Faction banner fluttering (thornwatch, ironbound, conclave): 4 frames
 * - Water wheel turning (watermills and river mechanisms): 6 frames
 * - Bubbling cauldrons (alchemical sanctums, apothecary counters, and witch covens): 6 frames
 * - Smoke columns (forge chimneys, tavern hearths, and campfires): 6 frames
 */

export type FactionBanner = 'thornwatch' | 'ironbound' | 'conclave';

export type EnvAnimType =
  | 'torch-flicker'
  | 'bonfire'
  | 'banner'
  | 'water-wheel'
  | 'cauldron'
  | 'smoke-column';

export interface WorldEnvProp {
  id: string;
  type: EnvAnimType;
  frameKey: string;
  x: number; // world pixel X
  y: number; // world pixel Y
  scaleX: number;
  scaleY: number;
  alpha?: number;
  rotation?: number;
  tint?: number;
  anchorX?: number;
  anchorY?: number;
}

/** Calculate 6-frame loop index for environmental animations. */
export function getEnvFrame6(tick: number, offset = 0, animate = true): number {
  if (!animate) return 0;
  return ((tick >> 2) + offset) % 6;
}

/** Calculate 4-frame loop index for banner flutter and NPC idle animations. */
export function getEnvFrame4(tick: number, offset = 0, animate = true): number {
  if (!animate) return 0;
  return ((tick >> 2) + offset) % 4;
}

/** Get frame key for torch flicker (0..5). */
export function getTorchFlickerFrame(tick: number, offset = 0, animate = true): string {
  const f = getEnvFrame6(tick, offset, animate);
  return `torch-flicker/${f}`;
}

/** Get frame key for bonfire flare (0..5). */
export function getBonfireFrame(tick: number, offset = 0, animate = true): string {
  const f = getEnvFrame6(tick, offset, animate);
  return `bonfire/${f}`;
}

/** Get frame key for faction banner flutter (0..3). */
export function getBannerFrame(
  faction: FactionBanner,
  tick: number,
  offset = 0,
  animate = true,
): string {
  const f = getEnvFrame4(tick, offset, animate);
  return `banner/${faction}/${f}`;
}

/** Get frame key for water wheel turning (0..5). */
export function getWaterWheelFrame(tick: number, offset = 0, animate = true): string {
  const f = getEnvFrame6(tick, offset, animate);
  return `water-wheel/${f}`;
}

/** Get frame key for bubbling cauldron (0..5). */
export function getCauldronFrame(tick: number, offset = 0, animate = true): string {
  const f = getEnvFrame6(tick, offset, animate);
  return `cauldron/${f}`;
}

/** Get frame key for chimney/campfire smoke column (0..5). */
export function getSmokeColumnFrame(tick: number, offset = 0, animate = true): string {
  const f = getEnvFrame6(tick, offset, animate);
  return `smoke-column/${f}`;
}

/**
 * Determine if a biome is subterranean / dungeon / crypt requiring wall torches and dark ambience.
 */
export function isDungeonBiome(biomeName: string): boolean {
  const b = biomeName.toLowerCase();
  return (
    b.includes('cave') ||
    b.includes('crypt') ||
    b.includes('dungeon') ||
    b.includes('vault') ||
    b.includes('catacomb') ||
    b.includes('ossuary') ||
    b.includes('undervault') ||
    b.includes('subterranean')
  );
}
