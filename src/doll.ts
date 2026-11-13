/** Paperdoll: painted overlay layers on a painted base body. Layers are cut from our own
 * generated renders (tools/make-doll-layers.py). Percent boxes are relative to the base image. */
export interface DollLayer { file: string; x: number; y: number; w: number; h: number }
interface DollSet { base: string; layers: Record<string, DollLayer> }

const SETS: Record<string, DollSet> = {
  'warrior-m': {
    base: 'warrior-m-base.jpg',
    layers: {
      'armor-plate': { file: 'warrior-m-armor-plate.png', x: 33.54, y: 17.5, w: 36.1, h: 28.17 },
    },
  },
};

export function dollSet(cls: number, female: boolean): DollSet | null {
  return SETS[`${cls ? 'mage' : 'warrior'}-${female ? 'f' : 'm'}`] ?? null;
}

/** Which layer key a slot/tier shows for this set, or null when no painted look exists yet. */
export function lookFor(set: DollSet, slot: number, _tier: number): string | null {
  if (slot === 3 && set.layers['armor-plate']) return 'armor-plate';
  return null;
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
