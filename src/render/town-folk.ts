/** Town people drawn with our own unit sprites (standing, facing the viewer), dressed by role. */
import { Container } from 'pixi.js';
import { UnitSprite, type UnitAtlas } from '../sprites/units';

export type TownRole = 'smith' | 'innkeeper' | 'mage' | 'priest' | 'guard' | 'villager';

interface TownLook {
  art: string;
  /** Tints of the cloth, metal and accent layers. */
  tints: readonly [number, number, number];
  scale: number;
}

export const TOWN_LOOKS: Record<TownRole, TownLook> = {
  smith: { art: 'hero', tints: [0x7a4a28, 0x6b6f75, 0xd9772b], scale: 1.3 },
  innkeeper: { art: 'archer', tints: [0x8c2f2f, 0xa8885c, 0xe0b45a], scale: 1.2 },
  mage: { art: 'mage', tints: [0x4338ca, 0x9aa4c8, 0x67e8f9], scale: 1.25 },
  priest: { art: 'mage', tints: [0xe5dcc0, 0xd8d2bc, 0xf2c14e], scale: 1.25 },
  guard: { art: 'warrior', tints: [0x1e40af, 0xa9afb9, 0xf59e0b], scale: 1.3 },
  villager: { art: 'archer', tints: [0x5f6b3c, 0x8a7458, 0xb89a6a], scale: 1.12 },
};

/** Cloth, metal and accent colours so that neighbouring villagers do not look like copies. */
const VILLAGER_VARIANTS: ReadonlyArray<{ tints: readonly [number, number, number]; scale: number }> = [
  { tints: [0x5f6b3c, 0x8a7458, 0xb89a6a], scale: 1.12 },
  { tints: [0x8a4b32, 0x6e6258, 0xd7c08a], scale: 1.18 },
  { tints: [0x3f5a78, 0x9a8f80, 0xc9a27a], scale: 1.05 },
  { tints: [0x6d4a6e, 0x7d6a52, 0xa9b87a], scale: 1.15 },
  { tints: [0xa88a5a, 0x55483c, 0x7a9a9a], scale: 1.0 },
];

/** Sim direction shown as sheet direction 00 (towards the viewer). */
const FACING_VIEWER = 4;

export class TownFolkPool {
  readonly container = new Container();
  private pool: UnitSprite[] = [];
  private used = 0;

  constructor() {
    this.container.eventMode = 'none';
  }

  beginFrame(): void {
    this.used = 0;
  }

  /** False when the atlas is not loaded, so the caller can draw something else. */
  draw(role: string, x: number, y: number, tick: number, atlasOf: (art: string) => UnitAtlas | undefined, variant = 0): boolean {
    const base = TOWN_LOOKS[role as TownRole] ?? TOWN_LOOKS.villager;
    const look = base === TOWN_LOOKS.villager ? { ...base, ...VILLAGER_VARIANTS[variant % VILLAGER_VARIANTS.length]! } : base;
    const atlas = atlasOf(look.art);
    if (!atlas) return false;
    let s = this.pool[this.used];
    if (!s || s.atlas !== atlas) {
      s?.destroy({ children: true });
      s = new UnitSprite(atlas);
      this.pool[this.used] = s;
      this.container.addChildAt(s, Math.min(this.used, this.container.children.length));
    }
    this.used++;
    s.update(tick, false, FACING_VIEWER, 0, 0, 1, false);
    look.tints.forEach((tint, i) => {
      s.layers[i + 1]!.tint = tint;
    });
    s.position.set(x, y);
    s.scale.set(look.scale);
    s.visible = true;
    return true;
  }

  endFrame(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
