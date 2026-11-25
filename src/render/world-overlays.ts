import { type Graphics, type Sprite } from 'pixi.js';
import { type FxEngine } from '../fx';
import { ObjectKind, PropKind, Terrain, TILE, type GameMap } from '../map';
import { type OverheadNameplateLayer } from '../nameplate';
import { getItemDef } from '../sim/items';
import { FP, type Sim } from '../sim/sim';
import { SPELLS, St, Tk } from '../sim/spelldata';
import { itemRarity } from '../sim/town';
import { bossSpriteDef, UnitSprite } from '../sprites/units';
import { type VfxSystem } from '../vfx';

export const ELEM_COLOR = [0xffffff, 0xff9a3a, 0x6ac8ff, 0xd8f0ff, 0xb59a6a, 0xd48aff];
export const BUFF_COLOR = 0x7affa0;

export const LOOT_BEAM_COLORS: Readonly<Record<string, { outer: number; inner: number; height: number }>> = {
  magic: { outer: 0x4a9eff, inner: 0xa8d4ff, height: 28 },
  rare: { outer: 0xe6c840, inner: 0xfff3a8, height: 42 },
  set: { outer: 0x00ff7f, inner: 0xb9f6ca, height: 155 },
  unique: { outer: 0xff9a1f, inner: 0xffe0a0, height: 180 },
};

export type FamilyOrnament =
  | 'spines'
  | 'wisp'
  | 'antlers'
  | 'shell'
  | 'totem'
  | 'scarab'
  | 'serpent'
  | 'treant'
  | 'crown'
  | 'drake'
  | 'storm'
  | 'forge'
  | 'astral'
  | 'bell'
  | 'mummy'
  | 'none';

export interface FamilyVisualDef {
  scaleX: number;
  scaleY: number;
  /** 3-channel color harmony for (team, armour, level) mask layers */
  tints: readonly [number, number, number];
  auraColor: number;
  ornament: FamilyOrnament;
}

export interface Burst {
  x: number;
  y: number;
  born: number;
  r: number;
  ms: number;
  color: number;
  fill: boolean;
  el: number;
}

export interface WorldViewOverlay {
  hover: { id: number; ok: boolean } | null;
  hoverUnit?: number | null;
  selected: ReadonlySet<number>;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ping: { x: number; y: number; age: number } | null;
  goal?: { x: number; y: number } | null;
  aim: { x: number; y: number; r: number; ok: boolean; target: number } | null;
}

export interface PingState {
  lastPingX: number;
  lastPingY: number;
  lastPingAge: number;
}

export function drawGlint(r: Graphics, x: number, y: number, tick: number, seed: number): void {
  const period = 85;
  const phase = (tick + seed * 23) % period;
  if (phase >= 14) return;
  const progress = phase / 14;
  const size = Math.sin(progress * Math.PI) * 4.5;
  if (size < 0.5) return;
  const alpha = Math.sin(progress * Math.PI);
  r.moveTo(x - size, y).lineTo(x + size, y).stroke({ color: 0xffffff, width: 1.5, alpha });
  r.moveTo(x, y - size).lineTo(x, y + size).stroke({ color: 0xffffff, width: 1.5, alpha });
  r.circle(x, y, Math.max(0.8, size * 0.35)).fill({ color: 0xfffae0, alpha });
}

export function renderShorelineFoam(
  r: Graphics,
  sim: Sim,
  map: GameMap,
  minTx: number,
  maxTx: number,
  minTy: number,
  maxTy: number,
  frame8: number,
): void {
  const mw = map.w;
  const foamPhase = frame8 / 8;
  const foamDist = foamPhase * 4;
  const foamAlpha = (1 - foamPhase) * 0.55;

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const idx = ty * mw + tx;
      if (map.terrain[idx] !== Terrain.Water) continue;
      if (!sim.explored[idx]) continue;
      const px = tx * TILE;
      const py = ty * TILE;
      if (ty > 0 && map.terrain[(ty - 1) * mw + tx] !== Terrain.Water) {
        r.ellipse(px + 16, py + foamDist + 1, 14, 1.5).fill({ color: 0xebf8ff, alpha: foamAlpha });
      }
      if (tx > 0 && map.terrain[ty * mw + tx - 1] !== Terrain.Water) {
        r.ellipse(px + foamDist + 1, py + 16, 1.5, 14).fill({ color: 0xebf8ff, alpha: foamAlpha });
      }
    }
  }
}

export function renderLootAndShrines(
  r: Graphics,
  sim: Sim,
  mw: number,
  fxEngine: FxEngine,
  activeLootKeys: Set<string>,
  seenLootKeys: Set<string>,
  frame8: number,
  shrineColors: Readonly<Record<string, number>>,
): void {
  const cb = sim.cb;
  const k = TILE / FP;

  // Loot sacks under the units, only on explored ground.
  for (let n = 0; n < cb.sG.length; n++) {
    if (!cb.sG[n]) continue;
    if (!sim.explored[Math.floor(cb.sY[n] / FP) * mw + Math.floor(cb.sX[n] / FP)]) continue;
    const sx = cb.sX[n] * k;
    const sy = cb.sY[n] * k;
    r.ellipse(sx, sy + 2, 7, 3).fill({ color: 0x000000, alpha: 0.35 });
    r.circle(sx, sy - 3, 6).fill(0xa8803c).stroke({ color: 0x4a3414, width: 1 });
    r.rect(sx - 2, sy - 10, 4, 3).fill(0xe0c060);
    drawGlint(r, sx, sy - 8, sim.tick, n);
  }

  // Item bags with parabolic arc bounce and rarity-filtered light beams.
  activeLootKeys.clear();
  for (let n = 0; n < cb.bI.length; n++) {
    if (!cb.bI[n]) continue;
    if (!sim.explored[Math.floor(cb.bY[n] / FP) * mw + Math.floor(cb.bX[n] / FP)]) continue;
    const groundX = cb.bX[n] * k;
    const groundY = cb.bY[n] * k;
    const itemId = cb.bI[n] - 1;
    const item = getItemDef(itemId);
    const rarity = item ? itemRarity(item) : 'normal';
    const lootKey = `b${n}:${cb.bI[n]}`;
    activeLootKeys.add(lootKey);
    if (!seenLootKeys.has(lootKey)) {
      seenLootKeys.add(lootKey);
      fxEngine.lootDrop.spawnDrop(lootKey, groundX, groundY, rarity);
    }
    const arc = fxEngine.lootDrop.getDrop(lootKey);
    const bx = arc && !arc.settled ? arc.x : groundX;
    const by = arc && !arc.settled ? arc.y : groundY;
    const liftZ = arc ? Math.max(0, arc.z * 0.42) : 0;
    const bagY = by - liftZ;
    const beam = fxEngine.lootDrop.isRarityVisible(rarity) ? LOOT_BEAM_COLORS[rarity] : undefined;

    const shadowScale = Math.max(0.55, 1 - liftZ * 0.025);
    r.ellipse(bx, by + 2, 7 * shadowScale, 3 * shadowScale).fill({ color: 0x000000, alpha: 0.35 * shadowScale });
    if (beam) {
      const h = beam.height;
      const pulse = 0.85 + 0.15 * Math.sin(sim.tick * 0.15 + n);
      const isLegendary = rarity === 'unique' || rarity === 'set';

      if (isLegendary) {
        r.moveTo(bx - 6, by - 6)
          .lineTo(bx - 2, by - 6 - h)
          .lineTo(bx + 2, by - 6 - h)
          .lineTo(bx + 6, by - 6)
          .closePath()
          .fill({ color: beam.outer, alpha: 0.3 * pulse });
        r.moveTo(bx - 3, by - 6)
          .lineTo(bx - 1, by - 6 - h)
          .lineTo(bx + 1, by - 6 - h)
          .lineTo(bx + 3, by - 6)
          .closePath()
          .fill({ color: beam.outer, alpha: 0.58 * pulse });
        r.moveTo(bx - 1.2, by - 6)
          .lineTo(bx - 0.5, by - 6 - h)
          .lineTo(bx + 0.5, by - 6 - h)
          .lineTo(bx + 1.2, by - 6)
          .closePath()
          .fill({ color: beam.inner, alpha: 0.88 * pulse });
        r.ellipse(bx, by + 2, 12 * pulse, 6 * pulse).stroke({ color: beam.outer, width: 1.5, alpha: 0.8 * pulse });
        r.ellipse(bx, by + 2, 6 * pulse, 3 * pulse).stroke({ color: beam.inner, width: 1.0, alpha: 0.9 * pulse });

        const sparklePeriod = 36;
        for (let sp = 0; sp < 4; sp++) {
          const sPhase = (sim.tick * 1.5 + n * 11 + sp * 9) % sparklePeriod;
          const sT = sPhase / sparklePeriod;
          const sy = by - 6 - sT * h;
          const sx = bx + Math.sin(sT * Math.PI * 4 + n + sp) * 2.5;
          const sAlpha = Math.sin(sT * Math.PI) * 0.9 * pulse;
          r.circle(sx, sy, 1.2).fill({ color: 0xffffff, alpha: sAlpha });
          r.circle(sx, sy, 2.4).stroke({ color: beam.inner, width: 0.8, alpha: sAlpha * 0.7 });
        }

        r.roundRect(bx - 6, bagY - 9, 12, 10, 3).fill(0x283850).stroke({ color: beam.outer, width: 1.8, alpha: 0.95 });
        r.rect(bx - 2, bagY - 6, 4, 3).fill(beam.inner);
      } else {
        r.moveTo(bx - 3.5, by - 6)
          .lineTo(bx - 1, by - 6 - h)
          .lineTo(bx + 1, by - 6 - h)
          .lineTo(bx + 3.5, by - 6)
          .closePath()
          .fill({ color: beam.outer, alpha: 0.3 * pulse });
        r.moveTo(bx - 1.5, by - 6)
          .lineTo(bx - 0.5, by - 6 - h)
          .lineTo(bx + 0.5, by - 6 - h)
          .lineTo(bx + 1.5, by - 6)
          .closePath()
          .fill({ color: beam.inner, alpha: 0.65 * pulse });
        r.ellipse(bx, by + 2, 9 * pulse, 4.5 * pulse).stroke({ color: beam.outer, width: 1.5, alpha: 0.7 * pulse });
        r.roundRect(bx - 6, bagY - 9, 12, 10, 3).fill(0x283850).stroke({ color: beam.outer, width: 1.5, alpha: 0.9 });
        r.rect(bx - 2, bagY - 6, 4, 3).fill(beam.inner);
      }
    } else {
      r.roundRect(bx - 6, bagY - 9, 12, 10, 3).fill(0x3c5a8c).stroke({ color: 0x1a2a48, width: 1 });
      r.rect(bx - 2, bagY - 6, 4, 3).fill(0xd8e4f4);
    }
    drawGlint(r, bx, bagY - 12, sim.tick, n + 50);
  }
  for (const prevKey of seenLootKeys) {
    if (!activeLootKeys.has(prevKey)) {
      seenLootKeys.delete(prevKey);
      fxEngine.lootDrop.removeDrop(prevKey);
    }
  }

  // Interactive world shrines.
  for (let n = 0; n < sim.shrines.length; n++) {
    const shDef = sim.shrines[n];
    if (!sim.explored[shDef.y * mw + shDef.x]) continue;
    const sx = (shDef.x + 0.5) * TILE;
    const sy = (shDef.y + 0.5) * TILE;
    const ready = sim.shrineCd[n] === 0;
    const col = shrineColors[shDef.kind] ?? 0xf0d060;
    r.ellipse(sx, sy + 4, 10, 5).fill({ color: 0x000000, alpha: 0.4 });
    r.roundRect(sx - 6, sy - 6, 12, 11, 2).fill(0x524c44).stroke({ color: 0x2a2520, width: 1 });
    if (ready) {
      const bob = Math.sin((frame8 / 8) * Math.PI * 2) * 2;
      const crystalY = sy - 10 + bob;
      const auraR = 8 + Math.sin((frame8 / 8) * Math.PI * 2) * 1.5;
      r.ellipse(sx, crystalY + 1, auraR, auraR * 0.5).stroke({ color: col, width: 1.5, alpha: 0.65 });
      r.moveTo(sx, crystalY - 7)
        .lineTo(sx + 4, crystalY)
        .lineTo(sx, crystalY + 6)
        .lineTo(sx - 4, crystalY)
        .closePath()
        .fill(col)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.85 });
      drawGlint(r, sx, crystalY - 7, sim.tick, n + 100);
    } else {
      r.circle(sx, sy - 8, 3).fill({ color: 0x3b3834, alpha: 0.85 });
    }
  }
}

export function renderDestructiblePropsAndHeroTorch(
  r: Graphics,
  sim: Sim,
  map: GameMap,
  minTx: number,
  maxTx: number,
  minTy: number,
  maxTy: number,
  frame8: number,
): void {
  const mw = map.w;
  const k = TILE / FP;
  for (let oIdx = 0; oIdx < map.objects.length; oIdx++) {
    const obj = map.objects[oIdx];
    if (obj.kind === ObjectKind.House) continue;
    if (obj.x < minTx || obj.x > maxTx || obj.y < minTy || obj.y > maxTy) continue;
    const ox = (obj.x + 0.5) * TILE;
    const oy = (obj.y + 0.5) * TILE;
    if (!sim.explored[obj.y * mw + obj.x]) continue;

    if (obj.kind === PropKind.Barrel) {
      if (obj.destroyed) {
        r.ellipse(ox, oy + 2, 7, 3.5).fill({ color: 0x3d200e, alpha: 0.65 });
        r.moveTo(ox - 5, oy).lineTo(ox + 4, oy + 3).stroke({ color: 0x784824, width: 1.5 });
        r.moveTo(ox - 3, oy + 3).lineTo(ox + 5, oy - 1).stroke({ color: 0x5a3418, width: 1.5 });
        r.circle(ox - 2, oy + 1, 1).fill(0x3a3a3a);
      } else {
        r.ellipse(ox, oy + 3, 7, 3).fill({ color: 0x000000, alpha: 0.45 });
        r.roundRect(ox - 6, oy - 11, 12, 13, 2).fill(0x784824).stroke({ color: 0x3d200e, width: 1.2 });
        r.rect(ox - 6, oy - 8, 12, 1.8).fill(0x404448);
        r.rect(ox - 6, oy - 2, 12, 1.8).fill(0x404448);
        r.ellipse(ox, oy - 11, 5, 2).fill(0x945a2e).stroke({ color: 0x3d200e, width: 0.8 });
        drawGlint(r, ox - 2, oy - 10, sim.tick, oIdx + 200);
      }
    } else if (obj.kind === PropKind.Urn) {
      if (obj.destroyed) {
        r.ellipse(ox, oy + 2, 6, 3).fill({ color: 0x4a1e10, alpha: 0.65 });
        r.moveTo(ox - 4, oy).lineTo(ox - 1, oy + 2).lineTo(ox - 3, oy + 4).closePath().fill(0xb55a30);
        r.moveTo(ox + 2, oy - 1).lineTo(ox + 5, oy + 1).lineTo(ox + 2, oy + 3).closePath().fill(0x9e4822);
      } else {
        r.ellipse(ox, oy + 3, 5, 2.5).fill({ color: 0x000000, alpha: 0.45 });
        r.ellipse(ox, oy - 5, 5.5, 6.5).fill(0xb55a30).stroke({ color: 0x5a2410, width: 1.2 });
        r.rect(ox - 2.5, oy - 12, 5, 3.5).fill(0xc86838);
        r.ellipse(ox, oy - 12, 3.5, 1.5).fill(0xe07844).stroke({ color: 0x5a2410, width: 0.8 });
        r.rect(ox - 5, oy - 6, 10, 1.5).fill(0x3880a8);
        drawGlint(r, ox, oy - 8, sim.tick, oIdx + 200);
      }
    } else if (obj.kind === PropKind.Sarcophagus) {
      if (obj.destroyed) {
        r.ellipse(ox, oy + 3, 10, 5).fill({ color: 0x000000, alpha: 0.45 });
        r.roundRect(ox - 9, oy - 12, 18, 14, 2).fill(0x383a3d).stroke({ color: 0x1a1c1e, width: 1.4 });
        r.moveTo(ox - 6, oy - 10).lineTo(ox, oy - 4).lineTo(ox + 6, oy - 7).stroke({ color: 0x141517, width: 1.5 });
      } else {
        r.ellipse(ox, oy + 4, 11, 5).fill({ color: 0x000000, alpha: 0.5 });
        r.roundRect(ox - 9, oy - 14, 18, 16, 2.5).fill(0x565b60).stroke({ color: 0x24282c, width: 1.4 });
        r.roundRect(ox - 7, oy - 13, 14, 14, 1.5).fill(0x6e747a).stroke({ color: 0x383c40, width: 0.8 });
        r.moveTo(ox, oy - 12).lineTo(ox, oy - 2).stroke({ color: 0xc49a3c, width: 1.8 });
        r.moveTo(ox - 4, oy - 9).lineTo(ox + 4, oy - 9).stroke({ color: 0xc49a3c, width: 1.8 });
        drawGlint(r, ox + 1, oy - 9, sim.tick, oIdx + 200);
      }
    } else {
      drawGlint(r, ox, oy - 10, sim.tick, oIdx + 200);
    }
  }

  if (sim.hero && sim.cb.hp[sim.hero.id] > 0) {
    const hx = sim.x[sim.hero.id] * k;
    const hy = sim.y[sim.hero.id] * k;
    const flameH = 5 + (frame8 % 4) * 0.8;
    const flameW = 2.5 + ((frame8 + 1) % 3) * 0.5;
    r.ellipse(hx + 4, hy - 18, flameW, flameH * 0.5).fill({ color: 0xff7700, alpha: 0.85 });
    r.ellipse(hx + 4, hy - 17, flameW * 0.55, flameH * 0.35).fill({ color: 0xffea00, alpha: 0.95 });
  }
}

export function renderCorpseMarks(
  r: Graphics,
  sim: Sim,
  mw: number,
  sprites: readonly (Sprite | UnitSprite)[],
): void {
  const cb = sim.cb;
  const k = TILE / FP;
  for (let i = 0; i < sim.count; i++) {
    if (cb.hp[i] > 0 || cb.corp[i] <= 0) continue;
    const body = sprites[i];
    if (body instanceof UnitSprite && body.atlas.hasClip('die')) continue;
    const tile = Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP);
    if (!sim.explored[tile]) continue;
    const cx = sim.x[i] * k;
    const cy = sim.y[i] * k;
    const a = Math.min(1, cb.corp[i] / 200);
    r.ellipse(cx, cy + 1, 9, 4).fill({ color: 0x3a1a14, alpha: 0.7 * a });
    if (body instanceof UnitSprite) {
      r.moveTo(cx - 5, cy - 2)
        .lineTo(cx + 5, cy + 3)
        .moveTo(cx + 5, cy - 2)
        .lineTo(cx - 5, cy + 3)
        .stroke({ color: 0xd8cdb0, width: 2, alpha: a });
    }
  }
}

export function renderTownArchitecture(
  r: Graphics,
  sh: Graphics,
  sim: Sim,
  map: GameMap,
  frame8: number,
): void {
  if (!sim.towns?.length) return;
  const mw = map.w;
  for (const town of sim.towns) {
    let sumX = 0;
    let sumY = 0;
    let countB = 0;
    for (let role = 0; role < town.centre.length; role++) {
      const c = town.centre[role];
      if (!c) continue;
      const tileIdx = Math.min(map.h - 1, Math.max(0, Math.floor(c[1]))) * mw + Math.min(mw - 1, Math.max(0, Math.floor(c[0])));
      if (!sim.explored[tileIdx]) continue;
      const bx = c[0] * TILE;
      const by = c[1] * TILE;
      sumX += bx;
      sumY += by + TILE;
      countB++;

      const flicker = 0.85 + 0.15 * Math.sin(sim.tick * 0.18 + role * 2.1);
      const glowCol = role === 0 ? 0xffaa38 : role === 1 ? 0xff6820 : 0x58c8ff;
      r.ellipse(bx, by + 28, 26 * flicker, 12 * flicker).fill({ color: glowCol, alpha: 0.22 * flicker });
      r.ellipse(bx, by + 26, 15 * flicker, 7 * flicker).fill({ color: 0xffe898, alpha: 0.28 * flicker });
    }
    if (countB >= 2) {
      const px = sumX / countB;
      const py = sumY / countB;
      r.ellipse(px, py, 34, 18)
        .fill({ color: 0x625a4e, alpha: 0.38 })
        .stroke({ color: 0x9e9280, width: 1.5, alpha: 0.55 });
      r.ellipse(px, py, 14, 7.5)
        .fill({ color: 0x286890, alpha: 0.55 })
        .stroke({ color: 0xb8b0a0, width: 2, alpha: 0.7 });
    }
  }
}

export function renderUnitIndicators(
  r: Graphics,
  sh: Graphics,
  sim: Sim,
  sprites: readonly (Sprite | UnitSprite)[],
  v: WorldViewOverlay,
  quality: number,
  frame8: number,
  dirCos: readonly number[],
  dirSin: readonly number[],
  statusColors: readonly number[],
  familyVisuals: Readonly<Record<string, FamilyVisualDef>>,
  nameplates?: OverheadNameplateLayer,
  vfx?: VfxSystem,
): void {
  const cb = sim.cb;

  // Hit-point bars for selected or hurt units without overhead plates.
  for (let i = 0; i < sim.count; i++) {
    const s = sprites[i];
    if (!s || !s.visible || cb.hp[i] <= 0) continue;
    if (nameplates?.hasPlate(i)) continue;
    const hurt = cb.hp[i] < cb.hpMax[i];
    const sel = v.selected.has(i);
    if (!(sel || (hurt && quality > 0))) continue;
    const f = cb.hp[i] / cb.hpMax[i];
    const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
    const y = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;
    sh.rect(s.x - w / 2 - 1, y - 1, w + 2, 5).fill(0x000000);
    sh.rect(s.x - w / 2, y, w * f, 3).fill(sim.team[i] === 0 ? (f > 0.35 ? 0x5fd35f : 0xe0b030) : 0xe05a4a);
  }

  // Status pips, active shield rings, and selected caster mana bars.
  for (let i = 0; i < sim.count; i++) {
    const s = sprites[i];
    if (!s || !s.visible || cb.hp[i] <= 0) continue;
    const m = cb.stMask[i];
    const y = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;
    if (m) {
      let n = 0;
      for (let st = 0; st < 8; st++) {
        if (!(m & (1 << st))) continue;
        sh.rect(s.x - 12 + n * 5, y - 7, 4, 4).fill(statusColors[st]).stroke({ color: 0x000000, width: 1 });
        n++;
      }
      if (m & (1 << St.Shield)) {
        if (!vfx?.hasIronSkin(i)) {
          sh.ellipse(s.x, s.y - 12 * s.scale.y, 12, 15 * s.scale.y).stroke({ color: 0x70c8ff, width: 1.5, alpha: 0.8 });
        }
      }
    }
    if (v.selected.has(i) && cb.mana[i] > 0) {
      const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
      sh.rect(s.x - w / 2, y + 4, w * Math.min(1, cb.mana[i] / Math.max(1, cb.manaMax[i])), 2).fill(0x5a8cff);
    }
  }

  // Boss/Elite rings, monster family ornaments, crowns, and elemental affixes.
  for (let i = 0; i < sim.count; i++) {
    if ((!cb.bossMods[i]?.length && !cb.family[i]) || cb.hp[i] <= 0 || !sprites[i]?.visible) continue;
    const famId = cb.family[i];
    const boss = famId ? bossSpriteDef(famId) : undefined;
    const famVis = famId ? familyVisuals[famId] : undefined;
    const mods = cb.bossMods[i] ?? [];
    const isElite = mods.length > 0 || !!boss;
    const s = sprites[i];
    let auraTint = boss?.auraTint ?? (isElite ? 0xf4b43a : famVis?.auraColor ?? 0xf4b43a);
    if (mods.includes('holy_freeze') || mods.includes('cold_enchanted')) {
      auraTint = 0x38bdf8;
    } else if (mods.includes('holy_fire') || mods.includes('fire_enchanted')) {
      auraTint = 0xff4810;
    } else if (mods.includes('holy_shock') || mods.includes('lightning_enchanted') || mods.includes('spectral_hit')) {
      auraTint = 0x00c8ff;
    } else if (mods.includes('conviction')) {
      auraTint = 0x22c55e;
    } else if (mods.includes('fanaticism') || mods.includes('thorns')) {
      auraTint = 0xdc2626;
    } else if (mods.includes('blessed_aim') || mods.includes('concentration')) {
      auraTint = 0xffd700;
    } else if (mods.includes('extra_fast') || mods.includes('vigor')) {
      auraTint = 0x30e850;
    }
    const baseRadius = boss ? Math.round(14 * (boss.scale / 1.3)) : isElite ? 14 : 11;

    r.ellipse(s.x, s.y, baseRadius, Math.round(baseRadius * 0.46)).stroke({
      color: auraTint,
      width: isElite ? 1.8 : 1.2,
      alpha: isElite ? 0.88 : 0.48,
    });

    if (boss || isElite || mods.includes('blessed_aura')) {
      const pulse = 1 + 0.14 * Math.sin(sim.tick * 0.2 + i);
      const outerTint = boss ? boss.auraTint : mods.includes('blessed_aura') ? 0xffd700 : auraTint;
      const rxOut = Math.round(baseRadius * 1.45 * pulse);
      const ryOut = Math.round(baseRadius * 0.68 * pulse);
      r.ellipse(s.x, s.y, rxOut, ryOut).stroke({ color: outerTint, width: 1.4, alpha: 0.55 });
      const nodeCount = boss ? 6 : 4;
      const rot = sim.tick * 0.05 + i;
      for (let n = 0; n < nodeCount; n++) {
        const ang = rot + (n * Math.PI * 2) / nodeCount;
        sh.circle(s.x + Math.cos(ang) * rxOut, s.y + Math.sin(ang) * ryOut, 1.8).fill({ color: 0xffffff, alpha: 0.85 });
      }
    }

    const headY = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;

    if (famVis && famVis.ornament !== 'none') {
      const orn = famVis.ornament;
      const col = famVis.auraColor;
      const bob = Math.sin(sim.tick * 0.15 + i) * 2;
      if (famId === 'hollow-knight') {
        const eyePulse = 0.8 + 0.2 * Math.sin(sim.tick * 0.2 + i);
        sh.circle(s.x - 3, headY + 5, 1.6).fill({ color: 0x38bdf8, alpha: eyePulse });
        sh.circle(s.x + 3, headY + 5, 1.6).fill({ color: 0x38bdf8, alpha: eyePulse });
        sh.circle(s.x - 3, headY + 5, 0.8).fill({ color: 0xffffff, alpha: 0.95 });
        sh.circle(s.x + 3, headY + 5, 0.8).fill({ color: 0xffffff, alpha: 0.95 });
        sh.moveTo(s.x - 7, headY + 11).lineTo(s.x - 12, headY + 7).lineTo(s.x - 8, headY + 15).stroke({ color: 0x334155, width: 1.5 });
        sh.moveTo(s.x + 7, headY + 11).lineTo(s.x + 12, headY + 7).lineTo(s.x + 8, headY + 15).stroke({ color: 0x334155, width: 1.5 });
      } else if (famId === 'gloom-stag') {
        sh.moveTo(s.x - 3, headY + 8).lineTo(s.x - 10, headY - 1).lineTo(s.x - 6, headY - 6).stroke({ color: 0xe2e8f0, width: 2.0, alpha: 0.95 });
        sh.moveTo(s.x + 3, headY + 8).lineTo(s.x + 10, headY - 1).lineTo(s.x + 6, headY - 6).stroke({ color: 0xe2e8f0, width: 2.0, alpha: 0.95 });
        sh.moveTo(s.x - 7, headY + 2).lineTo(s.x - 12, headY + 1).stroke({ color: 0xc084fc, width: 1.4 });
        sh.moveTo(s.x + 7, headY + 2).lineTo(s.x + 12, headY + 1).stroke({ color: 0xc084fc, width: 1.4 });
        const cAng = sim.tick * 0.1 + i;
        sh.circle(s.x + Math.cos(cAng) * 12, headY + Math.sin(cAng * 2) * 5, 2.0).fill({ color: 0xa855f7, alpha: 0.85 });
        sh.circle(s.x - Math.cos(cAng) * 10, headY - Math.sin(cAng * 2) * 4, 1.4).fill({ color: 0xd8b4fe, alpha: 0.9 });
      } else if (famId === 'spore-matron') {
        for (let sp = 0; sp < 4; sp++) {
          const spAng = sim.tick * 0.08 + i + (sp * Math.PI) / 2;
          const spDist = 11 + Math.sin(sim.tick * 0.15 + sp) * 3;
          sh.circle(s.x + Math.cos(spAng) * spDist, s.y - 16 + Math.sin(spAng) * (spDist * 0.5), 2.2).fill({ color: 0x84cc16, alpha: 0.85 });
          sh.circle(s.x + Math.cos(spAng) * spDist, s.y - 16 + Math.sin(spAng) * (spDist * 0.5), 1.0).fill({ color: 0xecfccb, alpha: 0.95 });
        }
      } else if (famId === 'basalt-brute') {
        const pulse = 0.85 + 0.15 * Math.sin(sim.tick * 0.18 + i);
        const bodyY = s.y - 16 * s.scale.y;
        sh.moveTo(s.x - 6, bodyY - 6).lineTo(s.x - 1, bodyY + 1).lineTo(s.x - 4, bodyY + 8).stroke({ color: 0xf97316, width: 2.2, alpha: pulse });
        sh.moveTo(s.x + 5, bodyY - 5).lineTo(s.x + 1, bodyY).lineTo(s.x + 4, bodyY + 7).stroke({ color: 0xf97316, width: 2.2, alpha: pulse });
        sh.moveTo(s.x - 6, bodyY - 6).lineTo(s.x - 1, bodyY + 1).lineTo(s.x - 4, bodyY + 8).stroke({ color: 0xfde047, width: 1.0, alpha: pulse });
        sh.moveTo(s.x + 5, bodyY - 5).lineTo(s.x + 1, bodyY).lineTo(s.x + 4, bodyY + 7).stroke({ color: 0xfde047, width: 1.0, alpha: pulse });
      } else if (orn === 'antlers') {
        sh.moveTo(s.x - 3, headY + 8).lineTo(s.x - 9, headY + 1).lineTo(s.x - 6, headY - 3).stroke({ color: col, width: 1.6, alpha: 0.9 });
        sh.moveTo(s.x + 3, headY + 8).lineTo(s.x + 9, headY + 1).lineTo(s.x + 6, headY - 3).stroke({ color: col, width: 1.6, alpha: 0.9 });
      } else if (orn === 'wisp' || orn === 'astral') {
        const a = sim.tick * 0.12 + i;
        sh.circle(s.x + Math.cos(a) * 11, s.y - 16 + Math.sin(a * 2) * 3, 2.4).fill({ color: col, alpha: 0.9 });
        sh.circle(s.x - Math.cos(a) * 11, s.y - 16 - Math.sin(a * 2) * 3, 1.8).fill({ color: 0xffffff, alpha: 0.85 });
      } else if (orn === 'totem') {
        sh.moveTo(s.x, headY + 2 + bob).lineTo(s.x + 3.5, headY + 7 + bob).lineTo(s.x - 3.5, headY + 7 + bob).closePath().fill({ color: col, alpha: 0.88 });
      } else if (orn === 'spines') {
        for (let sp = -1; sp <= 1; sp++) {
          sh.moveTo(s.x + sp * 4, s.y - 18).lineTo(s.x + sp * 5, s.y - 24).stroke({ color: col, width: 1.5, alpha: 0.85 });
        }
      } else if (orn === 'treant') {
        sh.circle(s.x - 6, headY + 10, 2.5).fill({ color: 0x58d848, alpha: 0.85 });
        sh.circle(s.x + 6, headY + 10, 2.5).fill({ color: 0x58d848, alpha: 0.85 });
      } else if (orn === 'drake' || orn === 'forge') {
        sh.circle(s.x, s.y - 18 + bob, 2.8).fill({ color: 0xff7820, alpha: 0.85 });
        sh.circle(s.x, s.y - 18 + bob, 1.4).fill({ color: 0xffe878, alpha: 0.95 });
      } else if (orn === 'storm' || orn === 'scarab') {
        const jx = (sim.tick + i) & 1 ? 3 : -3;
        sh.moveTo(s.x - 5, s.y - 16).lineTo(s.x + jx, s.y - 21).lineTo(s.x + 5, s.y - 15).stroke({ color: 0x70e8ff, width: 1.5, alpha: 0.9 });
      } else if (orn === 'crown') {
        sh.moveTo(s.x - 5, headY + 6).lineTo(s.x - 3, headY + 2).lineTo(s.x, headY + 5).lineTo(s.x + 3, headY + 2).lineTo(s.x + 5, headY + 6).stroke({ color: col, width: 1.5, alpha: 0.9 });
      } else if (orn === 'bell' || orn === 'mummy' || orn === 'serpent' || orn === 'shell') {
        sh.ellipse(s.x, s.y - 14, 9, 5).stroke({ color: col, width: 1.2, alpha: 0.65 });
      }
    }

    if (isElite) {
      const cy = headY - 9;
      const isSuper = !!boss || mods.length >= 2;
      const crownCol = boss ? boss.auraTint : isSuper ? 0xffb830 : 0xffe066;
      if (isSuper) {
        sh.moveTo(s.x - 8, cy + 5)
          .lineTo(s.x - 9, cy - 1)
          .lineTo(s.x - 4, cy + 2)
          .lineTo(s.x, cy - 4)
          .lineTo(s.x + 4, cy + 2)
          .lineTo(s.x + 9, cy - 1)
          .lineTo(s.x + 8, cy + 5)
          .closePath()
          .fill(crownCol)
          .stroke({ color: 0x241408, width: 1.2 });
        sh.circle(s.x, cy + 1, 1.8).fill(0xff2848);
      } else {
        sh.moveTo(s.x - 6, cy + 4)
          .lineTo(s.x - 6, cy - 1)
          .lineTo(s.x - 2, cy + 2)
          .lineTo(s.x, cy - 3)
          .lineTo(s.x + 2, cy + 2)
          .lineTo(s.x + 6, cy - 1)
          .lineTo(s.x + 6, cy + 4)
          .closePath()
          .fill(crownCol)
          .stroke({ color: 0x241408, width: 1 });
      }

      const bodyY = s.y - 16 * s.scale.y;
      if (mods.includes('fire_enchanted')) {
        const fAng = dirCos[sim.dir[i]] * 8;
        const fh = 5 + (frame8 % 3) * 1.2;
        sh.ellipse(s.x + fAng, bodyY - 2, 4, fh).fill({ color: 0xff4800, alpha: 0.85 });
        sh.ellipse(s.x + fAng, bodyY - 2, 2.2, fh * 0.6).fill({ color: 0xffe858, alpha: 0.95 });
      }
      if (mods.includes('lightning_enchanted') || mods.includes('lightning') || mods.includes('spectral_hit')) {
        const seedL = (sim.tick + i * 7) & 3;
        const lx1 = s.x - 8 + seedL * 2;
        const lx2 = s.x + 8 - seedL * 2;
        sh.moveTo(lx1, bodyY - 8)
          .lineTo(s.x + (seedL & 1 ? 4 : -4), bodyY)
          .lineTo(lx2, bodyY + 7)
          .stroke({ color: 0x58c8ff, width: 2, alpha: 0.9 });
        sh.moveTo(lx1, bodyY - 8)
          .lineTo(s.x + (seedL & 1 ? 4 : -4), bodyY)
          .lineTo(lx2, bodyY + 7)
          .stroke({ color: 0xffffff, width: 1, alpha: 0.95 });
      }
      if (mods.includes('cold_enchanted') || mods.includes('cold_touch')) {
        for (let cIdx = 0; cIdx < 3; cIdx++) {
          const cAng = sim.tick * 0.08 + i + (cIdx * Math.PI * 2) / 3;
          const cx = s.x + Math.cos(cAng) * 12;
          const cyCrystal = bodyY + Math.sin(cAng) * 6;
          sh.moveTo(cx, cyCrystal - 4)
            .lineTo(cx + 2.5, cyCrystal)
            .lineTo(cx, cyCrystal + 4)
            .lineTo(cx - 2.5, cyCrystal)
            .closePath()
            .fill({ color: 0x80e8ff, alpha: 0.88 })
            .stroke({ color: 0xffffff, width: 0.8 });
        }
      }
      if (mods.includes('stone_skin')) {
        for (let gIdx = 0; gIdx < 3; gIdx++) {
          const gAng = -sim.tick * 0.06 + i + (gIdx * Math.PI * 2) / 3;
          const gx = s.x + Math.cos(gAng) * 13;
          const gy = bodyY + Math.sin(gAng) * 6.5;
          sh.roundRect(gx - 3, gy - 4, 6, 8, 1.5)
            .fill({ color: 0x98948c, alpha: 0.92 })
            .stroke({ color: 0x403c38, width: 1.2 });
        }
      }
      if (mods.includes('extra_fast')) {
        const dx = -dirCos[sim.dir[i]];
        const dy = -dirSin[sim.dir[i]];
        for (let tr = 1; tr <= 2; tr++) {
          sh.moveTo(s.x + dx * (6 * tr), bodyY + dy * (3 * tr) - 5)
            .lineTo(s.x + dx * (6 * tr + 9), bodyY + dy * (3 * tr + 4.5) - 5)
            .stroke({ color: 0x98f8ff, width: 2, alpha: 0.65 / tr });
          sh.moveTo(s.x + dx * (6 * tr), bodyY + dy * (3 * tr) + 4)
            .lineTo(s.x + dx * (6 * tr + 8), bodyY + dy * (3 * tr + 4) + 4)
            .stroke({ color: 0xffe878, width: 1.6, alpha: 0.6 / tr });
        }
      }
    }
  }
}

export function renderSelectionAndHover(
  r: Graphics,
  sim: Sim,
  sprites: readonly (Sprite | UnitSprite)[],
  fxEngine: FxEngine,
  v: WorldViewOverlay,
): void {
  const cb = sim.cb;
  for (const id of v.selected) {
    const s = sprites[id];
    if (!s || !s.visible || cb.hp[id] <= 0) continue;
    const radX = (s instanceof UnitSprite ? 13 : 11) * s.scale.x;
    const radY = radX * 0.48;
    r.ellipse(s.x, s.y, radX * 1.15, radY * 1.15).stroke({ color: 0x22c55e, width: 1.0, alpha: 0.35 });
    r.ellipse(s.x, s.y, radX, radY).stroke({ color: 0x86efac, width: 1.4, alpha: 0.85 });
  }

  const hoverUnitId = v.hover?.id ?? v.hoverUnit ?? null;
  if (hoverUnitId !== null && hoverUnitId >= 0 && hoverUnitId < sim.count && cb.hp[hoverUnitId] > 0) {
    const fam = cb.family[hoverUnitId];
    const isBoss = fam ? !!bossSpriteDef(fam) : false;
    const isElite = (cb.bossMods[hoverUnitId]?.length ?? 0) > 0;
    const enemyRank = isBoss ? 'boss' : isElite ? 'elite' : 'normal';
    fxEngine.cursorTarget.updateHover({
      kind: sim.team[hoverUnitId] !== 0 ? 'enemy' : 'npc',
      unitId: hoverUnitId,
      enemyRank,
      casting: !!v.aim,
    });
  } else if (v.aim) {
    fxEngine.cursorTarget.updateHover({
      kind: v.aim.ok ? 'ground' : 'blocked',
      casting: true,
    });
  } else {
    fxEngine.cursorTarget.updateHover({ kind: 'none' });
  }

  const hoverOutline = fxEngine.cursorTarget.getHoverOutline();
  if (v.hover) {
    const s = sprites[v.hover.id];
    if (s && s.visible && cb.hp[v.hover.id] > 0) {
      const radX = (s instanceof UnitSprite ? 13.5 : 12) * s.scale.x;
      const radY = radX * 0.48;
      const col = hoverOutline ? hoverOutline.color : v.hover.ok ? 0xef4444 : 0x94a3b8;
      const thick = hoverOutline ? hoverOutline.thickness : 1.2;
      const alp = hoverOutline ? hoverOutline.alpha : 0.7;
      r.ellipse(s.x, s.y, radX, radY).stroke({ color: col, width: thick, alpha: alp });
    }
  }
}

export function renderProjectilesAndBursts(
  sh: Graphics,
  sim: Sim,
  bursts: Burst[],
  now: number,
): void {
  const cb = sim.cb;
  const k = TILE / FP;
  for (let p = 0; p < cb.pAlive.length; p++) {
    if (!cb.pAlive[p]) continue;
    const wx = cb.pX[p] * k;
    const wy = cb.pY[p] * k - 14;
    const el = cb.pEl[p];
    const spell = cb.pS[p] > 0 ? SPELLS[cb.pS[p] - 1] : null;
    if (spell && (spell.tk === Tk.Ally || spell.heal)) {
      sh.circle(wx, wy, 4).fill(BUFF_COLOR).stroke({ color: 0xffffff, width: 1 });
    } else if (spell) {
      const sid = cb.pS[p] - 1;
      if (sid >= 24 && sid <= 31) {
        if (sid === 30) {
          sh.circle(wx, wy, 6).fill(0x2979ff).stroke({ color: 0xe040fb, width: 2, alpha: 0.9 });
          sh.circle(wx, wy, 2.5).fill(0xffffff);
        }
        continue;
      }
      if (el === 1) sh.circle(wx, wy, 5).fill(ELEM_COLOR[1]).circle(wx, wy, 2.5).fill(0xfff0a0);
      else if (el === 2) sh.circle(wx, wy, 5).fill({ color: ELEM_COLOR[2], alpha: 0.8 }).stroke({ color: 0xe0f8ff, width: 1.5 });
      else if (el === 3) sh.moveTo(wx - 6, wy).lineTo(wx, wy - 3).lineTo(wx + 6, wy).lineTo(wx, wy + 3).closePath().fill(ELEM_COLOR[3]).stroke({ color: 0xffffff, width: 1 });
      else if (el === 4) sh.rect(wx - 4, wy - 4, 8, 8).fill(ELEM_COLOR[4]).stroke({ color: 0x4a3820, width: 1 });
      else if (el === 5) sh.circle(wx, wy, 5).fill(ELEM_COLOR[5]).stroke({ color: 0xffffff, width: 1, alpha: 0.85 });
      else sh.circle(wx, wy, 5).fill(ELEM_COLOR[el]).stroke({ color: 0xffffff, width: 1, alpha: 0.7 });
    } else if (el === 0) {
      const t = cb.pT[p];
      const dx = sim.x[t] - cb.pX[p];
      const dy = sim.y[t] - cb.pY[p];
      const len = Math.max(1, Math.hypot(dx, dy));
      sh.moveTo(wx, wy).lineTo(wx - (dx / len) * 9, wy - (dy / len) * 9).stroke({ color: 0xe8d8a0, width: 2 });
    } else {
      sh.circle(wx, wy, 4).fill(ELEM_COLOR[el]);
    }
  }

  for (let n = bursts.length - 1; n >= 0; n--) {
    const b = bursts[n];
    const age = (now - b.born) / b.ms;
    if (age >= 1) {
      bursts.splice(n, 1);
      continue;
    }
    const rad = b.r * (0.35 + 0.65 * age);
    const fade = 1 - age;
    if (b.fill) sh.circle(b.x, b.y, rad).fill({ color: b.color, alpha: 0.28 * fade }).stroke({ color: b.color, width: 2, alpha: fade });
    else sh.circle(b.x, b.y, rad).stroke({ color: b.color, width: 2, alpha: fade });
    if (b.el === 1) {
      for (let a = 0; a < 6; a++) {
        const ang = a * (Math.PI / 3) + age * 0.6;
        sh.moveTo(b.x + Math.cos(ang) * rad * 0.55, b.y + Math.sin(ang) * rad * 0.55)
          .lineTo(b.x + Math.cos(ang) * rad * 1.15, b.y + Math.sin(ang) * rad * 1.15)
          .stroke({ color: 0xffe484, width: 1.5, alpha: fade });
      }
    } else if (b.el === 2) {
      sh.ellipse(b.x, b.y, rad * 0.6, rad * 0.42).stroke({ color: 0xc8f4ff, width: 1.5, alpha: fade * 0.9 });
    } else if (b.el === 3) {
      const s = rad * 1.1;
      sh.moveTo(b.x - s, b.y).lineTo(b.x + s, b.y).moveTo(b.x, b.y - s).lineTo(b.x, b.y + s).stroke({ color: 0xffffff, width: 1.5, alpha: fade });
    } else if (b.el === 4) {
      for (let a = 0; a < 4; a++) {
        const ang = a * (Math.PI / 2) + 0.78;
        sh.rect(b.x + Math.cos(ang) * rad * 0.75 - 2, b.y + Math.sin(ang) * rad * 0.75 - 2, 4, 4).fill({ color: 0x8f744a, alpha: fade });
      }
    } else if (b.el === 5) {
      const d = rad * 0.78;
      sh.moveTo(b.x, b.y - d).lineTo(b.x + d, b.y).lineTo(b.x, b.y + d).lineTo(b.x - d, b.y).closePath().stroke({ color: 0xf0c8ff, width: 1.5, alpha: fade });
    }
  }
}

export function renderScreenOverlays(
  o: Graphics,
  sim: Sim,
  sprites: readonly (Sprite | UnitSprite)[],
  v: WorldViewOverlay,
  fxEngine: FxEngine,
  pingState: PingState,
  camX: number,
  camY: number,
  zoom: number,
  viewW: number,
  viewH: number,
  now: number,
  vfx?: VfxSystem,
): void {
  o.clear();
  vfx?.drawScreenOverlay(o, viewW, viewH);

  if (v.aim) {
    const a = v.aim;
    const c = a.ok ? 0xffe070 : 0xff6a5a;
    if (a.r > 0) o.circle(a.x, a.y, a.r).fill({ color: c, alpha: 0.12 }).stroke({ color: c, width: 2 });
    o.circle(a.x, a.y, 13).stroke({ color: c, width: 2 });
    o.moveTo(a.x - 20, a.y)
      .lineTo(a.x - 6, a.y)
      .moveTo(a.x + 6, a.y)
      .lineTo(a.x + 20, a.y)
      .moveTo(a.x, a.y - 20)
      .lineTo(a.x, a.y - 6)
      .moveTo(a.x, a.y + 6)
      .lineTo(a.x, a.y + 20)
      .stroke({ color: c, width: 2 });
    if (a.target >= 0 && sprites[a.target]?.visible) {
      const t = sprites[a.target];
      o.ellipse(t.x * zoom - camX, (t.y - 4) * zoom - camY, 16 * zoom, 8 * zoom).stroke({ color: c, width: 3 });
    }
  }

  if (v.box) {
    const { x0, y0, x1, y1 } = v.box;
    o.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      .fill({ color: 0x9dff7a, alpha: 0.12 })
      .stroke({ color: 0x9dff7a, width: 1 });
  }

  if (v.ping) {
    if (v.ping.age < pingState.lastPingAge || v.ping.x !== pingState.lastPingX || v.ping.y !== pingState.lastPingY) {
      fxEngine.cursorTarget.emitClickRipple(v.ping.x * TILE, v.ping.y * TILE, 'move');
    }
    pingState.lastPingAge = v.ping.age;
    pingState.lastPingX = v.ping.x;
    pingState.lastPingY = v.ping.y;
    const sx = v.ping.x * TILE * zoom - camX;
    const sy = v.ping.y * TILE * zoom - camY;
    o.circle(sx, sy, (6 + v.ping.age * 22) * zoom).stroke({ color: 0xffd700, width: 2.5, alpha: 1 - v.ping.age });
    o.circle(sx, sy, (3 + v.ping.age * 12) * zoom).stroke({ color: 0xffe680, width: 1.5, alpha: (1 - v.ping.age) * 0.8 });
    o.moveTo(sx, sy - 6).lineTo(sx + 6, sy).lineTo(sx, sy + 6).lineTo(sx - 6, sy).closePath().stroke({ color: 0xffd700, width: 1.5, alpha: 1 - v.ping.age });
  } else {
    pingState.lastPingAge = 2;
  }

  if (v.goal) {
    const gx = v.goal.x * TILE * zoom - camX;
    const gy = v.goal.y * TILE * zoom - camY;
    const pulse = (now % 1200) / 1200;
    const m = 26;
    if (gx >= m && gy >= m && gx <= viewW - m && gy <= viewH - m) {
      o.circle(gx, gy, (10 + pulse * 20) * zoom).stroke({ color: 0xffd700, width: 2.5, alpha: 1 - pulse });
      o.moveTo(gx, gy - 16 * zoom)
        .lineTo(gx + 10 * zoom, gy)
        .lineTo(gx, gy + 16 * zoom)
        .lineTo(gx - 10 * zoom, gy)
        .closePath()
        .fill({ color: 0xffd700, alpha: 0.35 })
        .stroke({ color: 0xffe680, width: 2 });
    } else {
      const cx = viewW / 2;
      const cy = viewH / 2;
      const dx = gx - cx;
      const dy = gy - cy;
      const kEdge = Math.min((cx - m) / Math.max(Math.abs(dx), 1e-3), (cy - m) / Math.max(Math.abs(dy), 1e-3));
      const ax = cx + dx * kEdge;
      const ay = cy + dy * kEdge;
      const a = Math.atan2(dy, dx);
      const s = 14 + pulse * 4;
      o.moveTo(ax + Math.cos(a) * s, ay + Math.sin(a) * s)
        .lineTo(ax + Math.cos(a + 2.4) * s, ay + Math.sin(a + 2.4) * s)
        .lineTo(ax + Math.cos(a - 2.4) * s, ay + Math.sin(a - 2.4) * s)
        .closePath()
        .fill({ color: 0xffd700, alpha: 0.9 })
        .stroke({ color: 0x3a2a00, width: 2 });
    }
  }

  // Directional chevron pointing toward nearest enemy camp outside a 10-tile radius.
  const heroId = sim.hero ? sim.hero.id : 0;
  if (sim.cb.hp[heroId] > 0) {
    const hWorldX = (sim.x[heroId] / FP) * TILE;
    const hWorldY = (sim.y[heroId] / FP) * TILE;
    const hScreenX = hWorldX * zoom - camX;
    const hScreenY = hWorldY * zoom - camY;

    if (hScreenX >= 0 && hScreenX <= viewW && hScreenY >= 0 && hScreenY <= viewH) {
      let nearestDistSq = Infinity;
      let nearestEnemyIdx = -1;
      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] !== 1 || sim.cb.hp[i] <= 0) continue;
        const eWorldX = (sim.x[i] / FP) * TILE;
        const eWorldY = (sim.y[i] / FP) * TILE;
        const dSq = (eWorldX - hWorldX) ** 2 + (eWorldY - hWorldY) ** 2;
        if (dSq < nearestDistSq) {
          nearestDistSq = dSq;
          nearestEnemyIdx = i;
        }
      }

      if (nearestEnemyIdx >= 0 && nearestDistSq > (10 * TILE) ** 2) {
        const eWorldX = (sim.x[nearestEnemyIdx] / FP) * TILE;
        const eWorldY = (sim.y[nearestEnemyIdx] / FP) * TILE;
        const angle = Math.atan2(eWorldY - hWorldY, eWorldX - hWorldX);
        const orbitR = 48 * zoom;
        const px = hScreenX + Math.cos(angle) * orbitR;
        const py = hScreenY + Math.sin(angle) * orbitR;

        const pulse = 0.5 + 0.5 * Math.sin(now / 400);
        const chevronAlpha = 0.35 + 0.3 * pulse;
        const sideL = 8 * zoom;

        o.moveTo(px, py)
          .lineTo(px + Math.cos(angle + 2.5) * sideL, py + Math.sin(angle + 2.5) * sideL)
          .stroke({ color: 0xff6a5a, width: 2, alpha: chevronAlpha });
        o.moveTo(px, py)
          .lineTo(px + Math.cos(angle - 2.5) * sideL, py + Math.sin(angle - 2.5) * sideL)
          .stroke({ color: 0xff6a5a, width: 2, alpha: chevronAlpha });
      }
    }
  }
}

export function renderFxEngineWorldLayers(
  fg: Graphics,
  fw: Graphics,
  fa: Graphics,
  fxEngine: FxEngine,
): void {
  fg.clear();
  fw.clear();
  fa.clear();

  fxEngine.deathFx.decals.forEachActive((d) => {
    fg.ellipse(d.x, d.y, d.radius, d.radius * 0.55).fill({ color: d.color, alpha: d.alpha * 0.65 });
  });

  fxEngine.deathFx.bones.forEachActive((b) => {
    const cos = Math.cos(b.rot);
    const sin = Math.sin(b.rot);
    const len = b.kind === 1 ? 5.5 : b.kind === 2 ? 4.5 : 3.5;
    const drawY = b.y - b.z * 0.45;
    if (b.z > 0.5) {
      fg.ellipse(b.x, b.y + 1, 3, 1.5).fill({ color: 0x000000, alpha: b.alpha * 0.35 });
    }
    fg.moveTo(b.x - cos * len, drawY - sin * len)
      .lineTo(b.x + cos * len, drawY + sin * len)
      .stroke({ color: 0xe6dcc4, width: b.kind === 2 ? 2.4 : 1.6, alpha: b.alpha });
  });

  fxEngine.footsteps.footsteps.forEachActive((f) => {
    if (f.kind === 'ripple') {
      fg.ellipse(f.x, f.y, f.radius, f.radius * 0.52).stroke({ color: f.color, width: 1.2, alpha: f.alpha * 0.8 });
    } else {
      fg.ellipse(f.x, f.y, f.radius, f.radius * 0.65).fill({ color: f.color, alpha: f.alpha * 0.55 });
    }
  });

  fxEngine.hitFeedback.particles.forEachActive((p) => {
    fw.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
  });

  fxEngine.deathFx.motes.forEachActive((m) => {
    fw.circle(m.x, m.y, m.radius * 1.8).fill({ color: m.color, alpha: m.alpha * 0.25 });
    fw.circle(m.x, m.y, m.radius).fill({ color: m.color, alpha: m.alpha * 0.9 });
  });

  fxEngine.cursorTarget.ripples.forEachActive((rp) => {
    fw.ellipse(rp.x, rp.y, rp.radius, rp.radius * 0.52).stroke({ color: rp.color, width: 1.6, alpha: rp.alpha });
  });

  fxEngine.spellVfx.lightBursts.forEachActive((b) => {
    fa.ellipse(b.x, b.y, b.currentRadius, b.currentRadius * 0.6).fill({ color: b.color, alpha: b.alpha * 0.22 });
    fa.ellipse(b.x, b.y, b.currentRadius * 0.45, b.currentRadius * 0.28).fill({ color: b.coreColor, alpha: b.alpha * 0.35 });
  });

  fxEngine.lootDrop.beams.forEachActive((beam) => {
    if (!fxEngine.lootDrop.isRarityVisible(beam.rarity)) return;
    fa.ellipse(beam.x, beam.y, beam.width * 1.4, beam.width * 0.6).fill({ color: beam.color, alpha: beam.alpha * 0.22 });
  });
}
