import { Container, Sprite, type Texture } from 'pixi.js';
import { TILE, type GameMap } from '../map';
import type { AdventureObjectDef, WaypointDef } from '../mapdoc';
import type { ExtraAtlases, PackedAtlas } from '../sprites/extra-atlases';
import { bossSpriteDef, UnitSprite } from '../sprites/units';
import { FP, type Sim } from '../sim/sim';
import { St } from '../sim/spelldata';

export type TelegraphBossId = 'morvessa' | 'gorrathul' | 'vesperion' | 'ashkarath';
export type TelegraphShape = 'ring' | 'cone' | 'line' | 'glyph';

export interface RenderBossTelegraph {
  bossId: TelegraphBossId;
  shape: TelegraphShape;
  /** World pixel X. */
  x: number;
  /** World pixel Y. */
  y: number;
  /** Telegraph radius/length in world pixels. */
  radiusPx: number;
  /** Direction angle in radians for cone / line telegraphs. */
  angle?: number;
  /** Progress 0..1 from telegraph start to impact. */
  chargeRatio: number;
}

const CITY_ROLES = ['tavern', 'smithy', 'temple', 'gate', 'watchtower'] as const;
type CityKey = 'thornwick' | 'redmarsh' | 'oakhaven' | 'ironcamp';
type FactionKey = 'thornwatch' | 'ironbound' | 'conclave';

const STATUS_FRAME_KEYS: readonly (readonly [number, string])[] = [
  [St.Burn, 'status/burning'],
  [St.Slow, 'status/frozen'],
  [St.Poison, 'status/poisoned'],
  [St.Stone, 'status/stunned'],
  [St.Shield, 'status/shield'],
  [St.Haste, 'status/haste'],
  [St.Bless, 'school/holy'],
  [St.Weaken, 'school/shadow'],
];

export function resolveCityKey(townName: string, biomeName = ''): CityKey {
  const lower = townName.toLowerCase();
  if (lower.includes('redmarsh') || lower.includes('fen') || lower.includes('marsh')) return 'redmarsh';
  if (lower.includes('oakhaven') || lower.includes('coast') || lower.includes('estuary')) return 'oakhaven';
  if (lower.includes('ironcamp') || lower.includes('caldera') || lower.includes('cinder') || lower.includes('ash')) return 'ironcamp';
  if (lower.includes('thornwick') || lower.includes('ford')) return 'thornwick';
  const b = biomeName.toLowerCase();
  if (b === 'marsh') return 'redmarsh';
  if (b === 'desert') return 'oakhaven';
  if (b === 'caldera' || b === 'volcanic') return 'ironcamp';
  return 'thornwick';
}

export function resolveCityFaction(city: CityKey): FactionKey {
  if (city === 'ironcamp') return 'ironbound';
  if (city === 'redmarsh') return 'conclave';
  return 'thornwatch';
}

export function resolveTownNpcKey(roleOrName: string): 'smith' | 'innkeeper' | 'mage' | 'priest' | 'guard' | 'villager' {
  const s = roleOrName.toLowerCase();
  if (s.includes('smith') || s.includes('forge') || s.includes('blacksmith')) return 'smith';
  if (s.includes('inn') || s.includes('tavern') || s.includes('keeper') || s.includes('merchant')) return 'innkeeper';
  if (s.includes('mage') || s.includes('wizard') || s.includes('arcane') || s.includes('scholar')) return 'mage';
  if (s.includes('priest') || s.includes('cleric') || s.includes('temple') || s.includes('healer')) return 'priest';
  if (s.includes('guard') || s.includes('captain') || s.includes('warden') || s.includes('watch')) return 'guard';
  return 'villager';
}

class SpritePool {
  readonly container = new Container();
  private readonly pool: Sprite[] = [];
  private used = 0;

  constructor(maxPrewarm = 0) {
    this.container.eventMode = 'none';
    for (let i = 0; i < maxPrewarm; i++) {
      const sp = new Sprite();
      sp.visible = false;
      this.pool.push(sp);
      this.container.addChild(sp);
    }
  }

  beginFrame(): void {
    this.used = 0;
  }

  acquire(
    atlas: PackedAtlas,
    key: string,
    x: number,
    y: number,
    opts?: {
      scaleX?: number;
      scaleY?: number;
      alpha?: number;
      tint?: number;
      rotation?: number;
      anchorX?: number;
      anchorY?: number;
    },
  ): Sprite | null {
    const tex: Texture | undefined = atlas.textures[key];
    if (!tex) return null;
    let sp = this.pool[this.used];
    if (!sp) {
      sp = new Sprite(tex);
      this.pool.push(sp);
      this.container.addChild(sp);
    } else if (sp.texture !== tex) {
      sp.texture = tex;
    }
    this.used++;
    const anc = atlas.anchors[key];
    sp.anchor.set(opts?.anchorX ?? anc?.x ?? 0.5, opts?.anchorY ?? anc?.y ?? 0.5);
    sp.position.set(x, y);
    sp.scale.set(opts?.scaleX ?? 1, opts?.scaleY ?? opts?.scaleX ?? 1);
    sp.alpha = opts?.alpha ?? 1;
    sp.tint = opts?.tint ?? 0xffffff;
    sp.rotation = opts?.rotation ?? 0;
    sp.visible = true;
    return sp;
  }

  endFrame(): void {
    for (let i = this.used; i < this.pool.length; i++) {
      if (this.pool[i]!.visible) this.pool[i]!.visible = false;
    }
  }
}

export interface AtlasOverlayRenderParams {
  sim: Sim;
  map: GameMap;
  atlases: ExtraAtlases | null;
  sprites: readonly (Sprite | UnitSprite)[];
  quality: number;
  reducedMotion: boolean;
  biomeName: string;
  vt: { x0: number; y0: number; x1: number; y1: number };
  telegraphs?: readonly RenderBossTelegraph[];
  adventureObjects?: readonly AdventureObjectDef[];
  waypoints?: readonly WaypointDef[];
}

export class AtlasOverlayPass {
  readonly groundLayer = new Container();
  readonly overlayLayer = new Container();

  private readonly telegraphPool = new SpritePool(16);
  private readonly propPool = new SpritePool(24);
  private readonly cityPool = new SpritePool(16);
  private readonly envPool = new SpritePool(24);
  private readonly npcPool = new SpritePool(12);
  private readonly projPool = new SpritePool(24);
  private readonly statusPool = new SpritePool(24);

  constructor() {
    this.groundLayer.eventMode = 'none';
    this.overlayLayer.eventMode = 'none';
    this.groundLayer.addChild(this.telegraphPool.container, this.cityPool.container);
    this.overlayLayer.addChild(
      this.propPool.container,
      this.envPool.container,
      this.npcPool.container,
      this.projPool.container,
      this.statusPool.container,
    );
  }

  render(p: AtlasOverlayRenderParams): void {
    this.telegraphPool.beginFrame();
    this.cityPool.beginFrame();
    this.propPool.beginFrame();
    this.envPool.beginFrame();
    this.npcPool.beginFrame();
    this.projPool.beginFrame();
    this.statusPool.beginFrame();

    const { sim, map, atlases, sprites, quality, reducedMotion, biomeName, vt } = p;
    if (!atlases) {
      this.endAll();
      return;
    }

    const animate = !reducedMotion && quality > 0;
    const frame6 = animate ? ((sim.tick >> 2) % 6) : 0;
    const frame4 = animate ? ((sim.tick >> 2) % 4) : 0;
    const frame2 = animate ? ((sim.tick >> 2) & 1) : 0;
    const mw = map.w;
    const minTx = Math.max(0, Math.floor(vt.x0) - 2);
    const maxTx = Math.min(mw - 1, Math.ceil(vt.x1) + 2);
    const minTy = Math.max(0, Math.floor(vt.y0) - 2);
    const maxTy = Math.min(map.h - 1, Math.ceil(vt.y1) + 2);

    const inViewTile = (tx: number, ty: number): boolean =>
      tx >= minTx && tx <= maxTx && ty >= minTy && ty <= maxTy && !!sim.explored[ty * mw + tx];

    // 1. Boss AoE Telegraphs (ground layer, below unit sprites)
    if (atlases.bossTelegraphs) {
      const sheet = atlases.bossTelegraphs;
      const explicit = p.telegraphs ?? [];
      const simList = (sim as unknown as { activeBossTelegraphs?: readonly RenderBossTelegraph[] }).activeBossTelegraphs ?? [];
      const allTelegraphs = explicit.length && simList.length ? [...explicit, ...simList] : explicit.length ? explicit : simList;
      for (const tg of allTelegraphs) {
        const step = Math.min(3, Math.max(0, Math.floor(tg.chargeRatio * 4)));
        const scale = Math.max(0.25, tg.radiusPx / 58);
        if (tg.shape === 'ring') {
          this.telegraphPool.acquire(sheet, `${tg.bossId}/ring`, tg.x, tg.y, { scaleX: scale, scaleY: scale, alpha: 0.9 });
          this.telegraphPool.acquire(sheet, `ring/fill-${step}`, tg.x, tg.y, { scaleX: scale, scaleY: scale, alpha: 0.72 });
        } else if (tg.shape === 'cone') {
          this.telegraphPool.acquire(sheet, `${tg.bossId}/cone`, tg.x, tg.y, {
            scaleX: scale,
            scaleY: scale,
            rotation: tg.angle ?? 0,
            alpha: 0.85,
            anchorX: 0.08,
            anchorY: 0.5,
          });
        } else if (tg.shape === 'line') {
          this.telegraphPool.acquire(sheet, `${tg.bossId}/line`, tg.x, tg.y, {
            scaleX: Math.max(0.4, tg.radiusPx / 180),
            scaleY: 0.9,
            rotation: tg.angle ?? 0,
            alpha: 0.88,
            anchorX: 0.0,
            anchorY: 0.5,
          });
        } else if (tg.shape === 'glyph') {
          this.telegraphPool.acquire(sheet, `${tg.bossId}/glyph`, tg.x, tg.y, { scaleX: scale, scaleY: scale, alpha: 0.92 });
        }
      }
      // Subtle ambient ground glyph under active visible bosses when enraged or charging ability
      for (let i = 0; i < sim.count; i++) {
        if (sim.cb.hp[i] <= 0 || !sprites[i]?.visible) continue;
        const fam = sim.cb.family[i];
        const boss = fam ? bossSpriteDef(fam) : undefined;
        if (!boss) continue;
        const bid = boss.id as TelegraphBossId;
        if (bid === 'morvessa' || bid === 'gorrathul' || bid === 'vesperion' || bid === 'ashkarath') {
          if (sim.cb.cd[i] > 0 && sim.cb.cd[i] <= 6) {
            const step = Math.min(3, Math.max(0, Math.floor(((6 - sim.cb.cd[i]) / 6) * 4)));
            this.telegraphPool.acquire(sheet, `${bid}/glyph`, sprites[i]!.x, sprites[i]!.y, { scaleX: 0.85, scaleY: 0.65, alpha: 0.45 });
            this.telegraphPool.acquire(sheet, `ring/fill-${step}`, sprites[i]!.x, sprites[i]!.y, { scaleX: 0.72, scaleY: 0.48, alpha: 0.35 });
          }
        }
      }
    }

    // 2. City Buildings & Animated Town Props
    if (sim.towns?.length) {
      for (const town of sim.towns) {
        const cityKey = resolveCityKey(town.def.name ?? '', biomeName);
        const faction = resolveCityFaction(cityKey);
        for (let role = 0; role < town.centre.length; role++) {
          const c = town.centre[role];
          if (!c) continue;
          const tx = Math.floor(c[0]);
          const ty = Math.floor(c[1]);
          if (!inViewTile(tx, ty)) continue;
          const bx = c[0] * TILE;
          const by = c[1] * TILE;

          if (atlases.cityBuildings) {
            const roleKey = CITY_ROLES[role % CITY_ROLES.length]!;
            this.cityPool.acquire(atlases.cityBuildings, `${cityKey}/${roleKey}`, bx, by + 18, {
              scaleX: 0.56,
              scaleY: 0.56,
              alpha: 0.94,
              anchorX: 0.5,
              anchorY: 0.9,
            });
          }

          if (atlases.envAnims) {
            const env = atlases.envAnims;
            this.envPool.acquire(env, `torch-flicker/${frame6}`, bx - 28, by + 20, { scaleX: 0.52, scaleY: 0.52 });
            this.envPool.acquire(env, `torch-flicker/${(frame6 + 3) % 6}`, bx + 28, by + 20, { scaleX: 0.52, scaleY: 0.52 });
            this.envPool.acquire(env, `banner/${faction}/${frame4}`, bx - 36, by + 10, { scaleX: 0.48, scaleY: 0.48 });
            if (role === 0) {
              this.envPool.acquire(env, `bonfire/${frame6}`, bx + 34, by + 18, { scaleX: 0.48, scaleY: 0.48 });
              this.envPool.acquire(env, `smoke-column/${frame6}`, bx + 6, by - 26, { scaleX: 0.5, scaleY: 0.5, alpha: 0.72 });
            } else if (role === 1) {
              this.envPool.acquire(env, `smoke-column/${(frame6 + 2) % 6}`, bx + 18, by - 20, { scaleX: 0.55, scaleY: 0.55, alpha: 0.76 });
            } else if (role === 2) {
              this.envPool.acquire(env, `cauldron/${frame6}`, bx + 30, by + 14, { scaleX: 0.5, scaleY: 0.5 });
            }
          }
        }

        // 3. Town NPCs idle animations
        if (atlases.townnpcs && town.def.npcs?.length) {
          for (const npc of town.def.npcs) {
            if (!inViewTile(Math.floor(npc.x), Math.floor(npc.y))) continue;
            const roleKey = resolveTownNpcKey(`${npc.name ?? ''} ${npc.text ?? ''}`);
            this.npcPool.acquire(
              atlases.townnpcs,
              `${roleKey}/idle/${frame4}`,
              (npc.x + 0.5) * TILE,
              (npc.y + 0.5) * TILE,
              { scaleX: 0.72, scaleY: 0.72, anchorX: 0.5, anchorY: 0.88 },
            );
          }
        }
      }
    }

    // 4. Shrines, Adventure Objects, Waypoints (props-wave2)
    if (atlases.propsWave2) {
      const props = atlases.propsWave2;
      for (let n = 0; n < sim.shrines.length; n++) {
        const shDef = sim.shrines[n]!;
        if (!inViewTile(shDef.x, shDef.y)) continue;
        const ready = sim.shrineCd[n] === 0;
        const sKey = shDef.kind === 'healing' ? 'shrines/healing' : shDef.kind === 'mana' ? 'shrines/mana' : 'shrines/war';
        this.propPool.acquire(props, sKey, (shDef.x + 0.5) * TILE, (shDef.y + 0.65) * TILE, {
          scaleX: 0.64,
          scaleY: 0.64,
          alpha: ready ? 1 : 0.62,
          tint: ready ? 0xffffff : 0x9e9a94,
        });
      }

      if (p.adventureObjects?.length) {
        for (const obj of p.adventureObjects) {
          if (!inViewTile(obj.x, obj.y)) continue;
          const px = (obj.x + 0.5) * TILE;
          const py = (obj.y + 0.6) * TILE;
          if (obj.kind === 'magic_well' || obj.kind === 'fountain_of_youth') {
            this.propPool.acquire(props, 'props/well', px, py, { scaleX: 0.65, scaleY: 0.65, tint: obj.visited ? 0xa8a49c : 0xffffff });
          } else if (obj.kind === 'creature_bank') {
            this.propPool.acquire(props, obj.visited ? 'chests/rare-open' : 'props/cave-mouth', px, py, { scaleX: 0.68, scaleY: 0.68 });
          } else {
            this.propPool.acquire(props, obj.visited ? 'chests/common-open' : 'chests/common-closed', px, py, { scaleX: 0.68, scaleY: 0.68 });
            if (atlases.envAnims && obj.kind === 'watermill') {
              this.envPool.acquire(atlases.envAnims, `water-wheel/${frame6}`, px + 14, py - 4, { scaleX: 0.56, scaleY: 0.56 });
            }
          }
        }
      }

      if (p.waypoints?.length) {
        for (const wp of p.waypoints) {
          if (!inViewTile(Math.floor(wp.x), Math.floor(wp.y))) continue;
          this.propPool.acquire(props, 'lights/waystone', (wp.x + 0.5) * TILE, (wp.y + 0.65) * TILE, {
            scaleX: 0.66,
            scaleY: 0.66,
          });
        }
      }
    }

    // 5. Projectiles & Trails (projectiles atlas)
    if (atlases.projectiles && quality > 0) {
      const sheet = atlases.projectiles;
      const cb = sim.cb;
      const k = TILE / FP;
      for (let pIdx = 0; pIdx < cb.pAlive.length; pIdx++) {
        if (!cb.pAlive[pIdx]) continue;
        const tx = Math.floor(cb.pX[pIdx] / FP);
        const ty = Math.floor(cb.pY[pIdx] / FP);
        if (!inViewTile(tx, ty)) continue;
        const sid = cb.pS[pIdx] - 1;
        if (sid >= 24 && sid <= 31) continue; // aura/field visuals use vector overlay

        const wx = cb.pX[pIdx] * k;
        const wy = cb.pY[pIdx] * k - 14;
        const tgt = cb.pT[pIdx];
        const dx = tgt >= 0 && tgt < sim.count ? sim.x[tgt] - cb.pX[pIdx] : 1;
        const dy = tgt >= 0 && tgt < sim.count ? sim.y[tgt] - cb.pY[pIdx] : 0;
        const angle = Math.atan2(dy, dx);
        const el = cb.pEl[pIdx];

        let projKey = 'arrow/0';
        let trailKey = 'arrow/trail-0';
        if (el === 1) {
          projKey = `fireball/${frame2}`;
          trailKey = `fireball/trail-${frame2}`;
        } else if (el === 2 || el === 3) {
          projKey = `frost-shard/${frame2}`;
          trailKey = `frost-shard/trail-${frame2}`;
        } else if (el === 5) {
          projKey = `shadow-orb/${frame2}`;
          trailKey = `shadow-orb/trail-${frame2}`;
        } else if (el === 4) {
          projKey = `thrown-axe/${frame4}`;
          trailKey = 'thrown-axe/trail-0';
        } else if (cb.pS[pIdx] > 0) {
          projKey = 'bolt/0';
          trailKey = 'bolt/trail-0';
        }

        const backX = wx - Math.cos(angle) * 10;
        const backY = wy - Math.sin(angle) * 10;
        this.projPool.acquire(sheet, trailKey, backX, backY, { rotation: angle, scaleX: 0.72, scaleY: 0.72, alpha: 0.78 });
        this.projPool.acquire(sheet, projKey, wx, wy, { rotation: angle, scaleX: 0.8, scaleY: 0.8 });
      }
    }

    // 6. Status Icons over units (spellicons status/*)
    if (atlases.spellicons && quality > 0) {
      const sheet = atlases.spellicons;
      const cb = sim.cb;
      for (let i = 0; i < sim.count; i++) {
        const s = sprites[i];
        if (!s || !s.visible || cb.hp[i] <= 0) continue;
        const mask = cb.stMask[i];
        if (!mask) continue;
        const y = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y - 12;
        let drawn = 0;
        for (const [bit, key] of STATUS_FRAME_KEYS) {
          if (!(mask & (1 << bit))) continue;
          this.statusPool.acquire(sheet, key, s.x - 10 + drawn * 11, y, { scaleX: 0.23, scaleY: 0.23, anchorX: 0.5, anchorY: 0.5 });
          drawn++;
          if (drawn >= 4) break;
        }
      }
    }

    this.endAll();
  }

  private endAll(): void {
    this.telegraphPool.endFrame();
    this.cityPool.endFrame();
    this.propPool.endFrame();
    this.envPool.endFrame();
    this.npcPool.endFrame();
    this.projPool.endFrame();
    this.statusPool.endFrame();
  }
}
