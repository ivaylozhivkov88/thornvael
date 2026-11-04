import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture, TextureSource } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from '../src/sprites/contract';
import { UnitAtlas, UnitSprite } from '../src/sprites/units';
import type { AnimationPose } from '../src/sprites/combat-animation';
import { CombatAnimation } from '../src/sprites/combat-animation';
import { Renderer } from '../src/render';
import { Sim } from '../src/sim/sim';
import { Kind } from '../src/sim/combat';

function atlas(complete: boolean): UnitAtlas {
  const counts: Record<string, number> = complete ? { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 } : { stand: 4, walk: 8 };
  const sheet: UnitSheet = { frames: {}, meta: { image: 'hero.png', size: { w: 1024, h: 1024 },
    thornvael: { contract: 1, unit: 'hero', directions: 16, cell: [48, 48], anims: counts, mask: 'hero-mask.png' } } };
  let k = 0;
  for (const [clip, n] of Object.entries(counts)) for (let d = 0; d < 16; d++) for (let f = 0; f < n; f++, k++)
    sheet.frames[frameName('hero', clip, d, f)] = { frame: { x: k % 21 * 48, y: Math.floor(k / 21) * 48, w: 48, h: 48 } };
  expect(checkSheet(sheet)).toEqual([]);
  // In-memory metadata/texture fixture, not shipped artwork or a GPU render test.
  const texture = new Texture({ source: new TextureSource({ width: 2048, height: 2048 }) });
  return Reflect.construct(UnitAtlas, ['hero', texture, sheet]) as UnitAtlas;
}
const pose = (clip: AnimationPose['clip'], frame: number, finished = false): AnimationPose =>
  ({ clip, frame, age: frame * 3, finished, unresolved: false });

describe('UnitSprite combat clip dispatch', () => {
  it('draws live hover but removes a stale target ring when a visible death clip takes over', () => {
    const w = 16, h = 16;
    const map = { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h) };
    const sim = new Sim(map, 1, [1], { kinds: [Kind.Golem], combat: true });
    sim.place(0, 4, 4); sim.explored.fill(1); sim.visible.fill(1);
    const a = atlas(true), unit = new UnitSprite(a), rings = new Graphics();
    const hover = vi.spyOn(rings, 'ellipse');
    const world = new Container(), shots = new Graphics(), overlay = new Graphics();
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      map, world, rings, shots, overlay, sprites: [unit], bursts: [], quality: 0, fogTick: 0,
      zoom: 1, camX: 0, camY: 0, app: { render: vi.fn(), screen: { width: 512, height: 512 } },
      animation: new CombatAnimation(sim), pose: pose('stand', 0),
      updateFog: () => undefined, updateLight: () => undefined, runFx: () => undefined,
    }) as Renderer;
    const view = { selected: new Set<number>(), hover: { id: 0, ok: true }, aim: null, box: null, ping: null };
    renderer.draw(sim, sim.x, sim.y, 1, view);
    expect(hover).toHaveBeenCalledTimes(1);
    hover.mockClear(); sim.cb.hp[0] = 0; sim.cb.corp[0] = 100;
    renderer.resetAnimation(sim);
    renderer.draw(sim, sim.x, sim.y, 1, view);
    expect(unit.visible).toBe(true); expect(unit.inspect().requestedClip).toBe('die');
    expect(hover).not.toHaveBeenCalled();
    world.destroy(); rings.destroy(); shots.destroy(); overlay.destroy(); unit.destroy(); a.source.destroy(true);
  });
  it('uses every optional clip and all 16 facings with one shared source and stable logical size', () => {
    const a = atlas(true), s = new UnitSprite(a);
    for (const clip of ['attack', 'cast', 'hurt', 'die'] as const) for (let d = 0; d < 16; d++) {
      s.update(12, false, d, 1, 3, 2, false, pose(clip, 1));
      const info = s.inspect();
      expect(info.frame).toBe(frameName('hero', clip, (d + 12) & 15, 1));
      expect(info).toMatchObject({ requestedClip: clip, resolvedClip: clip, fallback: false, sources: 1, filters: false });
      expect(s.width).toBeCloseTo(64); expect(s.height).toBeCloseTo(64);
      expect(info.source).toBe(a.source.source.uid);
    }
    s.destroy(); a.source.destroy(true);
  });
  it('reports missing clips and resolves locomotion without pretending attack art exists', () => {
    const a = atlas(false), s = new UnitSprite(a);
    s.update(12, false, 0, 0, 1, 1, false, pose('attack', 3));
    expect(s.inspect()).toMatchObject({ requestedClip: 'attack', resolvedClip: 'stand', fallback: true });
    s.update(12, true, 0, 0, 1, 1, false, pose('cast', 2));
    expect(s.inspect().frame).toContain('/walk/12/04');
    expect(s.inspect()).toMatchObject({ requestedClip: 'cast', resolvedClip: 'walk', fallback: true });
    s.destroy(); a.source.destroy(true);
  });
  it('clamps an overshooting death frame and preserves final-frame and palette diagnostics', () => {
    const a = atlas(true), s = new UnitSprite(a);
    s.update(200, false, 4, 0, 0, 1, false, pose('die', 99, true));
    expect(s.inspect().frame).toBe('hero/die/00/03');
    expect(s.inspect().finished).toBe(true);
    const source = s.inspect().source;
    s.update(200, false, 4, 2, 4, 5, false, pose('die', 99, true));
    expect(s.inspect().frame).toBe('hero/die/00/03');
    expect(s.inspect().source).toBe(source);
    expect(s.inspect().colors[1]).toBe(0x8bd675);
    s.destroy(); a.source.destroy(true);
  });
});
