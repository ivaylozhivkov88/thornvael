import { CLS_MAGE, Ik, ITEMS, Slot } from './sim/items';
import { SPELLS } from './sim/spelldata';

export type ItemIconCategory = 'empty' | 'sword' | 'staff' | 'shield' | 'helm' | 'hat' | 'armor' | 'robe' | 'boots' | 'ring' | 'amulet' | 'gloves' | 'healing' | 'mana' | 'elixir' | 'scroll' | 'tome';
export type ItemIconTone = 'neutral' | 'fire' | 'water' | 'air' | 'earth' | 'astral' | 'healing' | 'mana' | 'body' | 'agility' | 'mind' | 'spirit';
export interface ItemIconDescriptor {
  category: ItemIconCategory;
  tier: number;
  tone: ItemIconTone;
}

const SCHOOLS: readonly ItemIconTone[] = ['neutral', 'fire', 'water', 'air', 'earth', 'astral'];
const ATTRIBUTES: readonly ItemIconTone[] = ['body', 'agility', 'mind', 'spirit'];
const SLOT_ICONS: readonly ItemIconCategory[] = ['sword', 'shield', 'helm', 'armor', 'boots', 'ring', 'amulet', 'gloves'];

/** Pure presentation lookup. Safe before data installation and in a Node test without a DOM. */
export function classifyItemIcon(itemId: number): ItemIconDescriptor {
  const empty: ItemIconDescriptor = { category: 'empty', tier: 0, tone: 'neutral' };
  if (!Number.isSafeInteger(itemId) || itemId < 0 || itemId >= ITEMS.length) return empty;
  const item = ITEMS[itemId];
  if (!item) return empty;
  const tier = Number.isFinite(item.tier) ? Math.max(1, Math.min(5, Math.trunc(item.tier))) : 1;
  if (item.kind === Ik.Learn) {
    return { category: item.w > 1 ? 'tome' : 'scroll', tier, tone: SCHOOLS[SPELLS[item.spell]?.school] ?? 'neutral' };
  }
  if (item.kind === Ik.Potion) {
    if (item.grow > 0) return { category: 'elixir', tier, tone: ATTRIBUTES[item.grow - 1] ?? 'neutral' };
    if (item.heal > 0) return { category: 'healing', tier, tone: 'healing' };
    if (item.restore > 0) return { category: 'mana', tier, tone: 'mana' };
    return empty;
  }
  if (item.kind !== Ik.Gear) return empty;
  let category = SLOT_ICONS[item.slot];
  if (!category) return empty;
  if (item.cls === CLS_MAGE) {
    if (item.slot === Slot.Weapon) category = 'staff';
    if (item.slot === Slot.Helm) category = 'hat';
    if (item.slot === Slot.Armor) category = 'robe';
  }
  let tone: ItemIconTone = item.cls === CLS_MAGE ? 'astral' : 'neutral';
  const bestResist = Math.max(...item.res);
  const bestAttribute = Math.max(...item.attr);
  if (bestResist > 0) tone = SCHOOLS[item.res.indexOf(bestResist) + 1] ?? 'neutral';
  else if (bestAttribute > 0) tone = ATTRIBUTES[item.attr.indexOf(bestAttribute)] ?? 'neutral';
  return { category, tier, tone };
}

const TONES: Record<ItemIconTone, readonly [string, string]> = {
  neutral: ['#e6bc76', '#76502c'], fire: ['#ffb160', '#a62e1f'], water: ['#b0e8f5', '#2766ad'],
  air: ['#e5f5cb', '#5e9b8e'], earth: ['#cfdb87', '#53713a'], astral: ['#e1c7fb', '#76549f'],
  healing: ['#ffb1a2', '#b92d37'], mana: ['#99ddff', '#3459b9'], body: ['#f5c283', '#a45b2b'],
  agility: ['#e4f2a0', '#678934'], mind: ['#d3b6ff', '#8051ac'], spirit: ['#aef0dc', '#3c9584'],
};
const METALS = [
  ['#efd4a0', '#a77d49', '#4e3526'], ['#e0e7dc', '#929f9e', '#3e4d51'],
  ['#f0f6ee', '#afc5c8', '#455e6b'], ['#fff0c1', '#b9aa7c', '#4b5964'], ['#fff3cf', '#cbb77a', '#574669'],
] as const;
const SVG_NS = 'http://www.w3.org/2000/svg';
let nextIconId = 0;

/** Original code-drawn ornament; the containing button supplies the accessible item name. */
export function itemIcon(itemId: number): SVGSVGElement {
  const { category, tier, tone } = classifyItemIcon(itemId);
  const svg = document.createElementNS(SVG_NS, 'svg');
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: SVGElement = svg): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  };
  for (const [key, value] of Object.entries({ viewBox: '0 0 64 64', width: '64', height: '64', class: 'town-item-icon', 'aria-hidden': 'true', focusable: 'false', 'data-icon': category })) svg.setAttribute(key, value);
  svg.style.pointerEvents = 'none';
  const prefix = `thornvael-item-${++nextIconId}`;
  const defs = make('defs', {});
  const gradient = (name: string, colors: readonly string[]): string => {
    const id = `${prefix}-${name}`;
    const g = make('linearGradient', { id, x1: '0%', y1: '0%', x2: '90%', y2: '100%' }, defs);
    colors.forEach((color, i) => make('stop', { offset: `${i * 100 / (colors.length - 1)}%`, 'stop-color': color }, g));
    return `url(#${id})`;
  };
  const metal = gradient('steel', METALS[Math.max(0, tier - 1)]);
  const bronze = gradient('bronze', ['#f0d499', '#b08347', '#533520']);
  const accent = gradient('enamel', TONES[tone]);
  const paper = gradient('vellum', ['#fff0c7', '#d4b579', '#96774b']);
  make('ellipse', { cx: 32, cy: 55, rx: 22, ry: 5, fill: '#090806', opacity: 0.45 });
  const drawing = make('g', { stroke: '#30271f', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: metal });
  const path = (d: string, fill = metal, stroke = '#30271f', width = 1.6): void => { make('path', { d, fill, stroke, 'stroke-width': width }, drawing); };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string): void => { make('ellipse', { cx, cy, rx, ry, fill }, drawing); };
  const line = (d: string, stroke = '#fff0c5', width = 1): void => path(d, 'none', stroke, width);
  const jewel = (cx: number, cy: number, radius = 4): void => {
    ellipse(cx, cy, radius + 1.5, radius + 1.5, bronze);
    ellipse(cx, cy, radius, radius, accent);
    line(`M${cx - 1},${cy - radius + 2} l-1,2`, '#fff7dc', 1.3);
  };

  switch (category) {
    case 'sword':
      path('M19 43 L42 11 L53 6 L51 19 L27 48 Z');
      path('M22 41 L45 13 L48 12 L25 45 Z', '#eff3dc', 'none');
      path('M15 39 Q24 39 31 48 L28 52 Q20 45 12 44 Z', bronze);
      path('M18 45 L23 49 L15 59 L10 55 Z', '#70503c');
      line('M15 49 l5 2 M12 53 l5 2', '#c89e62', 1.4);
      ellipse(11, 57, 3.5, 3, bronze);
      break;
    case 'staff':
      path('M23 58 L19 56 L37 19 L41 21 Z', '#886040');
      line('M22 54 L38 23', '#cfa26b');
      path('M36 25 Q23 15 35 7 L32 16 L40 20 L47 13 L43 5 Q58 13 44 25 Z', bronze);
      jewel(40, 13, 5);
      path('M27 39 l5 2 l-3 6 l-5-2 Z', bronze);
      break;
    case 'shield':
      path('M11 12 Q32 3 53 12 L49 37 Q43 49 32 57 Q17 48 14 37 Z', bronze);
      path('M16 16 Q32 9 48 16 L44 36 Q41 44 32 51 Q23 44 20 35 Z');
      path('M32 13 L32 50 Q40 43 44 35 L48 16 Z', '#43575b', 'none');
      path('M28 14 L35 14 L35 31 L45 31 L43 37 L35 37 L35 48 L29 49 L29 37 L20 37 L18 31 L28 31 Z', bronze);
      jewel(32, 32, 4);
      break;
    case 'helm':
      path('M14 49 L16 27 Q16 9 32 8 Q48 9 48 27 L50 49 L38 55 L35 38 L29 38 L26 55 Z');
      path('M32 10 L37 14 L37 34 L32 43 L28 34 L28 14 Z', bronze);
      path('M18 29 L28 31 L26 37 L18 35 Z M37 31 L46 29 L46 35 L38 37 Z', '#171d20');
      line('M19 25 Q19 15 26 13 M19 40 L18 48', '#e4e8d9', 1.4);
      break;
    case 'hat':
      path('M19 42 Q25 26 29 8 Q41 9 46 18 L36 15 Q35 30 45 42 Z', accent);
      path('M17 39 Q30 47 46 38 L48 44 Q32 51 15 45 Z', bronze);
      path('M7 48 Q8 43 17 43 Q31 51 48 43 Q56 44 57 48 Q34 60 7 48 Z', accent);
      line('M25 34 L30 17 L32 20', '#ede3c6', 1.2);
      jewel(34, 43, 3);
      break;
    case 'armor':
      path('M12 15 L23 10 Q32 20 41 10 L52 15 L57 29 L45 34 L43 53 Q32 58 21 53 L19 34 L7 29 Z', bronze);
      path('M23 16 Q32 23 41 16 L45 34 L40 48 L24 48 L19 34 Z');
      path('M32 21 L32 48 L40 48 L45 34 L41 16 Z', '#56666a', 'none');
      path('M20 47 L44 47 L43 54 Q32 58 21 54 Z', bronze);
      line('M14 20 L21 22 M43 22 L50 20 M23 27 L26 39 M27 50 L37 50');
      break;
    case 'robe':
      path('M23 10 Q32 16 41 10 L53 31 L44 36 L40 27 L45 55 Q32 60 19 55 L24 27 L20 36 L11 31 Z', accent);
      path('M25 11 L32 24 L39 11 L35 34 L39 56 L25 56 L29 34 Z', '#5c4651');
      path('M23 31 L41 31 L41 36 L23 36 Z', bronze);
      line('M23 51 L25 39 M41 51 L39 39 M16 30 L20 23', '#dfc2a0');
      jewel(32, 33, 3);
      break;
    case 'boots':
      path('M13 12 L29 12 L27 39 L33 44 L33 53 Q19 58 9 52 L10 46 L16 39 Z', '#81593d');
      path('M34 9 L50 11 L47 39 L55 44 L56 52 Q45 58 32 53 L32 45 L37 38 Z');
      path('M12 14 L29 14 L28 22 L14 22 Z M35 12 L50 14 L49 23 L36 21 Z', bronze);
      path('M9 50 Q20 54 33 49 L33 54 Q18 60 9 54 Z M32 50 Q44 55 56 49 L56 54 Q44 60 32 55 Z', '#44382b');
      line('M39 26 L45 27 M39 31 L44 32 M38 36 L43 37', '#e3cf9e', 1.5);
      break;
    case 'ring':
      ellipse(32, 38, 17, 20, bronze);
      ellipse(32, 39, 10, 13, '#211c18');
      path('M21 19 L26 11 L39 11 L44 19 L39 29 L26 29 Z', bronze);
      path('M25 19 L29 14 L37 14 L40 19 L36 25 L29 25 Z', accent);
      line('M28 19 L31 15 L35 15 M19 38 Q17 48 25 52', '#fff0c5', 1.8);
      break;
    case 'amulet':
      path('M18 8 Q4 23 24 40 M46 8 Q60 23 40 40', 'none', '#b28c54', 3);
      path('M18 8 Q12 23 27 35 M46 8 Q52 23 37 35', 'none', '#edce91', 1);
      ellipse(32, 34, 5, 6, bronze);
      path('M32 36 L47 45 L42 56 L22 56 L17 45 Z', bronze);
      path('M32 39 L42 46 L38 52 L26 52 L22 46 Z', accent);
      line('M26 45 L32 41 L36 44', '#ffedcb', 1.3);
      break;
    case 'gloves':
      path('M13 51 L11 32 L7 24 Q7 19 11 21 L17 29 L14 12 Q16 7 19 12 L22 26 L22 9 Q25 5 27 10 L29 25 L31 12 Q35 9 36 14 L35 31 L41 25 Q46 25 43 31 L36 43 L34 53 Z');
      path('M13 44 L35 46 L34 56 L14 54 Z', bronze);
      path('M18 31 L32 30 L32 40 L21 40 Z', bronze);
      line('M18 16 L20 25 M25 14 L27 25 M16 48 L30 50', '#f3e5c7', 1.3);
      break;
    case 'healing':
      path('M25 9 L39 9 L39 23 Q52 29 50 44 Q49 56 32 57 Q15 56 14 44 Q12 29 25 23 Z', '#a7a18b');
      path('M18 36 Q32 31 46 36 L46 45 Q44 53 32 53 Q20 53 18 45 Z', accent);
      path('M26 6 L38 6 L39 14 L25 14 Z', '#966840');
      path('M26 17 L38 17 L38 22 L26 22 Z', bronze);
      path('M29 37 L35 37 L35 41 L39 41 L39 46 L35 46 L35 50 L29 50 L29 46 L25 46 L25 41 L29 41 Z', '#ffe4bd');
      line('M22 28 Q16 33 18 40', '#f9f2da', 2.2);
      break;
    case 'mana':
      path('M26 10 L38 10 L38 24 L46 39 L43 54 L21 54 L18 39 L26 24 Z', '#96a9b1');
      path('M22 36 L42 36 L43 40 L40 51 L24 51 L21 40 Z', accent);
      path('M25 6 L39 6 L38 14 L26 14 Z', '#806043');
      path('M25 18 L39 18 L39 23 L25 23 Z', bronze);
      path('M34 37 L27 45 L32 45 L29 51 L38 42 L33 42 Z', '#e1f8ff');
      line('M28 27 L23 39', '#f4f6dd', 2);
      break;
    case 'elixir':
      path('M27 12 L37 12 L37 24 L49 38 L42 55 L22 55 L15 38 L27 24 Z', '#a9b6a1');
      path('M20 37 L44 37 L39 51 L25 51 Z', accent);
      path('M25 8 L39 8 L37 16 L27 16 Z', bronze);
      path('M25 22 L39 22 L39 27 L25 27 Z', bronze);
      path('M32 37 L38 43 L32 49 L26 43 Z', '#f6e5b4');
      line('M27 28 L20 38 L23 46', '#fff4d2', 1.8);
      break;
    case 'scroll':
      path('M17 12 L49 12 Q40 19 45 28 L42 48 L12 48 Q19 39 16 29 Q12 19 17 12 Z', paper);
      path('M17 12 Q9 9 9 17 Q9 22 17 21 M42 48 Q38 56 48 55 Q55 54 52 47 L42 47', paper);
      line('M21 22 L36 22 M21 26 L32 26 M21 39 L36 39', '#927248', 1.4);
      path('M26 13 L33 13 L31 47 L24 47 Z', accent);
      jewel(29, 33, 5);
      break;
    case 'tome':
      path('M13 14 L41 8 L53 16 L50 52 L23 58 L12 51 Z', '#674336');
      path('M18 17 L49 12 L48 48 L20 54 Z', paper);
      path('M14 13 L42 7 L49 12 L22 19 L20 52 L13 49 Z', bronze);
      path('M22 19 L51 13 L50 48 L21 55 Z', accent);
      path('M22 19 L27 18 L26 54 L21 55 Z', '#594333');
      path('M27 23 L46 19 L45 44 L27 49 Z', 'none', '#d7b476', 1);
      jewel(36, 34, 6);
      path('M44 29 L53 28 L53 36 L44 37 Z', bronze);
      line('M23 57 L47 52 M15 18 L14 43', '#e9d4a5');
      break;
    case 'empty':
      path('M12 23 L12 12 L23 12 M41 12 L52 12 L52 23 M52 41 L52 52 L41 52 M23 52 L12 52 L12 41', 'none', '#86704d', 2);
      ellipse(32, 32, 3, 3, '#68573d');
      break;
  }
  // A small rivet row communicates level even when enamel hues are hard to distinguish.
  for (let i = 0; i < tier; i++) make('circle', { cx: 32 + (i - (tier - 1) / 2) * 5, cy: 61, r: 1.3, fill: '#e6c68a', stroke: '#3b2b1b', 'stroke-width': 0.6 });
  return svg;
}
