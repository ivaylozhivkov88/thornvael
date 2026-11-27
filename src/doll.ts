import { Cls, kitCls } from './sim/item-types';
import extraLayersJson from './doll-layers.json';

/** Paperdoll: painted overlay layers on a painted base body. Layers are cut from our own
 * generated renders (tools/make-doll-layers.py or tools/extract-layer.py). Percent boxes are relative to the base image, or full-canvas (inset: 0). */
export interface DollLayer { file: string; x: number; y: number; w: number; h: number; full?: boolean }
interface DollSet { base: string; baseFilter?: string; layerFilter?: string; layers: Record<string, DollLayer> }

const EXTRA_LAYERS = extraLayersJson as Record<'warrior-m' | 'warrior-f' | 'mage-m' | 'mage-f', Record<string, DollLayer>>;

const LAYER_ORDER: Readonly<Record<string, number>> = {
  back: 0,
  boots: 1,
  armor: 2,
  gloves: 3,
  'gloves-l': 3,
  'gloves-r': 3,
  shield: 4,
  'offhand-mage': 4,
  helm: 5,
  weapon: 6,
  front: 7,
};

function layerOrderOf(key: string): number {
  const slot = key.split(':')[0]!;
  return LAYER_ORDER[slot] ?? 6;
}

/** Non-sword warrior weapons, painted by tools/gen-doll-weapons.py (shared by both warrior bodies). */
const WARRIOR_WEAPONS: Record<string, DollLayer> = {
  'weapon-bow': { file: 'warrior-weapon-bow.png', x: 26.13, y: 28.88, w: 10.05, h: 49.88 },
  'weapon-axe': { file: 'warrior-weapon-axe.png', x: 10.55, y: 48.38, w: 30.49, h: 32.38 },
  'weapon-mace': { file: 'warrior-weapon-mace.png', x: 15.75, y: 48.88, w: 24.62, h: 26.88 },
  'weapon-spear': { file: 'warrior-weapon-spear.png', x: 22.95, y: 4.75, w: 23.45, h: 90.38 },
  'weapon-dagger': { file: 'warrior-weapon-dagger.png', x: 26.3, y: 49.38, w: 13.07, h: 16.5 },
};

const SETS: Record<string, DollSet> = {
  'warrior-m': {
    base: 'warrior-m-base.jpg',
    layers: {
      ...EXTRA_LAYERS['warrior-m'],
      'armor': { file: 'warrior-m-armor-plate.png', x: 33.54, y: 17.5, w: 36.1, h: 28.17 },
      'shield': { file: 'warrior-m-shield-round.png', x: 54.52, y: 35.46, w: 24.33, h: 25.58 },
      'boots': { file: 'warrior-m-boots-riveted.png', x: 30.86, y: 71.49, w: 35.21, h: 26.06 },
      'weapon': { file: 'warrior-m-sword-long.png', x: 9.26, y: 46.81, w: 29.78, h: 37.45 },
      'gloves': { file: 'warrior-m-gloves-gauntlet.png', x: 29.07, y: 44.19, w: 33.45, h: 14.07 },
      'helm': { file: 'warrior-m-helm-plume.png', x: 40.96, y: 2.33, w: 26.06, h: 21.46 },
      ...WARRIOR_WEAPONS,
    },
  },
  'warrior-f': {
    base: 'warrior-f-base.jpg',
    layers: {
      ...EXTRA_LAYERS['warrior-f'],
      'armor': { file: 'warrior-f-armor-plate.png', x: 33.81, y: 16.44, w: 36.07, h: 39.96 },
      'shield': { file: 'warrior-f-shield-round.png', x: 57.18, y: 34.57, w: 23.99, h: 26.08 },
      'boots': { file: 'warrior-f-boots-riveted.png', x: 32.62, y: 71.32, w: 35.15, h: 25.79 },
      'gloves': { file: 'warrior-f-gloves-gauntlet.png', x: 29.3, y: 40.5, w: 41.67, h: 19.54 },
      'weapon': { file: 'warrior-f-sword-long.png', x: 18.82, y: 44.04, w: 19.76, h: 44.12 },
      'helm': { file: 'warrior-f-helm-crest.png', x: 43.26, y: 1.91, w: 18.31, h: 19.06 },
      ...WARRIOR_WEAPONS,
    },
  },
  'mage-m': {
    base: 'mage-m-base.jpg',
    layers: {
      ...EXTRA_LAYERS['mage-m'],
      'armor': { file: 'mage-m-armor.png', x: 29.72, y: 17.65, w: 43.84, h: 66.14 },
      'boots': { file: 'mage-m-boots-tall.png', x: 33.17, y: 81.1, w: 31.96, h: 16.51 },
      'gloves': { file: 'mage-m-gloves-rune.png', x: 31.65, y: 48.29, w: 36.58, h: 12.35 },
      'weapon': { file: 'mage-m-staff-crystal.png', x: 17.77, y: 8.6, w: 23.38, h: 85.56 },
      'helm': { file: 'mage-m-helm-wizard.png', x: 33.19, y: 1.21, w: 33.72, h: 16.76 },
    },
  },
  'mage-f': {
    base: 'mage-f-base.jpg',
    layers: {
      ...EXTRA_LAYERS['mage-f'],
      'armor': { file: 'mage-f-armor.png', x: 30, y: 6.11, w: 39.88, h: 90.86 },
      'helm': { file: 'mage-f-hat.png', x: 31.67, y: 2.19, w: 36.89, h: 16.63 },
      'boots': { file: 'mage-f-boots.png', x: 35.8, y: 82.94, w: 31.78, h: 14.34 },
      'gloves': { file: 'mage-f-gloves.png', x: 34.89, y: 47.5, w: 33.62, h: 11.7 },
      'weapon': { file: 'mage-f-staff.png', x: 70.05, y: 6.27, w: 15.36, h: 87.91 },
    },
  },
  'archer-m': {
    base: 'warrior-m-base.jpg',
    baseFilter: 'hue-rotate(85deg) saturate(0.85) brightness(0.95)',
    layerFilter: 'hue-rotate(70deg) saturate(0.8) brightness(0.95)',
    layers: {
      ...EXTRA_LAYERS['warrior-m'],
      'armor': { file: 'warrior-m-armor-plate.png', x: 33.54, y: 17.5, w: 36.1, h: 28.17 },
      'boots': { file: 'warrior-m-boots-riveted.png', x: 30.86, y: 71.49, w: 35.21, h: 26.06 },
      'weapon': { file: 'warrior-m-sword-long.png', x: 9.26, y: 46.81, w: 29.78, h: 37.45 },
      'gloves': { file: 'warrior-m-gloves-gauntlet.png', x: 29.07, y: 44.19, w: 33.45, h: 14.07 },
      'helm': { file: 'warrior-m-helm-plume.png', x: 40.96, y: 2.33, w: 26.06, h: 21.46 },
      ...WARRIOR_WEAPONS,
    },
  },
  'archer-f': {
    base: 'warrior-f-base.jpg',
    baseFilter: 'hue-rotate(85deg) saturate(0.85) brightness(0.95)',
    layerFilter: 'hue-rotate(70deg) saturate(0.8) brightness(0.95)',
    layers: {
      ...EXTRA_LAYERS['warrior-f'],
      'armor': { file: 'warrior-f-armor-plate.png', x: 33.81, y: 16.44, w: 36.07, h: 39.96 },
      'boots': { file: 'warrior-f-boots-riveted.png', x: 32.62, y: 71.32, w: 35.15, h: 25.79 },
      'gloves': { file: 'warrior-f-gloves-gauntlet.png', x: 29.3, y: 40.5, w: 41.67, h: 19.54 },
      'weapon': { file: 'warrior-f-sword-long.png', x: 18.82, y: 44.04, w: 19.76, h: 44.12 },
      'helm': { file: 'warrior-f-helm-crest.png', x: 43.26, y: 1.91, w: 18.31, h: 19.06 },
      ...WARRIOR_WEAPONS,
    },
  },
  'necromancer-m': {
    base: 'mage-m-base.jpg',
    baseFilter: 'saturate(0.45) contrast(1.12) brightness(0.85)',
    layerFilter: 'saturate(0.4) contrast(1.1) brightness(0.85)',
    layers: {
      ...EXTRA_LAYERS['mage-m'],
      'armor': { file: 'mage-m-armor.png', x: 29.72, y: 17.65, w: 43.84, h: 66.14 },
      'boots': { file: 'mage-m-boots-tall.png', x: 33.17, y: 81.1, w: 31.96, h: 16.51 },
      'gloves': { file: 'mage-m-gloves-rune.png', x: 31.65, y: 48.29, w: 36.58, h: 12.35 },
      'weapon': { file: 'mage-m-staff-crystal.png', x: 17.77, y: 8.6, w: 23.38, h: 85.56 },
      'helm': { file: 'mage-m-helm-wizard.png', x: 33.19, y: 1.21, w: 33.72, h: 16.76 },
    },
  },
  'necromancer-f': {
    base: 'mage-f-base.jpg',
    baseFilter: 'saturate(0.45) contrast(1.12) brightness(0.85)',
    layerFilter: 'saturate(0.4) contrast(1.1) brightness(0.85)',
    layers: {
      ...EXTRA_LAYERS['mage-f'],
      'armor': { file: 'mage-f-armor.png', x: 30, y: 6.11, w: 39.88, h: 90.86 },
      'helm': { file: 'mage-f-hat.png', x: 31.67, y: 2.19, w: 36.89, h: 16.63 },
      'boots': { file: 'mage-f-boots.png', x: 35.8, y: 82.94, w: 31.78, h: 14.34 },
      'gloves': { file: 'mage-f-gloves.png', x: 34.89, y: 47.5, w: 33.62, h: 11.7 },
      'weapon': { file: 'mage-f-staff.png', x: 70.05, y: 6.27, w: 15.36, h: 87.91 },
    },
  },
};

export function dollSet(cls: number, female: boolean): DollSet | null {
  const names = ['warrior', 'mage', 'archer', 'necromancer'] as const;
  const role = names[cls] ?? (kitCls(cls) === Cls.Mage ? 'mage' : 'warrior');
  return SETS[`${role}-${female ? 'f' : 'm'}`] ?? null;
}

const SLOT_KEY = ['weapon', 'shield', 'helm', 'armor', 'boots', null, null, 'gloves'] as const;

const WEAPON_KINDS: Array<[string, RegExp]> = [
  ['spear', /spear|pike|lance|halberd|glaive/],
  ['bow', /bow|arbalest|windpiercer/],
  ['axe', /axe|cleaver|decapitator/],
  ['mace', /mace|cudgel|morningstar|hammer|maul|club|flail/],
  ['dagger', /dagger|stiletto|rondel|poignard|gauche|dirk|needle|knife/],
];

/** Weapon family by item name; null keeps the set's default painted weapon (sword or staff). */
export function weaponKind(name: string): string | null {
  const n = name.toLowerCase();
  return WEAPON_KINDS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** Non-plate armour reuses the painted plate shapes with a material colouring. */
export function materialFilter(name: string): string {
  const n = name.toLowerCase();
  if (/leather|hide|jerkin/.test(n)) return 'sepia(.85) saturate(1.7) brightness(.68)';
  if (/cloth|robe|tunic|padded|gambeson|quilted|silk|linen/.test(n)) return 'sepia(.55) saturate(.7) brightness(1.18) contrast(.8)';
  if (/chain|\bmail\b|ringmail/.test(n)) return 'grayscale(.5) brightness(.76) contrast(1.35)';
  return '';
}

const SHIELD_KINDS: Array<[string, RegExp]> = [
  ['buckler', /buckler/],
  ['kite', /kite/],
  ['targe', /targe/],
  ['tower', /tower|pavise/],
];

const OFFHAND_KINDS: Array<[string, RegExp]> = [
  ['orb', /orb|sphere/],
  ['tome', /tome|notes|codex|grimoire/],
  ['mirror', /mirror|astrolabe/],
  ['focus', /focus|prism|lens|eye|scales/],
];

/** Layer key for a slot: a unique item with its own painted look ('slot:Item Name') wins over the generic slot look. */
export function lookFor(set: DollSet, slot: number, _tier: number, name?: string): string | null {
  const k = SLOT_KEY[slot];
  if (!k) return null;
  if (name && set.layers[`${k}:${name}`]) return `${k}:${name}`;
  if (k === 'shield' && name) {
    if (set.layers[`offhand-mage:${name}`]) return `offhand-mage:${name}`;
    const n = name.toLowerCase();
    const sk = SHIELD_KINDS.find(([, re]) => re.test(n))?.[0];
    if (sk && set.layers[`shield-${sk}`]) return `shield-${sk}`;
    const ok = OFFHAND_KINDS.find(([, re]) => re.test(n))?.[0];
    if (ok && set.layers[`offhand-mage-${ok}`]) return `offhand-mage-${ok}`;
  }
  const kind = k === 'weapon' && name ? weaponKind(name) : null;
  if (kind && set.layers[`weapon-${kind}`]) return `weapon-${kind}`;
  return set.layers[k] ? k : null;
}

/** Tier tint (item tier 1..5): rusty bronze, plain steel, bright, gilded, mystic violet. Layers stay shared. */
const TIER_FILTER: Record<number, string> = {
  1: 'sepia(.45) saturate(.8) brightness(.9)',
  3: 'saturate(1.1) brightness(1.06)',
  4: 'sepia(.35) saturate(1.8) hue-rotate(-12deg) brightness(1.1)',
  5: 'saturate(1.5) hue-rotate(230deg) brightness(1.1)',
};
export const tierFilter = (tier: number): string => TIER_FILTER[tier] ?? '';

export type DollKey = { key: string; tier: number; filter?: string };

/** The painted figure wearing what `defAt` reports per equipment slot. */
export function wornDoll(set: DollSet, defAt: (slot: number) => { name: string; tier?: number } | undefined, base: string): HTMLElement {
  const keys: DollKey[] = [];
  // draw order: armor, boots, gloves, weapon, shield, helm
  for (const slot of [3, 4, 7, 0, 1, 2]) {
    const def = defAt(slot);
    if (!def) continue;
    if (slot === 7 && set.layers[`gloves-l:${def.name}`] && set.layers[`gloves-r:${def.name}`]) {
      const t = def.tier ?? 1;
      const f = materialFilter(def.name);
      keys.push({ key: `gloves-l:${def.name}`, tier: t, filter: f });
      keys.push({ key: `gloves-r:${def.name}`, tier: t, filter: f });
      continue;
    }
    const key = lookFor(set, slot, def.tier ?? 1, def.name);
    if (key) keys.push({ key, tier: def.tier ?? 1, filter: slot > 1 ? materialFilter(def.name) : '' });
  }
  return buildDoll(set, keys, base);
}

export function buildDoll(set: DollSet, keys: Array<string | DollKey>, base: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'doll-stack';
  const img = document.createElement('img');
  img.src = `${base}townart/doll/${set.base}`;
  img.alt = '';
  if (set.baseFilter) img.style.filter = set.baseFilter;
  box.append(img);
  const sorted = [...keys].sort((a, b) => {
    const ka = typeof a === 'string' ? a : a.key;
    const kb = typeof b === 'string' ? b : b.key;
    return layerOrderOf(ka) - layerOrderOf(kb);
  });
  for (const e of sorted) {
    const k = typeof e === 'string' ? e : e.key;
    const l = set.layers[k];
    if (!l) continue;
    const o = document.createElement('img');
    o.className = 'doll-layer';
    o.src = `${base}townart/doll/${l.file}`;
    o.alt = '';
    const f = typeof e === 'string' ? '' : e.filter || tierFilter(e.tier);
    const filters = [set.layerFilter ?? '', f].filter(Boolean).join(' ');
    const pos = l.full || (l.x === 0 && l.y === 0 && l.w === 100 && l.h === 100)
      ? 'inset:0;width:100%;height:100%;'
      : `left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%;`;
    o.style.cssText = `${pos}background:transparent;border:none;box-shadow:none;outline:none;${filters ? `filter:${filters};` : ''}`;
    box.append(o);
  }
  return box;
}
