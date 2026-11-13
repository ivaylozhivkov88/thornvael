/** Paperdoll: painted overlay layers on a painted base body. Layers are cut from our own
 * generated renders (tools/make-doll-layers.py). Percent boxes are relative to the base image. */
export interface DollLayer { file: string; x: number; y: number; w: number; h: number }
interface DollSet { base: string; layers: Record<string, DollLayer> }

const SETS: Record<string, DollSet> = {
  'warrior-m': {
    base: 'warrior-m-base.jpg',
    layers: {
      'armor': { file: 'warrior-m-armor-plate.png', x: 33.54, y: 17.5, w: 36.1, h: 28.17 },
      'shield': { file: 'warrior-m-shield-round.png', x: 54.52, y: 35.46, w: 24.33, h: 25.58 },
      'boots': { file: 'warrior-m-boots-riveted.png', x: 30.86, y: 71.49, w: 35.21, h: 26.06 },
      'weapon': { file: 'warrior-m-sword-long.png', x: 9.26, y: 46.81, w: 29.78, h: 37.45 },
      'gloves': { file: 'warrior-m-gloves-gauntlet.png', x: 29.07, y: 44.19, w: 33.45, h: 14.07 },
      'helm': { file: 'warrior-m-helm-plume.png', x: 40.96, y: 2.33, w: 26.06, h: 21.46 },
    },
  },
  'mage-m': {
    base: 'mage-m-base.jpg',
    layers: {
      'armor': { file: 'mage-m-armor.png', x: 29.72, y: 17.65, w: 43.84, h: 66.14 },
    },
  },
};

export function dollSet(cls: number, female: boolean): DollSet | null {
  return SETS[`${cls ? 'mage' : 'warrior'}-${female ? 'f' : 'm'}`] ?? null;
}

const SLOT_KEY = ['weapon', 'shield', 'helm', 'armor', 'boots', null, null, 'gloves'] as const;

/** Layer key for a slot: a unique item with its own painted look ('slot:Item Name') wins over the generic slot look. */
export function lookFor(set: DollSet, slot: number, _tier: number, name?: string): string | null {
  const k = SLOT_KEY[slot];
  if (!k) return null;
  if (name && set.layers[`${k}:${name}`]) return `${k}:${name}`;
  return set.layers[k] ? k : null;
}

export function buildDoll(set: DollSet, keys: string[], base: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'doll-stack';
  const img = document.createElement('img');
  img.src = `${base}townart/doll/${set.base}`;
  img.alt = '';
  box.append(img);
  for (const k of keys) {
    const l = set.layers[k];
    if (!l) continue;
    const o = document.createElement('img');
    o.className = 'doll-layer';
    o.src = `${base}townart/doll/${l.file}`;
    o.alt = '';
    o.style.cssText = `left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%`;
    box.append(o);
  }
  return box;
}
