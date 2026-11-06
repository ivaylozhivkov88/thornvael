/** Presentation only. Sim angles start east; sheet angles start south. */
export const sheetDirection = (dir: number): number => (dir + 12) & 15;
export const TEAM_COLORS = [0x66aaff, 0xf16b59, 0x8bd675, 0xdca2ff] as const;
export const ARMOUR_COLORS = [0x93816c, 0xa9afb9, 0xbd8b55, 0xd6dce8, 0xe4bf69, 0xa3dbd5] as const;
export const LEVEL_COLORS = [0x8fbc83, 0xc1ad74, 0xcd8461, 0x98a8df, 0xd68bc8] as const;
const index = (n: number, max: number): number => Math.min(max, Math.max(0, Math.floor(n) || 0));
export function palette(team: number, armourTier: number, monsterLevel: number): readonly number[] {
  return [0xffffff, TEAM_COLORS[index(team, 3)], ARMOUR_COLORS[index(armourTier, 5)], LEVEL_COLORS[index(monsterLevel - 1, 4)]];
}

/** Simulation ticks, not wall time: pausing and replaying also pause animation. */
export function animationFrame(tick: number, moving: boolean): number {
  return Math.floor(tick / (moving ? 3 : 10)) % (moving ? 8 : 4);
}

/** Split RGB-mask regions once at load time. Each pixel belongs to exactly one
 * layer; all layers retain source alpha and lighting. No palette-specific copies.
 * Dominant-channel selection avoids double alpha at antialiased mask boundaries.
 */
export function splitMask(color: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray[] {
  if (color.length !== mask.length || color.length % 4) throw new Error('Mismatched mask pixels');
  const layers = Array.from({ length: 4 }, () => new Uint8ClampedArray(color.length));
  for (let p = 0; p < color.length; p += 4) {
    if (!color[p + 3]) continue;
    const high = Math.max(mask[p], mask[p + 1], mask[p + 2]);
    const role = mask[p + 3] && high > 32 ? (mask[p] === high ? 1 : mask[p + 1] === high ? 2 : 3) : 0;
    const layer = layers[role];
    if (role === 0) {
      layer[p] = color[p]; layer[p + 1] = color[p + 1]; layer[p + 2] = color[p + 2];
    } else {
      const light = Math.max(color[p], color[p + 1], color[p + 2]);
      layer[p] = layer[p + 1] = layer[p + 2] = light;
    }
    layer[p + 3] = color[p + 3];
  }
  return layers;
}
