import { Container, Graphics, type Sprite, Text } from 'pixi.js';
import { BOSS_MOD_LABELS, BOSS_SIGNATURE_ABILITIES } from './monster-info';
import { DEFS, Kind } from './sim/combat';
import { monsterFamilyById } from './sim/data';
import type { Sim } from './sim/sim';
import { getSuperUniqueById } from './sim/super-uniques';
import { UnitSprite, bossSpriteDef } from './sprites/units';

export interface UnitPlateData {
  name: string;
  nameColor: number;
  affixes: string;
  affixColor: number;
  isEnemy: boolean;
  isElite: boolean;
  isChampion: boolean;
  hp: number;
  hpMax: number;
}

export function getUnitPlateData(sim: Sim, i: number): UnitPlateData {
  const cb = sim.cb;
  const isMine = sim.team[i] === 0;
  const hp = Math.max(0, cb.hp[i]);
  const hpMax = Math.max(1, cb.hpMax[i]);
  const kind = cb.kind[i];
  const famId = cb.family[i] ?? '';
  const mods = (cb.bossMods[i] ?? []) as readonly string[];
  const isHero = sim.hero?.id === i;

  if (isMine) {
    let name = 'Ally';
    if (isHero || kind === Kind.Hero) {
      name = sim.hero ? (sim.hero.cls ? 'Battle Mage' : 'Warrior') : 'Hero';
    } else if (kind === Kind.Archer) {
      name = 'Rogue Archer';
    } else if (kind === Kind.Golem) {
      name = 'Stone Golem';
    } else if (kind === Kind.Imp) {
      name = 'Summoned Imp';
    } else if (kind === Kind.Warrior) {
      name = 'Mercenary Warrior';
    } else if (kind === Kind.Mage) {
      name = 'Sorceress';
    } else {
      name = DEFS[kind]?.name ?? 'Ally';
    }
    return {
      name,
      nameColor: isHero || kind === Kind.Hero ? 0xffdf78 : 0x8ae0ff,
      affixes: '',
      affixColor: 0x8ae0ff,
      isEnemy: false,
      isElite: false,
      isChampion: false,
      hp,
      hpMax,
    };
  }

  // Enemy unit
  const su = famId ? getSuperUniqueById(famId) : null;
  const fam = famId ? monsterFamilyById(famId) : null;
  const isChamp = mods.includes('champion') || (mods.length === 1 && !su);
  const nonChampMods = mods.filter((m) => m !== 'champion');
  const isSuper = !isChamp && (!!su || !!bossSpriteDef(famId) || nonChampMods.length >= 2 || (cb.tier[i] ?? 1) >= 5);

  let name = '';
  if (su) {
    name = su.name;
  } else if (fam) {
    name = fam.name;
  } else {
    name = DEFS[kind]?.name ?? 'Monster';
  }

  let nameColor = 0xffffff; // Trash mob: White (#FFFFFF)
  if (isSuper) {
    nameColor = 0xf5c042; // Unique / Elite bosses & Super-Uniques: Gold (#f5c042)
  } else if (isChamp) {
    nameColor = 0x48a0ff; // Champions: Blue (#48a0ff)
    if (!name.endsWith('Champion')) {
      name = `${name} Champion`;
    }
  }

  // Special abilities / affixes directly UNDER the name:
  // e.g. Extra Fast · Lightning Enchanted · Stone Skin
  const affixList: string[] = [];
  const effectiveMods = mods.length > 0 ? mods : (su ? su.mods : []);
  for (const m of effectiveMods) {
    if (m === 'champion') continue;
    const label = BOSS_MOD_LABELS[m] ?? m.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if (label && !affixList.includes(label)) affixList.push(label);
  }

  if (affixList.length === 0 && famId && BOSS_SIGNATURE_ABILITIES[famId]) {
    const summary = BOSS_SIGNATURE_ABILITIES[famId].summary;
    if (summary) {
      const parts = summary.split(',').map((s) => s.trim());
      for (const p of parts) if (p && !affixList.includes(p)) affixList.push(p);
    }
  }

  const affixes = affixList.join(' · ');
  const affixColor = 0x5ce6f8; // Classic ARPG Cyan

  return {
    name,
    nameColor,
    affixes,
    affixColor,
    isEnemy: true,
    isElite: isSuper,
    isChampion: isChamp,
    hp,
    hpMax,
  };
}

class PlateEntry {
  readonly root = new Container();
  readonly gfx = new Graphics();
  readonly nameText: Text;
  readonly affixText: Text;
  activeUnitId = -1;

  constructor() {
    this.nameText = new Text({
      text: '',
      style: {
        fontFamily: 'Cinzel, Georgia, "Times New Roman", serif',
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3.5 },
      },
    });
    this.nameText.anchor.set(0.5, 1);

    this.affixText = new Text({
      text: '',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.3,
        fill: 0x5ce6f8,
        stroke: { color: 0x000000, width: 2.5 },
      },
    });
    this.affixText.anchor.set(0.5, 1);

    this.root.addChild(this.gfx, this.nameText, this.affixText);
    this.root.visible = false;
  }

  render(data: UnitPlateData, x: number, y: number): void {
    this.root.position.set(x, y);
    this.root.visible = true;

    if (this.nameText.text !== data.name) {
      this.nameText.text = data.name;
    }
    if (this.nameText.style.fill !== data.nameColor) {
      this.nameText.style.fill = data.nameColor;
    }

    const hasAffixes = data.affixes.length > 0;
    this.affixText.visible = hasAffixes;
    if (hasAffixes) {
      if (this.affixText.text !== data.affixes) {
        this.affixText.text = data.affixes;
      }
      if (this.affixText.style.fill !== data.affixColor) {
        this.affixText.style.fill = data.affixColor;
      }
      this.affixText.position.set(0, -4);
      this.nameText.position.set(0, -20);
    } else {
      this.nameText.position.set(0, -6);
    }

    // Health bar sits directly ABOVE the name
    const barY = hasAffixes ? -42 : -28;
    const w = data.isElite ? 104 : data.isChampion ? 92 : 82;
    const barH = 6;

    const g = this.gfx;
    g.clear();

    // 1. Dark outer border and shadow bevel
    g.rect(-w / 2 - 2, barY - 2, w + 4, barH + 4).fill(0x0a0806);
    g.rect(-w / 2 - 2, barY - 2, w + 4, barH + 4).stroke({
      color: data.isElite ? 0x6e5220 : data.isChampion ? 0x224466 : 0x241d15,
      width: 1,
    });

    // 2. Gothic metallic end brackets for Champions and Elites / Super-Uniques
    if (data.isElite || data.isChampion) {
      const capCol = data.isElite ? 0xf5c042 : 0x48a0ff;
      // Left bracket
      g.rect(-w / 2 - 3, barY - 3, 2, barH + 6).fill(capCol);
      // Right bracket
      g.rect(w / 2 + 1, barY - 3, 2, barH + 6).fill(capCol);
      // Center jewel pip
      g.rect(-1, barY - 3, 2, 2).fill(capCol);
    }

    // 3. Depleted HP channel
    g.rect(-w / 2, barY, w, barH).fill(data.isEnemy ? 0x220505 : 0x051e05);

    // 4. Current HP fill with 3D bevel (highlight top line, rich main body, deep shadow bottom line)
    const pct = Math.max(0, Math.min(1, data.hp / Math.max(1, data.hpMax)));
    const fillW = Math.round(w * pct);
    if (fillW > 0) {
      if (data.isEnemy) {
        // Classic rich red body
        g.rect(-w / 2, barY, fillW, barH).fill(0xd01818);
        // Highlight top line
        g.rect(-w / 2, barY, fillW, 1.5).fill(0xff5555);
        // Shadow bottom line
        g.rect(-w / 2, barY + barH - 1.5, fillW, 1.5).fill(0x750808);
      } else {
        // Emerald green ally body
        g.rect(-w / 2, barY, fillW, barH).fill(0x2eb82e);
        // Highlight top line
        g.rect(-w / 2, barY, fillW, 1.5).fill(0x6ef86e);
        // Shadow bottom line
        g.rect(-w / 2, barY + barH - 1.5, fillW, 1.5).fill(0x115c11);
      }
    }
  }

  hide(): void {
    this.root.visible = false;
    this.activeUnitId = -1;
  }
}

export class OverheadNameplateLayer {
  readonly container = new Container();
  private readonly pool: PlateEntry[] = [];
  private readonly activeUnitIds = new Set<number>();

  constructor(poolSize = 4) {
    for (let i = 0; i < poolSize; i++) {
      const entry = new PlateEntry();
      this.pool.push(entry);
      this.container.addChild(entry.root);
    }
  }

  hasPlate(unitId: number): boolean {
    return this.activeUnitIds.has(unitId);
  }

  update(
    sim: Sim,
    sprites: readonly (Sprite | UnitSprite)[],
    zoom: number,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    v: { hoverUnit?: number | null; hover?: { id: number; ok: boolean } | null; selected: ReadonlySet<number> },
  ): void {
    this.activeUnitIds.clear();

    // Determine target unit IDs to show
    const targetUnitIds: number[] = [];

    // 1. Hovered unit has highest priority (enemy, friend, hero)
    const hoverId = v.hoverUnit ?? v.hover?.id ?? null;
    if (hoverId !== null && hoverId >= 0 && hoverId < sim.count && sim.cb.hp[hoverId] > 0) {
      targetUnitIds.push(hoverId);
    }

    // 2. Targeted enemy of hero (if not already hovered)
    if (sim.hero && sim.cb.hp[sim.hero.id] > 0) {
      const heroTgt = sim.cb.tgt[sim.hero.id];
      if (heroTgt >= 0 && heroTgt < sim.count && sim.team[heroTgt] !== 0 && sim.cb.hp[heroTgt] > 0) {
        if (!targetUnitIds.includes(heroTgt)) {
          targetUnitIds.push(heroTgt);
        }
      }
    }

    // 3. Single selected friendly unit (e.g. hero or ally selected and no other unit hovered)
    if (targetUnitIds.length < this.pool.length) {
      for (const selId of v.selected) {
        if (selId >= 0 && selId < sim.count && sim.cb.hp[selId] > 0) {
          if (!targetUnitIds.includes(selId)) {
            targetUnitIds.push(selId);
            if (targetUnitIds.length >= 2) break; // keep display focused
          }
        }
      }
    }

    let plateIdx = 0;
    for (const uid of targetUnitIds) {
      if (plateIdx >= this.pool.length) break;
      const s = sprites[uid];
      if (!s || !s.visible || sim.cb.hp[uid] <= 0) continue;

      const headY = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;
      const sx = Math.round(s.x * zoom - camX);
      const sy = Math.round(headY * zoom - camY);

      // Visibility bounds check
      if (sx < -80 || sx > viewW + 80 || sy < -60 || sy > viewH + 60) continue;

      const clampedX = Math.max(60, Math.min(viewW - 60, sx));
      const clampedY = Math.max(50, Math.min(viewH - 16, sy));

      const data = getUnitPlateData(sim, uid);
      const entry = this.pool[plateIdx];
      entry.activeUnitId = uid;
      entry.render(data, clampedX, clampedY);
      this.activeUnitIds.add(uid);
      plateIdx++;
    }

    // Hide remaining unused entries in pool
    for (let i = plateIdx; i < this.pool.length; i++) {
      this.pool[i].hide();
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
