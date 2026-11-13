import { DEFS, Kind, M, MODN } from './sim/combat';
import { DIFF_NAMES, INV_MAX, SKILL_NAMES, SKILL_TIP, SKILL_MAX, WHY_TEXT, blocker, derive, equipmentStamp, startState, totals, type EquipmentAction, type HeroState } from './sim/hero';
import { equipmentAction, equipmentLayers, equipmentPreview, skillProgress, type EquipmentSource as Sel } from './hero-presentation';
import { ATTR_NAMES, CLS_BOTH, CLS_MAGE, CLS_WARRIOR, Cls, ITEMS, Ik, ItemDef, PART_NAMES, SLOT_COUNT, SLOT_NAMES, Slot, getItemDef, itemText } from './sim/items';
import { findSetByItemName, isSetItem, type SetBonus } from './sim/sets';
import type { Command, Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { S } from './strings';
import { itemIcon } from './townicons';
import { CodexUi } from './codexui';
import { playPickupRustle, playEquipSfx } from './audio';

/** Hero, pack and creation sheets. Plain DOM buttons only, so touch, mouse and keyboard (Tab, Enter, arrows) all work the same way. */

export interface HeroUiCtx {
  sim: () => Sim;
  queue: (c: Command) => void;
  toast: (m: string) => void;
  tipOn: (b: HTMLElement, text: string) => void;
  /** Put a quick-slot value (spell id, or 100 + item id) into slot n. */
  setSlot: (n: number, v: number) => void;
  openBook: () => void;
  /** Called after a sheet opens so the host can close other overlays. */
  onOpen: () => void;
}

type Tab = 'hero' | 'pack';
const PACK_PAGE = 8;

interface EquipmentIntent {
  sim: Sim;
  hero: HeroState;
  source: Sel;
  count: number;
  action: EquipmentAction;
  stamp: string;
}

interface Drag {
  intent: EquipmentIntent;
  pointer: number;
  x: number;
  y: number;
  events: AbortController;
  ghost: HTMLElement | null;
  target: HTMLElement | null;
  scrollFrame: number;
}

function slotWatermarkIcon(slot: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hero-slot-watermark');

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', 'currentColor');
  g.setAttribute('stroke-linecap', 'round');
  g.setAttribute('stroke-linejoin', 'round');

  switch (slot) {
    case Slot.Weapon: // 0: Broadsword
      g.innerHTML = `
        <path d="M 22 6 L 26 6 L 26 31 L 34 31 L 34 34 L 26 34 L 26 40 L 22 40 L 22 34 L 14 34 L 14 31 L 22 31 Z" stroke-width="1.8"/>
        <line x1="24" y1="9" x2="24" y2="28" stroke-width="1.1"/>
        <circle cx="24" cy="43" r="2.2" stroke-width="1.5"/>
      `;
      break;
    case Slot.Shield: // 1: Heater Shield with Heraldic Cross
      g.innerHTML = `
        <path d="M 24 7 L 39 12 L 37 28 C 35 37, 24 43, 24 43 C 24 43, 13 37, 11 28 L 9 12 Z" stroke-width="1.8"/>
        <line x1="24" y1="13" x2="24" y2="37" stroke-width="1.2"/>
        <line x1="15" y1="22" x2="33" y2="22" stroke-width="1.2"/>
      `;
      break;
    case Slot.Helm: // 2: Gothic Bascinet with Visor Slit
      g.innerHTML = `
        <path d="M 24 8 C 15 8, 12 18, 12 28 L 12 36 L 18 41 L 30 41 L 36 36 L 36 28 C 36 18, 33 8, 24 8 Z" stroke-width="1.8"/>
        <path d="M 15 26 L 33 26 L 31 29 L 17 29 Z" fill="currentColor" stroke-width="0.8" opacity="0.6"/>
        <path d="M 24 4 L 26 8 L 22 8 Z" fill="currentColor" stroke-width="0.8"/>
      `;
      break;
    case Slot.Armor: // 3: Plate Cuirass with Fauld
      g.innerHTML = `
        <path d="M 18 10 L 13 16 L 15 28 L 13 38 L 35 38 L 33 28 L 35 16 L 30 10 L 26 14 L 22 14 Z" stroke-width="1.8"/>
        <line x1="24" y1="14" x2="24" y2="34" stroke-width="1.2"/>
        <path d="M 17 22 C 21 24, 27 24, 31 22" stroke-width="1.2"/>
      `;
      break;
    case Slot.Boots: // 4: Sabatons / Greaves
      g.innerHTML = `
        <path d="M 17 9 L 27 9 L 27 25 L 35 31 L 35 39 L 17 39 L 17 28 Z" stroke-width="1.8"/>
        <line x1="17" y1="34" x2="35" y2="34" stroke-width="1.2"/>
        <path d="M 21 21 L 27 25" stroke-width="1.2"/>
      `;
      break;
    case Slot.Ring: // 5: Signet Ring with Star Sparkle
      g.innerHTML = `
        <circle cx="24" cy="28" r="11" stroke-width="2"/>
        <path d="M 24 9 L 29 15 L 26 19 L 22 19 L 19 15 Z" stroke-width="1.8"/>
        <line x1="24" y1="11" x2="24" y2="17" stroke-width="1"/>
        <line x1="21" y1="14" x2="27" y2="14" stroke-width="1"/>
      `;
      break;
    case Slot.Amulet: // 6: Chained Talisman Medallion
      g.innerHTML = `
        <path d="M 15 10 C 18 24, 30 24, 33 10" stroke-width="1.6" stroke-dasharray="2,2"/>
        <polygon points="24,20 31,27 24,38 17,27" stroke-width="1.8"/>
        <circle cx="24" cy="28" r="3" fill="currentColor" stroke-width="0.8" opacity="0.7"/>
      `;
      break;
    case Slot.Gloves: // 7: Articulated Gauntlet
      g.innerHTML = `
        <path d="M 16 38 L 16 23 L 20 18 L 24 20 L 27 15 L 31 20 L 33 24 L 33 38 Z" stroke-width="1.8"/>
        <line x1="16" y1="32" x2="33" y2="32" stroke-width="1.2"/>
      `;
      break;
    case 8: // 8: Belt / Waist
      g.innerHTML = `
        <rect x="8" y="20" width="32" height="8" rx="2" stroke-width="1.8"/>
        <rect x="20" y="17" width="8" height="14" rx="1.5" stroke-width="1.8"/>
        <line x1="24" y1="20" x2="24" y2="28" stroke-width="2"/>
        <circle cx="14" cy="24" r="1.2" fill="currentColor"/>
        <circle cx="34" cy="24" r="1.2" fill="currentColor"/>
      `;
      break;
  }
  svg.append(g);
  return svg;
}

function figure(h: HeroState): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 160 220');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hero-figure');

  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `
    <radialGradient id="pdHalo" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="${h.cls === 1 ? '#4c1d95' : '#78350f'}" stop-opacity="0.5"/>
      <stop offset="60%" stop-color="#1c140d" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0e0a07" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pdNiche" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#2a1d13"/>
      <stop offset="80%" stop-color="#140e09"/>
      <stop offset="100%" stop-color="#0a0705"/>
    </radialGradient>
    <linearGradient id="pdArch" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5a4228"/>
      <stop offset="50%" stop-color="#362515"/>
      <stop offset="100%" stop-color="#1c130a"/>
    </linearGradient>
    <linearGradient id="pdPedestal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a3724"/>
      <stop offset="40%" stop-color="#2d2015"/>
      <stop offset="100%" stop-color="#150e08"/>
    </linearGradient>
    <linearGradient id="pdPedestalRim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5a4228"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#5a4228"/>
    </linearGradient>
    <linearGradient id="pdSkin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${h.female ? '#f0c4a8' : '#dca885'}"/>
      <stop offset="50%" stop-color="${h.female ? '#d99e7b' : '#b88260'}"/>
      <stop offset="100%" stop-color="${h.female ? '#9e6749' : '#7d4f35'}"/>
    </linearGradient>
    <linearGradient id="pdDoublet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#453123"/>
      <stop offset="50%" stop-color="#2a1d14"/>
      <stop offset="100%" stop-color="#170f09"/>
    </linearGradient>
    <linearGradient id="pdRobe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#583c7a"/>
      <stop offset="45%" stop-color="#3b2554"/>
      <stop offset="100%" stop-color="#1a1028"/>
    </linearGradient>
    <linearGradient id="pdSteel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a8b5c4"/>
      <stop offset="35%" stop-color="#4f5b66"/>
      <stop offset="70%" stop-color="#dce4ec"/>
      <stop offset="100%" stop-color="#2c343c"/>
    </linearGradient>
    <linearGradient id="pdGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="40%" stop-color="#d4af37"/>
      <stop offset="80%" stop-color="#854d0e"/>
      <stop offset="100%" stop-color="#fef08a"/>
    </linearGradient>
    <filter id="pdRuneGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  `;
  svg.append(defs);

  // Background Alcove & Gothic Cathedral Arch
  const bg = document.createElementNS(ns, 'g');
  bg.innerHTML = `
    <path d="M 24 212 L 24 74 C 24 28, 80 8, 80 8 C 80 8, 136 28, 136 74 L 136 212 Z" fill="url(#pdNiche)" stroke="url(#pdArch)" stroke-width="2.5"/>
    <path d="M 30 210 L 30 76 C 30 35, 80 16, 80 16 C 80 16, 130 35, 130 76 L 130 210" fill="none" stroke="#4a3520" stroke-width="1.2" opacity="0.6"/>
    <ellipse cx="80" cy="85" rx="46" ry="54" fill="url(#pdHalo)"/>
    <polygon points="18,218 26,206 134,206 142,218" fill="url(#pdPedestal)" stroke="#3d2a19" stroke-width="1.2"/>
    <polygon points="28,206 36,196 124,196 132,206" fill="url(#pdPedestal)" stroke="#4a3520" stroke-width="1.2"/>
    <line x1="36" y1="196" x2="124" y2="196" stroke="url(#pdPedestalRim)" stroke-width="2"/>
    <line x1="60" y1="201" x2="65" y2="201" stroke="#854d0e" stroke-width="1"/>
    <line x1="77" y1="201" x2="83" y2="201" stroke="#d4af37" stroke-width="1.2"/>
    <line x1="95" y1="201" x2="100" y2="201" stroke="#854d0e" stroke-width="1"/>
  `;
  svg.append(bg);

  // Base Silhouette Anatomy
  const bodyGroup = document.createElementNS(ns, 'g');
  bodyGroup.setAttribute('class', 'hero-base-silhouette');

  if (h.cls === 1) {
    // --- MAGE (Robed Spellcaster Silhouette) ---
    bodyGroup.innerHTML = `
      <path d="M 80 18 C 64 18, 56 32, 58 52 C 58 64, 66 70, 80 72 C 94 70, 102 64, 102 52 C 104 32, 96 18, 80 18 Z" fill="url(#pdRobe)" stroke="#160e22" stroke-width="1.5"/>
      <path d="M 80 24 C 68 24, 66 36, 68 50 C 70 58, 76 62, 80 63 C 84 62, 90 58, 92 50 C 94 36, 92 24, 80 24 Z" fill="#0f0918"/>
      <ellipse cx="75" cy="42" rx="2" ry="1.2" fill="#67e8f9" filter="url(#pdRuneGlow)"/>
      <ellipse cx="85" cy="42" rx="2" ry="1.2" fill="#67e8f9" filter="url(#pdRuneGlow)"/>
      <path d="M 73 68 L 54 78 L 46 94 L 56 122 L 62 136 L 98 136 L 104 122 L 114 94 L 106 78 L 87 68 Z" fill="url(#pdRobe)" stroke="#160e22" stroke-width="1.5"/>
      <path d="M 54 78 L 34 116 L 46 126 L 56 94 Z" fill="url(#pdRobe)" stroke="#160e22" stroke-width="1.2"/>
      <path d="M 106 78 L 126 116 L 114 126 L 104 94 Z" fill="url(#pdRobe)" stroke="#160e22" stroke-width="1.2"/>
      <path d="M 36 122 C 34 126, 36 134, 40 134 C 44 134, 44 128, 42 124 Z" fill="url(#pdSkin)"/>
      <path d="M 124 122 C 126 126, 124 134, 120 134 C 116 134, 116 128, 118 124 Z" fill="url(#pdSkin)"/>
      <path d="M 73 68 L 71 124 L 89 124 L 87 68 Z" fill="#29183d" stroke="url(#pdGold)" stroke-width="0.9"/>
      <rect x="56" y="122" width="48" height="8" rx="2" fill="#1b0f2a" stroke="#0e0717"/>
      <polygon points="80,121 85,126 80,131 75,126" fill="url(#pdGold)"/>
      <circle cx="80" cy="126" r="2" fill="#38bdf8"/>
      <path d="M 62 136 L 42 196 L 118 196 L 98 136 Z" fill="url(#pdRobe)" stroke="#160e22" stroke-width="1.5"/>
      <path d="M 72 136 L 64 196 M 88 136 L 96 196 M 80 136 L 80 196" stroke="#1c112b" stroke-width="1.8"/>
      <path d="M 42 194 L 118 194" stroke="url(#pdGold)" stroke-width="1.8"/>
    `;
  } else {
    // --- WARRIOR (Muscular / Armored Knight in Fitted Arming Doublet) ---
    bodyGroup.innerHTML = `
      <path d="M 74 54 L 73 68 L 87 68 L 86 54 Z" fill="url(#pdSkin)" stroke="#26170d" stroke-width="1"/>
      <path d="${h.female
        ? 'M 72 32 C 70 23, 90 23, 88 32 C 90 46, 86 56, 80 57 C 74 56, 70 46, 72 32 Z'
        : 'M 70 30 C 68 21, 92 21, 90 30 C 92 46, 88 56, 80 58 C 72 56, 68 46, 70 30 Z'}"
        fill="url(#pdSkin)" stroke="#26170d" stroke-width="1.2"/>
      ${h.female
        ? '<path d="M 70 32 C 64 22, 80 18, 90 22 C 96 26, 96 46, 94 64 L 89 64 C 91 48, 89 32, 85 28 C 81 26, 77 28, 75 34 L 71 64 L 66 64 C 65 48, 65 36, 70 32 Z" fill="#3a2216"/>'
        : '<path d="M 68 34 C 64 20, 80 16, 92 20 C 96 24, 95 36, 92 38 C 88 32, 85 30, 80 30 C 74 30, 71 34, 68 34 Z" fill="#2d1a10"/>'}
      <path d="M 77 56 L 79 67 M 83 56 L 81 67" stroke="#633e28" stroke-width="1"/>
      <path d="M 73 68 L 52 78 L 44 94 L 54 124 L 62 138 L 98 138 L 106 124 L 116 94 L 108 78 L 87 68 Z" fill="url(#pdDoublet)" stroke="#1a110a" stroke-width="1.6"/>
      <line x1="80" y1="72" x2="80" y2="114" stroke="#4a3423" stroke-width="1.2"/>
      <path d="M 54 94 C 66 100, 76 98, 80 98 C 84 98, 94 100, 106 94" fill="none" stroke="#4a3423" stroke-width="1.2"/>
      <path d="M 62 82 L 80 100 L 98 82 M 62 96 L 80 114 L 98 96 M 70 76 L 80 86 L 90 76" fill="none" stroke="#543c29" stroke-width="0.8" opacity="0.6"/>
      <polygon points="54,80 98,124 94,128 50,84" fill="#23160e" stroke="#120b06" stroke-width="0.8"/>
      <rect x="54" y="122" width="52" height="8" fill="#23160e" stroke="#120b06"/>
      <rect x="75" y="121" width="10" height="10" rx="1.5" fill="url(#pdGold)" stroke="#3f2705"/>
      <circle cx="53" cy="80" r="3.5" fill="url(#pdSteel)" stroke="#111"/>
      <circle cx="53" cy="80" r="1.5" fill="url(#pdGold)"/>
      <circle cx="107" cy="80" r="3.5" fill="url(#pdSteel)" stroke="#111"/>
      <circle cx="107" cy="80" r="1.5" fill="url(#pdGold)"/>
      <circle cx="73" cy="69" r="2" fill="url(#pdGold)"/>
      <circle cx="87" cy="69" r="2" fill="url(#pdGold)"/>
      <circle cx="63" cy="136" r="3" fill="none" stroke="url(#pdGold)" stroke-width="1.5"/>
      <circle cx="97" cy="136" r="3" fill="none" stroke="url(#pdGold)" stroke-width="1.5"/>
      <path d="M 52 78 C 44 80, 42 90, 44 96 L 50 98 Z" fill="url(#pdSkin)"/>
      <path d="M 44 96 L 36 122 L 44 124 L 50 98 Z" fill="#2a1d14" stroke="#150e09"/>
      <path d="M 36 122 C 34 126, 36 134, 40 134 C 44 134, 44 128, 42 124 Z" fill="url(#pdSkin)"/>
      <path d="M 108 78 C 116 80, 118 90, 116 96 L 110 98 Z" fill="url(#pdSkin)"/>
      <path d="M 116 96 L 124 122 L 116 124 L 110 98 Z" fill="#2a1d14" stroke="#150e09"/>
      <path d="M 124 122 C 126 126, 124 134, 120 134 C 116 134, 116 128, 118 124 Z" fill="url(#pdSkin)"/>
      <path d="M 62 138 L 56 156 L 104 156 L 98 138 Z" fill="url(#pdDoublet)" stroke="#1a110a" stroke-width="1.4"/>
      <line x1="80" y1="138" x2="80" y2="156" stroke="#120b06" stroke-width="1.2"/>
      <path d="M 58 156 L 54 186 L 68 186 L 74 156 Z" fill="#211a14" stroke="#120e0a"/>
      <path d="M 86 156 L 92 186 L 106 186 L 102 156 Z" fill="#211a14" stroke="#120e0a"/>
      <circle cx="61" cy="172" r="3" fill="url(#pdSteel)" stroke="#111"/>
      <circle cx="61" cy="172" r="1.2" fill="url(#pdGold)"/>
      <circle cx="99" cy="172" r="3" fill="url(#pdSteel)" stroke="#111"/>
      <circle cx="99" cy="172" r="1.2" fill="url(#pdGold)"/>
      <path d="M 52 186 L 46 196 L 70 196 L 68 186 Z" fill="#2a1d14" stroke="#150e09"/>
      <path d="M 92 186 L 90 196 L 114 196 L 108 186 Z" fill="#2a1d14" stroke="#150e09"/>
    `;
  }
  svg.append(bodyGroup);

  // Equipment Layers: dynamically rendered when equipped
  for (const layer of equipmentLayers(h)) {
    const elGroup = document.createElementNS(ns, 'g');
    elGroup.dataset.layer = String(layer.slot);
    elGroup.dataset.item = String(layer.item);

    switch (layer.slot) {
      case Slot.Helm: // 2
        elGroup.innerHTML = h.cls === 1
          ? `<path d="M 68 34 C 74 38, 86 38, 92 34 L 92 37 C 86 41, 74 41, 68 37 Z" fill="url(#pdGold)" stroke="#3f2705"/>
             <polygon points="80,28 84,34 80,38 76,34" fill="url(#pdGold)"/>
             <circle cx="80" cy="33" r="2.5" fill="#38bdf8" filter="url(#pdRuneGlow)"/>`
          : `<path d="M 80 18 C 65 18, 62 30, 64 54 L 96 54 C 98 30, 95 18, 80 18 Z" fill="url(#pdSteel)" stroke="#1c222b" stroke-width="1.6"/>
             <path d="M 64 50 L 72 64 L 88 64 L 96 50 Z" fill="url(#pdSteel)" stroke="#1c222b" stroke-width="1.2"/>
             <line x1="80" y1="18" x2="80" y2="48" stroke="#ffffff" stroke-width="1.8" opacity="0.7"/>
             <path d="M 67 38 L 93 38 L 91 42 L 69 42 Z" fill="#080c10" stroke="url(#pdGold)" stroke-width="0.9"/>
             <circle cx="74" cy="48" r="0.8" fill="#080c10"/>
             <circle cx="77" cy="48" r="0.8" fill="#080c10"/>
             <circle cx="83" cy="48" r="0.8" fill="#080c10"/>
             <circle cx="86" cy="48" r="0.8" fill="#080c10"/>
             <polygon points="80,12 83,18 77,18" fill="url(#pdGold)"/>`;
        break;

      case Slot.Armor: // 3
        elGroup.innerHTML = h.cls === 1
          ? `<path d="M 73 68 L 52 78 L 44 94 L 54 124 L 62 138 L 98 138 L 106 124 L 116 94 L 108 78 L 87 68 Z" fill="#201330" stroke="url(#pdGold)" stroke-width="1.4"/>
             <line x1="80" y1="72" x2="80" y2="124" stroke="#c084fc" stroke-width="1.5" filter="url(#pdRuneGlow)"/>
             <circle cx="80" cy="98" r="8" fill="none" stroke="#c084fc" stroke-width="1.2" stroke-dasharray="3,2" filter="url(#pdRuneGlow)"/>
             <polygon points="80,94 84,98 80,102 76,98" fill="url(#pdGold)"/>`
          : `<path d="M 73 68 L 50 78 L 42 94 L 52 124 L 60 138 L 100 138 L 108 124 L 118 94 L 110 78 L 87 68 Z" fill="url(#pdSteel)" stroke="#1a2029" stroke-width="1.6"/>
             <line x1="80" y1="72" x2="80" y2="124" stroke="#f1f5f9" stroke-width="1.8"/>
             <circle cx="80" cy="95" r="5" fill="none" stroke="url(#pdGold)" stroke-width="1.2"/>
             <polygon points="80,88 82,93 87,95 82,97 80,102 78,97 73,95 78,93" fill="url(#pdGold)"/>
             <path d="M 54 124 L 106 124" stroke="#161b22" stroke-width="1.5"/>
             <path d="M 57 131 L 103 131" stroke="#161b22" stroke-width="1.5"/>
             <circle cx="56" cy="127" r="1.2" fill="url(#pdGold)"/>
             <circle cx="104" cy="127" r="1.2" fill="url(#pdGold)"/>
             <circle cx="63" cy="135" r="1.2" fill="url(#pdGold)"/>
             <circle cx="97" cy="135" r="1.2" fill="url(#pdGold)"/>`;
        break;

      case Slot.Weapon: // 0
        elGroup.innerHTML = h.cls === 1
          ? `<rect x="33" y="30" width="3" height="165" rx="1.5" fill="#2a170d" stroke="url(#pdGold)" stroke-width="0.6"/>
             <path d="M 31 34 C 28 26, 31 20, 34.5 18 C 38 20, 41 26, 38 34 Z" fill="url(#pdGold)" stroke="#3f2705"/>
             <circle cx="34.5" cy="24" r="5.5" fill="#67e8f9" filter="url(#pdRuneGlow)"/>
             <circle cx="34.5" cy="24" r="2.5" fill="#ffffff"/>`
          : `<path d="M 34 28 L 37 34 L 37 136 L 31 136 L 31 34 Z" fill="url(#pdSteel)" stroke="#1f2937" stroke-width="1.2"/>
             <line x1="34" y1="36" x2="34" y2="130" stroke="#60a5fa" stroke-width="1.2" filter="url(#pdRuneGlow)"/>
             <path d="M 23 136 L 45 136 L 43 140 L 25 140 Z" fill="url(#pdGold)" stroke="#3f2705"/>
             <rect x="32" y="140" width="4" height="13" fill="#2b1a10"/>
             <circle cx="34" cy="155" r="3.5" fill="url(#pdGold)" stroke="#3f2705"/>`;
        break;

      case Slot.Shield: // 1
        elGroup.innerHTML = h.cls === 1
          ? `<circle cx="130" cy="118" r="18" fill="none" stroke="#38bdf8" stroke-width="1.8" filter="url(#pdRuneGlow)"/>
             <circle cx="130" cy="118" r="12" fill="none" stroke="#c084fc" stroke-width="1.2" stroke-dasharray="3,2" filter="url(#pdRuneGlow)"/>
             <polygon points="130,108 138,118 130,128 122,118" fill="none" stroke="url(#pdGold)" stroke-width="1"/>`
          : `<path d="M 112 84 L 148 84 L 146 130 C 144 152, 130 166, 130 166 C 130 166, 116 152, 114 130 Z" fill="url(#pdSteel)" stroke="#111827" stroke-width="1.8"/>
             <path d="M 114 86 L 146 86 L 144 128 C 142 148, 130 162, 130 162 C 130 162, 118 148, 116 128 Z" fill="none" stroke="url(#pdGold)" stroke-width="2.5"/>
             <line x1="130" y1="92" x2="130" y2="148" stroke="url(#pdGold)" stroke-width="3"/>
             <line x1="118" y1="112" x2="142" y2="112" stroke="url(#pdGold)" stroke-width="3"/>
             <circle cx="130" cy="112" r="5" fill="url(#pdSteel)" stroke="url(#pdGold)" stroke-width="1.2"/>`;
        break;

      case Slot.Gloves: // 7
        elGroup.innerHTML = `
          <path d="M 30 124 L 42 124 L 44 142 L 28 142 Z" fill="url(#pdSteel)" stroke="#1a2029" stroke-width="1.2"/>
          <path d="M 118 124 L 130 124 L 132 142 L 116 142 Z" fill="url(#pdSteel)" stroke="#1a2029" stroke-width="1.2"/>
          <line x1="30" y1="134" x2="42" y2="134" stroke="url(#pdGold)" stroke-width="1.2"/>
          <line x1="118" y1="134" x2="130" y2="134" stroke="url(#pdGold)" stroke-width="1.2"/>
        `;
        break;

      case Slot.Boots: // 4
        elGroup.innerHTML = `
          <path d="M 50 176 L 70 176 L 72 198 L 44 198 Z" fill="url(#pdSteel)" stroke="#1a2029" stroke-width="1.4"/>
          <path d="M 90 176 L 110 176 L 116 198 L 88 198 Z" fill="url(#pdSteel)" stroke="#1a2029" stroke-width="1.4"/>
          <circle cx="60" cy="172" r="3.5" fill="url(#pdSteel)" stroke="#111"/>
          <circle cx="60" cy="172" r="1.2" fill="url(#pdGold)"/>
          <circle cx="100" cy="172" r="3.5" fill="url(#pdSteel)" stroke="#111"/>
          <circle cx="100" cy="172" r="1.2" fill="url(#pdGold)"/>
          <line x1="46" y1="192" x2="70" y2="192" stroke="#161b22" stroke-width="1.2"/>
          <line x1="90" y1="192" x2="114" y2="192" stroke="#161b22" stroke-width="1.2"/>
        `;
        break;

      case Slot.Amulet: // 6
        elGroup.innerHTML = `
          <path d="M 72 68 C 76 84, 84 84, 88 68" stroke="url(#pdGold)" stroke-width="1.4" fill="none"/>
          <polygon points="80,82 85,87 80,93 75,87" fill="url(#pdGold)" stroke="#3f2705"/>
          <circle cx="80" cy="87" r="2.5" fill="#ef4444" filter="url(#pdRuneGlow)"/>
        `;
        break;

      case Slot.Ring: // 5
        elGroup.innerHTML = `
          <ellipse cx="122" cy="132" rx="3" ry="2" fill="url(#pdGold)" stroke="#3f2705"/>
          <circle cx="122" cy="132" r="1.5" fill="#facc15" filter="url(#pdRuneGlow)"/>
          <path d="M 122 128 L 122 136 M 118 132 L 126 132" stroke="#ffffff" stroke-width="0.8"/>
        `;
        break;
    }
    svg.append(elGroup);
  }

  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(text: string, key: string, onclick: () => void, small = ''): HTMLButtonElement {
  const b = el('button');
  b.type = 'button';
  b.dataset.k = key;
  b.append(text);
  if (small) b.append(el('small', '', small));
  b.onclick = onclick;
  return b;
}

function meter(cls: string, v: number, max: number): HTMLElement {
  const m = el('div', `meter ${cls}`);
  const i = el('i');
  i.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
  m.append(i);
  return m;
}

function line(label: string, value: string, tip = '', extra?: HTMLElement): HTMLElement {
  const l = el('div', 'line');
  l.append(el('span', 'grow', label), el('b', '', value));
  if (extra) l.append(extra);
  if (tip) l.title = tip;
  return l;
}

/** Tab strip shared by the hero sheet and the spellbook. */
export function tabStrip(active: number, go: (n: number) => void): HTMLElement {
  const t = el('div', 'tabs');
  t.setAttribute('role', 'tablist');
  S.hero.tabs.forEach((name, n) => {
    const b = button(name, `tab${n}`, () => go(n));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(n === active));
    b.tabIndex = n === active ? 0 : -1;
    b.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      go((n + (e.key === 'ArrowRight' ? 1 : 2)) % 3);
    };
    t.append(b);
  });
  return t;
}

const SCHOOL_NAMES = ['fire', 'water', 'air', 'earth', 'astral'] as const;

function formatBonusStats(b: SetBonus): string {
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} HP`);
  if (b.mana) parts.push(`+${b.mana} Mana`);
  if (b.def) parts.push(`+${b.def} Def`);
  if (b.abs) parts.push(`+${b.abs} Absorb`);
  if (b.acc) parts.push(`+${b.acc} Hit`);
  if (b.min || b.max) parts.push(`+${b.min ?? 0}-${b.max ?? 0} Damage`);
  if (b.pow) parts.push(`+${b.pow}% Spell Power`);
  if (b.attr) {
    b.attr.forEach((v, idx) => {
      if (v) parts.push(`+${v} ${ATTR_NAMES[idx]}`);
    });
  }
  if (b.res) {
    const res = b.res;
    if (res.every((v) => v === res[0]) && res[0] > 0) {
      parts.push(`+${res[0]}% All Res`);
    } else {
      res.forEach((v, idx) => {
        if (v) parts.push(`+${v}% ${SCHOOL_NAMES[idx]} Res`);
      });
    }
  }
  return parts.join(', ');
}

export function formatItemTooltip(itemOrId: number | ItemDef, hero?: HeroState | null): string {
  const d = typeof itemOrId === 'number' ? getItemDef(itemOrId) : itemOrId;
  if (!d) return '';

  const p: string[] = [];
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  p.push(`${d.name} (${kind}, level ${d.tier}, weight ${d.w})`);
  if (d.max > 0) p.push(`Blow damage +${d.min}-${d.max}`);
  if (d.acc) p.push(`Hit +${d.acc}`);
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    p.push(`Covers ${parts}: defence +${d.def}, absorb +${d.abs}`);
  }
  d.res.forEach((v, n) => v && p.push(`Resist ${SCHOOL_NAMES[n]} +${v}%`));
  d.attr.forEach((v, n) => v && p.push(`${ATTR_NAMES[n]} +${v}`));
  if (d.hp) p.push(`Hit points +${d.hp}`);
  if (d.mana) p.push(`Mana +${d.mana}`);
  if (d.pow) p.push(`Spell power +${d.pow}%`);
  if (d.heal) p.push(`Heals ${d.heal}`);
  if (d.restore) p.push(`Restores ${d.restore} mana`);
  if (d.grow) p.push(`Raises ${ATTR_NAMES[d.grow - 1]} by 1 for good`);
  if (d.spell >= 0 && SPELLS[d.spell]) p.push(`Teaches ${SPELLS[d.spell].name}`);
  if (d.needv > 0) p.push(`Needs ${ATTR_NAMES[d.need]} ${d.needv}`);

  // Class restriction
  if (d.kind === Ik.Gear) {
    if (d.cls === CLS_BOTH) {
      p.push('Warriors and mages');
    } else if (d.cls === CLS_WARRIOR) {
      if (hero && hero.cls === Cls.Mage) {
        p.push('⚠ Cannot equip: Warrior Only');
      } else {
        p.push('Warrior Only');
      }
    } else if (d.cls === CLS_MAGE) {
      if (hero && hero.cls === Cls.Warrior) {
        p.push('⚠ Cannot equip: Mage Only');
      } else {
        p.push('Mage Only');
      }
    }
  }

  // Set Item info
  const setDef = findSetByItemName(d.name);
  if (setDef) {
    const equippedNames = hero
      ? hero.eq.filter((id) => id >= 0).map((id) => getItemDef(id)?.name).filter(Boolean)
      : [];
    const equippedCount = setDef.pieces.filter((piece) => equippedNames.includes(piece.name)).length;

    p.push('');
    p.push(`Set: ${setDef.name} (${equippedCount}/${setDef.pieces.length})`);
    for (const piece of setDef.pieces) {
      const isEquipped = equippedNames.includes(piece.name);
      p.push(`  ${isEquipped ? '[✓]' : '[ ]'} ${piece.name}`);
    }
    p.push('Set Bonuses:');
    for (const bonus of setDef.bonuses) {
      const active = equippedCount >= bonus.pieces;
      p.push(`  ${active ? '★' : '○'} (${bonus.pieces}) ${formatBonusStats(bonus)}`);
    }
  }

  return p.join('\n');
}

export function renderItemTooltipDom(itemOrId: number | ItemDef, hero?: HeroState | null): HTMLElement {
  const d = typeof itemOrId === 'number' ? getItemDef(itemOrId) : itemOrId;
  const root = document.createElement('div');
  root.className = 'item-tooltip-box diablo-card';
  if (!d) return root;

  const isSet = isSetItem(d.name);
  const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
  root.dataset.rarity = rarity;

  // Header: Item Name with Rarity Class
  const title = document.createElement('div');
  title.className = `item-title rarity-${rarity}`;
  title.textContent = d.name;
  root.append(title);

  // Ornate Gold Filigree Divider
  const divider = document.createElement('div');
  divider.className = 'card-filigree-divider';
  const gem = document.createElement('span');
  gem.className = 'gem';
  gem.textContent = '◆';
  divider.append(gem);
  root.append(divider);

  // Subtitle: Kind, Tier, Weight
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  const sub = document.createElement('div');
  sub.className = 'item-sub-meta';
  sub.textContent = `${kind} · Level ${d.tier} · Weight ${d.w}`;
  root.append(sub);

  // Requirements Section (Attributes & Class)
  const reqsBox = document.createElement('div');
  reqsBox.className = 'item-requirements-box';

  if (d.needv > 0) {
    const currentAttr = hero ? totals(hero)[d.need] : 0;
    const met = !hero || currentAttr >= d.needv;
    const reqLine = document.createElement('div');
    reqLine.className = `item-req ${met ? 'req-met' : 'req-unmet'}`;
    reqLine.textContent = `${met ? '✓' : '✗'} Requires ${ATTR_NAMES[d.need]} ${d.needv}${!met ? ` (Current: ${currentAttr})` : ''}`;
    reqsBox.append(reqLine);
  }

  if (d.kind === Ik.Gear) {
    const classReq = document.createElement('div');
    if (d.cls === CLS_WARRIOR) {
      const wrong = hero && hero.cls === Cls.Mage;
      classReq.className = `item-class-req ${wrong ? 'req-unmet' : 'req-class-ok'}`;
      classReq.textContent = wrong ? '⚠ Cannot equip: Warrior Only' : 'Warrior Only';
      reqsBox.append(classReq);
    } else if (d.cls === CLS_MAGE) {
      const wrong = hero && hero.cls === Cls.Warrior;
      classReq.className = `item-class-req ${wrong ? 'req-unmet' : 'req-class-ok'}`;
      classReq.textContent = wrong ? '⚠ Cannot equip: Mage Only' : 'Mage Only';
      reqsBox.append(classReq);
    } else {
      classReq.className = 'item-class-req req-class-all';
      classReq.textContent = 'Warriors & Mages';
      reqsBox.append(classReq);
    }
  }

  if (reqsBox.hasChildNodes()) {
    root.append(reqsBox);
  }

  // Detailed Affixes & Stats List
  const stats = document.createElement('div');
  stats.className = 'item-stats-list';

  if (d.max > 0) {
    const div = document.createElement('div');
    div.className = 'item-stat-row damage-row';
    div.innerHTML = `<span class="stat-bullet">⚔</span> Blow Damage: <b class="stat-highlight">+${d.min}–${d.max} Physical</b>`;
    stats.append(div);
  }
  if (d.acc) {
    const div = document.createElement('div');
    div.className = 'item-stat-row acc-row';
    div.innerHTML = `<span class="stat-bullet">🎯</span> Attack Rating: <b class="stat-highlight">+${d.acc}</b>`;
    stats.append(div);
  }
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    const div = document.createElement('div');
    div.className = 'item-stat-row armor-row';
    div.innerHTML = `<span class="stat-bullet">🛡</span> Armor (${parts}): <b class="stat-highlight">+${d.def} Def, +${d.abs} Absorb</b>`;
    stats.append(div);
  }
  d.res.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.className = `item-stat-row res-row res-${SCHOOL_NAMES[n]}`;
      div.innerHTML = `<span class="stat-bullet">✦</span> Resist ${SCHOOL_NAMES[n]}: <b class="stat-highlight">+${v}%</b>`;
      stats.append(div);
    }
  });
  d.attr.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.className = 'item-stat-row attr-row';
      div.innerHTML = `<span class="stat-bullet">◈</span> +${v} to ${ATTR_NAMES[n]}`;
      stats.append(div);
    }
  });
  if (d.hp) {
    const div = document.createElement('div');
    div.className = 'item-stat-row hp-row';
    div.innerHTML = `<span class="stat-bullet">❤️</span> +${d.hp} Life`;
    stats.append(div);
  }
  if (d.mana) {
    const div = document.createElement('div');
    div.className = 'item-stat-row mana-row';
    div.innerHTML = `<span class="stat-bullet">🔷</span> +${d.mana} Mana`;
    stats.append(div);
  }
  if (d.pow) {
    const div = document.createElement('div');
    div.className = 'item-stat-row pow-row';
    div.innerHTML = `<span class="stat-bullet">🔮</span> +${d.pow}% Spell Power`;
    stats.append(div);
  }
  if (d.heal) {
    const div = document.createElement('div');
    div.className = 'item-stat-row heal-row';
    div.innerHTML = `<span class="stat-bullet">🧪</span> Restores ${d.heal} Life`;
    stats.append(div);
  }
  if (d.restore) {
    const div = document.createElement('div');
    div.className = 'item-stat-row restore-row';
    div.innerHTML = `<span class="stat-bullet">🧪</span> Restores ${d.restore} Mana`;
    stats.append(div);
  }
  if (d.grow) {
    const div = document.createElement('div');
    div.className = 'item-stat-row grow-row';
    div.innerHTML = `<span class="stat-bullet">✨</span> Raises ${ATTR_NAMES[d.grow - 1]} permanently by +1`;
    stats.append(div);
  }
  if (d.spell >= 0 && SPELLS[d.spell]) {
    const div = document.createElement('div');
    div.className = 'item-stat-row spell-row';
    div.innerHTML = `<span class="stat-bullet">📜</span> Teaches ${SPELLS[d.spell].name}`;
    stats.append(div);
  }

  if (stats.hasChildNodes()) {
    root.append(stats);
  }

  // Set Info Section
  const setDef = findSetByItemName(d.name);
  if (setDef) {
    const equippedNames = hero
      ? hero.eq.filter((id) => id >= 0).map((id) => getItemDef(id)?.name).filter(Boolean)
      : [];
    const equippedCount = setDef.pieces.filter((piece) => equippedNames.includes(piece.name)).length;

    const setSection = document.createElement('div');
    setSection.className = 'card-set-section';

    const setHeader = document.createElement('div');
    setHeader.className = 'set-name-header';
    setHeader.textContent = `Set: ${setDef.name} (${equippedCount}/${setDef.pieces.length})`;
    setSection.append(setHeader);

    const piecesList = document.createElement('ul');
    piecesList.className = 'set-pieces-list';
    for (const piece of setDef.pieces) {
      const isEquipped = equippedNames.includes(piece.name);
      const li = document.createElement('li');
      li.className = `set-piece ${isEquipped ? 'equipped' : 'unequipped'}`;
      li.textContent = `${isEquipped ? '✓ ' : '• '}${piece.name}`;
      piecesList.append(li);
    }
    setSection.append(piecesList);

    const bonusesDiv = document.createElement('div');
    bonusesDiv.className = 'set-bonuses';
    for (const bonus of setDef.bonuses) {
      const active = equippedCount >= bonus.pieces;
      const bDiv = document.createElement('div');
      bDiv.className = active ? 'set-bonus-active' : 'set-bonus-inactive';
      bDiv.textContent = `(${bonus.pieces} Pieces) ${formatBonusStats(bonus)}`;
      bonusesDiv.append(bDiv);
    }
    setSection.append(bonusesDiv);
    root.append(setSection);
  }

  return root;
}

export class HeroUi {
  tab: Tab = 'hero';
  private sel: Sel | null = null;
  private sig = '';
  private readonly sheet = document.getElementById('sheet')!;
  private readonly head = document.getElementById('sheet-head')!;
  private readonly body = document.getElementById('sheet-body')!;
  private readonly create = document.getElementById('create')!;

  private page = 0;
  private drag: Drag | null = null;
  private pending: { sim: Sim; tick: number } | null = null;
  private readonly feedback = el('p', 'hero-equipment-feedback');
  private suppressedPointer: number | null = null;
  private readonly codexUi: CodexUi;
  private readonly cardTooltip: HTMLElement = el('div', 'hero-floating-card-tooltip');

  constructor(private readonly ctx: HeroUiCtx) {
    this.codexUi = new CodexUi((el, tip) => this.ctx.tipOn(el, tip));
    this.cardTooltip.hidden = true;
    document.body.append(this.cardTooltip);
    this.feedback.setAttribute('role', 'status');
    this.sheet.addEventListener('pointerdown', (e) => this.press(e));
    this.sheet.addEventListener('click', (e) => {
      if (e.detail === 0 || !(e instanceof PointerEvent) || e.pointerId !== this.suppressedPointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.suppressedPointer = null;
    }, true);
    this.sheet.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.drag) this.cancelDrag(S.hero.dragCanceled);
      else this.close();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.cancelDrag();
      const pending = this.pending;
      // The host clears the queue only if its frame runs while hidden.
      requestAnimationFrame(() => {
        if (document.hidden && this.pending === pending) this.pending = null;
      });
    });
  }

  private intent(source: Sel): EquipmentIntent | null {
    const sim = this.ctx.sim();
    const hero = sim.hero;
    const action = equipmentAction(source);
    if (!hero || !action || this.pending) return null;
    return { sim, hero, source, action, count: hero.inv[source.slot]?.n ?? 0, stamp: equipmentStamp(hero, action) };
  }

  private preview(intent: EquipmentIntent) {
    const { sim, hero, source, action, stamp, count } = intent;
    if (sim !== this.ctx.sim() || sim.hero !== hero || stamp !== equipmentStamp(hero, action)) return null;
    if (source.from === 'inv' && hero.inv[source.slot]?.n !== count) return null;
    return equipmentPreview(hero, sim.cb.hp[hero.id] > 0, source);
  }

  private submit(intent: EquipmentIntent): void {
    if (this.pending) return;
    const preview = this.preview(intent);
    if (!preview || preview.why) {
      this.feedback.textContent = preview ? WHY_TEXT[preview.why] : S.hero.equipmentChanged;
      return;
    }
    this.pending = { sim: intent.sim, tick: intent.sim.tick };
    this.ctx.queue({ type: 'hero', ...intent.action, expectedEquipment: intent.stamp });
    this.render(true);
  }

  private press(e: PointerEvent): void {
    this.suppressedPointer = null;
    if (this.drag || !e.isPrimary || e.button !== 0 || !(e.target instanceof Element)) return;
    const source = e.target.closest<HTMLElement>('[data-source]');
    if (!source) return;
    const [from, slot, item] = source.dataset.source!.split('/');
    const intent = this.intent({ from: from === 'eq' ? 'eq' : 'inv', slot: Number(slot), item: Number(item) });
    if (!intent) return;
    const events = new AbortController();
    this.drag = { intent, pointer: e.pointerId, x: e.clientX, y: e.clientY, events, ghost: null, target: null, scrollFrame: 0 };
    const options = { signal: events.signal };
    window.addEventListener('pointermove', (event) => this.moveDrag(event), options);
    window.addEventListener('pointerup', (event) => this.endDrag(event), options);
    window.addEventListener('pointerdown', (event) => {
      if (event.pointerId !== e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, { ...options, capture: true });
    window.addEventListener('pointercancel', (event) => {
      if (event.pointerId === e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, options);
    this.sheet.addEventListener('lostpointercapture', (event) => {
      // Touch starts with implicit capture on the handle. Its loss bubbles
      // through the sheet when we transfer capture to the sheet itself.
      if (event.target === this.sheet && event.pointerId === e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, options);
    window.addEventListener('blur', () => this.cancelDrag(), options);
    window.addEventListener('resize', () => this.cancelDrag(), options);
  }

  private targetAt(e: PointerEvent): HTMLElement | null {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-equipment-target]');
    return target && this.body.contains(target) ? target : null;
  }

  private moveDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      this.sheet.setPointerCapture(e.pointerId);
      drag.ghost = el('div', 'hero-drag-ghost', getItemDef(drag.intent.source.item)?.name ?? '');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.prepend(itemIcon(drag.intent.source.item));
      this.sheet.append(drag.ghost);
      playPickupRustle();
    }
    const preview = this.preview(drag.intent);
    if (!preview) {
      this.cancelDrag(S.hero.equipmentChanged);
      return;
    }
    const ghost = drag.ghost;
    ghost.style.left = `${Math.max(0, Math.min(innerWidth - ghost.offsetWidth, e.clientX + 12))}px`;
    ghost.style.top = `${Math.max(0, Math.min(innerHeight - ghost.offsetHeight, e.clientY + (e.pointerType === 'touch' ? -32 : 12)))}px`;
    const target = this.targetAt(e);
    drag.target?.removeAttribute('data-drop-state');
    drag.target = target;
    const matches = target?.dataset.equipmentTarget === preview.target;
    if (target) target.dataset.dropState = matches && !preview.why ? 'valid' : 'invalid';
    this.feedback.textContent = preview.why ? WHY_TEXT[preview.why]
      : !matches ? S.hero.invalidEquipmentTarget
      : preview.replacement >= 0 ? `${S.hero.replaceEquipment} ${getItemDef(preview.replacement)?.name ?? ''}`
      : preview.target === 'pack' ? S.hero.returnToPack : S.hero.equip;
    this.scrollDrag(drag, e);
  }

  private scrollDrag(drag: Drag, e: PointerEvent): void {
    cancelAnimationFrame(drag.scrollFrame);
    const { top, bottom, left, right } = this.sheet.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < left || x >= right || y < top || y >= bottom) return;
    const edge = 28;
    const delta = y < top + edge ? -6 : y >= bottom - edge ? 6 : 0;
    if (!delta) return;
    drag.scrollFrame = requestAnimationFrame(() => {
      const before = this.sheet.scrollTop;
      this.sheet.scrollTop += delta;
      if (this.sheet.scrollTop !== before) this.moveDrag(e);
    });
  }

  private endDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    const preview = drag.ghost && this.preview(drag.intent);
    const target = drag.ghost && this.targetAt(e);
    this.cancelDrag();
    if (preview && target?.dataset.equipmentTarget === preview.target && !preview.why) {
      const def = getItemDef(drag.intent.source.item);
      const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
      playEquipSfx(isMetal);
      this.submit(drag.intent);
    } else if (drag.ghost) {
      this.feedback.textContent = preview && preview.why ? WHY_TEXT[preview.why] : S.hero.dragCanceled;
    }
  }

  private showCardTooltip(itemId: number, anchor: HTMLElement): void {
    if (!this.cardTooltip) return;
    const sim = this.ctx.sim();
    const hero = sim.hero;
    this.cardTooltip.replaceChildren(renderItemTooltipDom(itemId, hero));
    this.cardTooltip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const tipRect = this.cardTooltip.getBoundingClientRect();
    let left = rect.right + 10;
    if (left + tipRect.width > window.innerWidth - 12) {
      left = Math.max(12, rect.left - tipRect.width - 10);
    }
    const top = Math.max(12, Math.min(window.innerHeight - tipRect.height - 12, rect.top));
    this.cardTooltip.style.left = `${left}px`;
    this.cardTooltip.style.top = `${top}px`;
  }

  private hideCardTooltip(): void {
    if (this.cardTooltip) this.cardTooltip.hidden = true;
  }

  private cancelDrag(message = ''): void {
    this.hideCardTooltip();
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.events.abort();
    cancelAnimationFrame(drag.scrollFrame);
    if (drag.ghost) this.suppressedPointer = drag.pointer;
    drag.ghost?.remove();
    drag.target?.removeAttribute('data-drop-state');
    if (this.sheet.hasPointerCapture(drag.pointer)) this.sheet.releasePointerCapture(drag.pointer);
    this.feedback.textContent = message;
  }

  get isOpen(): boolean {
    return !this.sheet.hidden;
  }

  get creating(): boolean {
    return !this.create.hidden;
  }

  open(tab: Tab = this.tab): void {
    const h = this.ctx.sim().hero;
    if (h === null) {
      this.ctx.toast(S.hero.noHero);
      return;
    }
    this.ctx.onOpen();
    this.tab = tab;
    this.page = 0;
    this.sel = null;
    this.sheet.hidden = false;
    this.render(true);
    this.head.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  close(): void {
    this.cancelDrag();
    this.hideCardTooltip();
    this.sheet.hidden = true;
  }

  toggle(tab?: Tab): void {
    if (this.isOpen && (tab === undefined || this.tab === tab)) this.close();
    else this.open(tab ?? this.tab);
  }

  private go(n: number): void {
    if (n === 2) {
      this.close();
      this.ctx.openBook();
      return;
    }
    this.tab = n === 0 ? 'hero' : 'pack';
    this.body.querySelector('.hero-stats')?.remove();
    this.sel = null;
    this.render(true);
    this.head.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  /** Called a few times a second: redraws only when something shown has changed. */
  refresh(force = false): void {
    if (this.isOpen) this.render(force);
  }

  private act(c: Command): void {
    this.ctx.queue(c);
    window.setTimeout(() => this.refresh(true), 160);
  }

  private render(force: boolean): void {
    const sim = this.ctx.sim();
    const h = sim.hero;
    if (this.pending && (this.pending.sim !== sim || sim.tick > this.pending.tick)) this.pending = null;
    if (h === null) {
      this.close();
      return;
    }
    const cb = sim.cb;
    let canceled = false;
    if (this.drag && (this.drag.intent.sim !== sim || this.drag.intent.hero !== h || cb.hp[h.id] <= 0)) {
      canceled = this.drag.ghost !== null;
      this.cancelDrag(S.hero.dragCanceled);
    }
    if (this.sel && (this.sel.from === 'inv' ? h.inv[this.sel.slot]?.item !== this.sel.item : h.eq[this.sel.slot] !== this.sel.item)) this.sel = null;
    this.page = Math.min(this.page, Math.max(0, Math.ceil(h.inv.length / PACK_PAGE) - 1));
    const sig = JSON.stringify([h, cb.hp[h.id], cb.hpMax[h.id], cb.mana[h.id], cb.manaMax[h.id], this.sel, this.tab, this.page, this.pending !== null]);
    if (!force && sig === this.sig) return;
    canceled ||= this.drag?.ghost != null;
    this.cancelDrag();
    this.sig = sig;
    const statsOpen = this.body.querySelector<HTMLDetailsElement>('.hero-stats')?.open ?? (this.tab === 'hero' && innerWidth > 650);
    const focus = (document.activeElement as HTMLElement | null)?.dataset?.k;
    this.head.replaceChildren();
    const info = el('span', '', `${S.hero.classes[h.cls]}, ${S.hero.sexes[h.female ? 1 : 0].toLowerCase()} · ${DIFF_NAMES[h.diff]}`);
    const codex = button('🏆 Codex', 'codex', () => this.codexUi.toggle());
    const close = button(S.hero.close, 'close', () => this.close());
    const sp = el('span', 'spacer');
    this.head.append(tabStrip(this.tab === 'hero' ? 0 : 1, (n) => this.go(n)), info, sp, codex, close);
    this.body.replaceChildren();
    this.feedback.textContent = this.pending ? S.hero.equipmentPending : canceled ? S.hero.dragCanceled : '';
    const workspace = el('div', 'hero-workspace');
    workspace.append(this.renderEquipment(h), this.renderPack(h));
    this.body.append(el('p', 'note hero-drag-help', S.hero.dragHelp), this.feedback, workspace);
    if (this.sel) this.body.append(this.detail(h, this.sel));
    else this.body.append(el('p', 'note', S.hero.noSel));
    this.body.append(this.renderHero(h, sim, statsOpen));
    if (focus) {
      const next = this.sheet.querySelector<HTMLElement>(`[data-k="${focus}"]:not(:disabled)`);
      const source = this.sel && this.sheet.querySelector<HTMLElement>(`[data-k="${this.sel.from}${this.sel.slot}"]`);
      (next || source || this.head.querySelector<HTMLElement>('[aria-selected="true"]'))?.focus({ preventScroll: true });
    }
  }

  private weightLine(h: HeroState): HTMLElement {
    const d = derive(h);
    const m = meter(d.weight >= d.capacity ? 'wt over' : 'wt', d.weight, d.capacity);
    return line(S.hero.weight, `${d.weight} / ${d.capacity}`, '', m);
  }

  private renderHero(h: HeroState, sim: Sim, open: boolean): HTMLElement {
    const cb = sim.cb;
    const i = h.id;
    const d = derive(h);
    const base = DEFS[Kind.Hero];
    const o = i * MODN;

    const b = el('details', 'hero-stats');
    b.open = open;
    b.append(el('summary', '', S.hero.heroStats));

    // 1. Hero Level & Ornate Gold Progress Bar
    const heroLevel = h.level ?? 1;
    const xpCur = h.xp ?? 0;
    const xpMax = h.xpNext ?? 100;
    const overallProgressPct = Math.min(100, Math.round((xpCur / Math.max(1, xpMax)) * 100));

    const levelWrap = el('div', 'hero-level-wrap');
    const levelTitle = el('div', 'hero-level-title');
    levelTitle.innerHTML = `<span class="hl-class">${S.hero.classes[h.cls]}</span> · <span class="hl-badge">Level ${heroLevel}</span> <span class="hl-pct">${xpCur}/${xpMax} XP (${overallProgressPct}%)${h.statPoints ? ` · <b style="color:#ffd700">+${h.statPoints} Stat Points Available</b>` : ''}</span>`;

    const goldProgressBar = el('div', 'hero-gold-progress-bar');
    const goldProgressFill = el('div', 'gold-progress-fill');
    goldProgressFill.style.width = `${overallProgressPct}%`;
    goldProgressBar.append(goldProgressFill);
    levelWrap.append(levelTitle, goldProgressBar);
    b.append(levelWrap);

    // 2. Vitality & Mana Gothic Resource Gauges
    const gaugesRow = el('div', 'hero-resource-gauges');

    const hpGauge = el('div', 'resource-gauge hp-gauge');
    const hpFill = el('div', 'resource-fill hp-fill');
    hpFill.style.width = `${Math.max(0, Math.min(100, (cb.hp[i] / Math.max(1, cb.hpMax[i])) * 100))}%`;
    const hpInfo = el('div', 'resource-info');
    hpInfo.innerHTML = `<span class="res-title">❤️ Life: <b>${cb.hp[i]} / ${cb.hpMax[i]}</b></span><span class="res-sub">+${1 + cb.mod[o + M.Regen]}/sec regen</span>`;
    hpGauge.append(hpFill, hpInfo);

    const mpGauge = el('div', 'resource-gauge mp-gauge');
    const mpFill = el('div', 'resource-fill mp-fill');
    mpFill.style.width = `${Math.max(0, Math.min(100, (cb.mana[i] / Math.max(1, cb.manaMax[i])) * 100))}%`;
    const mpInfo = el('div', 'resource-info');
    mpInfo.innerHTML = `<span class="res-title">🔷 Mana: <b>${cb.mana[i]} / ${cb.manaMax[i]}</b></span><span class="res-sub">+${cb.mod[o + M.Pow]}% spell power</span>`;
    mpGauge.append(mpFill, mpInfo);

    gaugesRow.append(hpGauge, mpGauge);
    b.append(gaugesRow);

    // 3. Two Column Layout: Left = Primary Attributes & Skills; Right = Combat Stats & Resistances
    const cols = el('div', 'hero-char-cols');

    // Left Column
    const left = el('div', 'hero-char-left');

    // Four Primary Attributes
    left.append(el('h3', 'section-hdr', S.hero.attributes));
    const attrGrid = el('div', 'hero-attr-grid');
    const attrCrests = ['🛡', '🦅', '👁', '☀️'];
    const attrSub = [
      'Increases blow damage & item carry weight',
      'Increases attack rating & dodge defense',
      'Increases mana pool & spell effectiveness',
      'Increases mana recovery & magic resistance',
    ];

    for (let k = 0; k < 4; k++) {
      const bonus = d.attr[k] - h.attr[k];
      const card = el('div', 'hero-attr-card');
      card.title = `${S.hero.attrTips[k]} (${attrSub[k]})`;

      const iconBox = el('div', `attr-crest-box attr-c-${k}`);
      iconBox.textContent = attrCrests[k];

      const textBox = el('div', 'attr-text-box');
      const nameSpan = el('div', 'attr-name', S.hero.attrs[k]);
      const valSpan = el('div', 'attr-val');
      valSpan.innerHTML = bonus
        ? `<b class="attr-total">${d.attr[k]}</b> <small class="attr-breakdown">(${h.attr[k]}${bonus > 0 ? '+' : ''}${bonus})</small>`
        : `<b class="attr-total">${d.attr[k]}</b>`;
      textBox.append(nameSpan, valSpan);

      const elixir = h.inv.find((s) => getItemDef(s.item)?.grow === k + 1);
      const hasPoints = (h.statPoints ?? 0) > 0;
      const plusBtn = el('button', `attr-plus-btn ${hasPoints || elixir ? 'active' : 'locked'}`);
      plusBtn.type = 'button';
      plusBtn.textContent = '+';
      if (hasPoints) {
        plusBtn.title = `Allocate 1 Stat Point to ${ATTR_NAMES[k]} (${h.statPoints} points remaining)`;
        plusBtn.onclick = (e) => {
          e.stopPropagation();
          this.act({ type: 'hero', op: 'stat', attr: k });
        };
      } else if (elixir) {
        plusBtn.title = `Drink ${getItemDef(elixir.item)?.name ?? 'Elixir'} (+1 ${ATTR_NAMES[k]})`;
        plusBtn.onclick = (e) => {
          e.stopPropagation();
          this.act({ type: 'hero', op: 'use', item: elixir.item });
        };
      } else {
        plusBtn.title = `Raise attributes with level-up stat points or rare Elixirs`;
        plusBtn.disabled = true;
      }

      card.append(iconBox, textBox, plusBtn);
      attrGrid.append(card);
    }
    left.append(attrGrid);

    // Hero Skills (Blade, Guard, Sorcery)
    left.append(el('h3', 'section-hdr', S.hero.skills));
    const skillsContainer = el('div', 'hero-skills-list');
    const skillIcons = ['⚔', '🛡', '🔮'];
    const skillEffects = [
      (lvl: number) => `+${lvl * 5}% Blow Damage`,
      (lvl: number) => `+${Math.floor(lvl / 3)} Damage Absorb`,
      (lvl: number) => `+${lvl * 4}% Spell Power`,
    ];

    for (let k = 0; k < 3; k++) {
      const { level, used, needed, remaining } = skillProgress(h, k);
      const card = el('div', 'hero-skill-card');
      card.dataset.skill = String(k);

      const hdr = el('div', 'skill-card-hdr');
      hdr.innerHTML = `<span class="skill-icon-name">${skillIcons[k]} ${SKILL_NAMES[k]}</span> <span class="skill-rank-badge">Rank ${level} / ${SKILL_MAX}</span>`;

      const gaugeWrap = el('div', 'skill-gauge-wrap');
      const gaugeFill = el('div', 'skill-gauge-fill');
      const pct = needed === null ? 100 : Math.min(100, (used / needed) * 100);
      gaugeFill.style.width = `${pct}%`;
      gaugeWrap.append(gaugeFill);

      const desc = el('div', 'skill-card-desc');
      const summary = needed === null ? 'Mastered (Maximum Level)' : `${used} / ${needed} uses · ${remaining} to Rank ${level + 1}`;
      desc.innerHTML = `<span class="skill-summary">${summary}</span> <span class="skill-bonus">(${skillEffects[k](level)})</span>`;

      card.append(hdr, gaugeWrap, desc);
      skillsContainer.append(card);
    }
    left.append(skillsContainer);

    // Right Column: Combat Statistics & Elemental Resistances
    const right = el('div', 'hero-char-right');

    right.append(el('h3', 'section-hdr', S.hero.stats));
    const combatGrid = el('div', 'combat-stats-grid');

    const totalAcc = base.acc + cb.mod[o + M.Acc];
    const hitChance = Math.max(15, Math.min(95, 70 + (totalAcc - 4) * 3));
    const tileAcc = el('div', 'combat-stat-tile');
    tileAcc.innerHTML = `<div class="cstat-icon">🎯</div><div class="cstat-body"><div class="cstat-label">${S.hit}</div><div class="cstat-val">${totalAcc} <small class="cstat-sub">(~${hitChance}% Hit)</small></div></div>`;
    tileAcc.title = `Attack Rating against standard defense. Base: ${base.acc}, Mod: ${cb.mod[o + M.Acc]}`;

    const minDmg = base.min + cb.mod[o + M.Min];
    const maxDmg = base.max + cb.mod[o + M.Max];
    const tileDmg = el('div', 'combat-stat-tile');
    tileDmg.innerHTML = `<div class="cstat-icon">⚔</div><div class="cstat-body"><div class="cstat-label">${S.hero.blowDamage}</div><div class="cstat-val">${minDmg}–${maxDmg} <small class="cstat-sub">Physical</small></div></div>`;
    tileDmg.title = `Weapon and blow damage range per hit`;

    const avgDef = Math.round(S.parts.reduce((sum, _, k) => sum + (base.def + cb.mod[o + M.Def] + base.pdef[k] + cb.mod[o + M.PDef + k]), 0) / 4);
    const avgAbs = Math.round(S.parts.reduce((sum, _, k) => sum + (cb.mod[o + M.Abs] + base.pabs[k] + cb.mod[o + M.PAbs + k]), 0) / 4);
    const tileArmor = el('div', 'combat-stat-tile');
    const partDetails = S.parts.map((p, k) => `${p}: ${base.def + cb.mod[o + M.Def] + base.pdef[k] + cb.mod[o + M.PDef + k]} Def / ${cb.mod[o + M.Abs] + base.pabs[k] + cb.mod[o + M.PAbs + k]} Abs`).join(' · ');
    tileArmor.innerHTML = `<div class="cstat-icon">🛡</div><div class="cstat-body"><div class="cstat-label">Armor Absorption</div><div class="cstat-val">${avgDef} Def <span class="cstat-sep">/</span> ${avgAbs} Abs</div></div>`;
    tileArmor.title = partDetails;

    const hasShield = h.eq[Slot.Shield] >= 0;
    const blockChance = hasShield ? Math.min(75, 20 + h.skill[1] * 3 + (getItemDef(h.eq[Slot.Shield])?.def ?? 0) * 2) : 0;
    const tileBlock = el('div', 'combat-stat-tile');
    tileBlock.innerHTML = `<div class="cstat-icon">🔰</div><div class="cstat-body"><div class="cstat-label">Block Chance</div><div class="cstat-val">${blockChance}% <small class="cstat-sub">${hasShield ? 'Shield Active' : 'No Shield'}</small></div></div>`;
    tileBlock.title = hasShield ? `Shield Block chance scaling with Guard Skill (Rank ${h.skill[1]}) and Shield Defense` : `Requires an equipped offhand shield`;

    combatGrid.append(tileAcc, tileDmg, tileArmor, tileBlock);
    right.append(combatGrid);

    // Elemental Resistances Grid with Colored Shield Badges
    right.append(el('h3', 'section-hdr', 'Elemental Resistances'));
    const resGrid = el('div', 'elemental-res-grid');
    const resMeta = [
      { name: 'Fire', color: 'ruby', icon: '🔥', cap: 90 },
      { name: 'Cold', color: 'frost', icon: '❄', cap: 90 },
      { name: 'Lightning', color: 'amber', icon: '⚡', cap: 90 },
      { name: 'Poison', color: 'emerald', icon: '🍃', cap: 90 },
      { name: 'Astral', color: 'amethyst', icon: '🔮', cap: 90 },
    ];

    for (let k = 0; k < 5; k++) {
      const val = Math.min(resMeta[k].cap, base.res[k] + cb.mod[o + M.Res + k]);
      const badge = el('div', `res-shield-badge res-badge-${resMeta[k].color}`);
      badge.innerHTML = `
        <div class="badge-icon">${resMeta[k].icon}</div>
        <div class="badge-text">
          <span class="badge-name">${resMeta[k].name}</span>
          <span class="badge-val">${val}%</span>
        </div>
      `;
      badge.title = `${resMeta[k].name} Resistance: ${val}% (reduces incoming ${resMeta[k].name.toLowerCase()} spell and environmental damage)`;
      resGrid.append(badge);
    }
    right.append(resGrid);

    cols.append(left, right);
    b.append(cols);
    return b;
  }

  private cell(face: HTMLButtonElement, source: Sel): HTMLElement {
    const cell = el('div', 'hero-gear-cell');
    cell.append(face);
    if (!equipmentAction(source)) return cell;
    const key = `${source.from}/${source.slot}/${source.item}`;
    face.dataset.source = key;
    const handle = button('⠿', `drag-${face.dataset.k}`, () => face.click());
    handle.className = 'hero-drag-handle';
    handle.dataset.source = key;
    handle.setAttribute('aria-label', `${S.hero.dragItem} ${getItemDef(source.item)?.name ?? ''}`);
    cell.append(handle);
    return cell;
  }

  private renderEquipment(h: HeroState): HTMLElement {
    const panel = el('section', 'hero-gear-panel');
    panel.append(el('h3', '', S.hero.equipment));
    const slots = el('div', 'hero-gear-board');
    slots.append(figure(h));
    for (let s = 0; s < SLOT_COUNT; s++) {
      const id = h.eq[s];
      const d = id >= 0 ? getItemDef(id) : null;
      const bt = el('button');
      bt.type = 'button';
      bt.dataset.k = `eq${s}`;
      if (id >= 0 && d) {
        bt.className = 'slot-btn slot-equipped';
        bt.append(itemIcon(id));
        const labelBox = el('div', 'slot-text-wrap');
        labelBox.append(el('span', 'slot-item-name', d.name));
        labelBox.append(el('small', 'slot-meta-name', `${SLOT_NAMES[s]} · T${d.tier}`));
        bt.append(labelBox);
        this.ctx.tipOn(bt, formatItemTooltip(id, h));
        const isSet = isSetItem(d.name);
        const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
        bt.dataset.rarity = rarity;
        if (isSet) bt.classList.add('rarity-set');
        bt.addEventListener('pointerenter', (e) => {
          if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(id, bt);
        });
        bt.addEventListener('pointerleave', () => this.hideCardTooltip());
      } else {
        bt.className = 'slot-btn slot-empty';
        bt.append(slotWatermarkIcon(s));
        const labelBox = el('div', 'slot-text-wrap');
        labelBox.append(el('span', 'slot-empty-title', SLOT_NAMES[s]));
        labelBox.append(el('small', 'slot-empty-sub', S.hero.empty));
        bt.append(labelBox);
      }
      bt.onclick = () => {
        if (this.sel && this.sel.from === 'inv') {
          // Click-to-place: user selected an inventory item, now clicks an equipment slot
          const intent = this.intent(this.sel);
          if (intent) {
            const preview = this.preview(intent);
            if (preview && preview.target === `eq${s}` && !preview.why) {
              const def = getItemDef(this.sel.item);
              const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
              playEquipSfx(isMetal);
              this.sel = null;
              this.submit(intent);
              return;
            }
          }
        }
        if (id < 0) return;
        this.hideCardTooltip();
        this.sel = this.sel?.from === 'eq' && this.sel.slot === s ? null : { from: 'eq', item: id, slot: s };
        if (this.sel) playPickupRustle();
        this.render(true);
      };
      bt.oncontextmenu = (e) => {
        if (id < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'eq', item: id, slot: s });
        if (intent) {
          playPickupRustle();
          this.submit(intent);
        }
      };
      bt.ondblclick = (e) => {
        if (id < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'eq', item: id, slot: s });
        if (intent) {
          playPickupRustle();
          this.submit(intent);
        }
      };
      bt.classList.toggle('sel', this.sel?.from === 'eq' && this.sel.slot === s);
      const cell = id < 0 ? el('div', 'hero-gear-cell') : this.cell(bt, { from: 'eq', item: id, slot: s });
      if (id < 0) cell.append(bt);
      cell.dataset.equipmentTarget = `eq${s}`;
      slots.append(cell);
    }

    // Waist: Belt slot (displays belt / potion belt status)
    const beltCell = el('div', 'hero-gear-cell');
    beltCell.dataset.equipmentTarget = 'eq8';
    const beltBt = el('button', 'slot-btn slot-empty');
    beltBt.type = 'button';
    beltBt.dataset.k = 'eq8';
    beltBt.append(slotWatermarkIcon(8));
    const beltLabel = el('div', 'slot-text-wrap');
    beltLabel.append(el('span', 'slot-empty-title', 'Waist (Belt)'));
    const beltCount = h.inv.filter((s) => getItemDef(s.item)?.kind === Ik.Potion).reduce((sum, s) => sum + s.n, 0);
    beltLabel.append(el('small', 'slot-empty-sub', beltCount > 0 ? `${beltCount} Potions` : 'Potion Belt'));
    beltBt.append(beltLabel);
    beltBt.title = 'Waist Belt: Quick-quaff potion belt (Keys 1-4)';
    beltCell.append(beltBt);
    slots.append(beltCell);

    // Finger 2 (Right Ring) slot
    const ring2Cell = el('div', 'hero-gear-cell finger-2');
    ring2Cell.dataset.equipmentTarget = 'eq5';
    const ring2Bt = el('button', 'slot-btn slot-empty');
    ring2Bt.type = 'button';
    ring2Bt.dataset.k = 'eq5_alt';
    ring2Bt.append(slotWatermarkIcon(Slot.Ring));
    const ring2Label = el('div', 'slot-text-wrap');
    ring2Label.append(el('span', 'slot-empty-title', 'Finger 2 (Ring)'));
    ring2Label.append(el('small', 'slot-empty-sub', S.hero.empty));
    ring2Bt.append(ring2Label);
    ring2Bt.title = 'Finger 2 (Ring): Secondary ring finger';
    ring2Cell.append(ring2Bt);
    slots.append(ring2Cell);

    panel.append(slots);
    return panel;
  }

  private renderPack(h: HeroState): HTMLElement {
    const panel = el('section', 'hero-gear-panel');
    panel.append(el('h3', '', `${S.hero.pack} (${h.inv.length}/${INV_MAX})`), this.weightLine(h));
    const back = el('div', 'hero-return', S.hero.returnToPack);
    back.dataset.equipmentTarget = 'pack';
    back.onclick = () => {
      if (this.sel && this.sel.from === 'eq') {
        const intent = this.intent(this.sel);
        if (intent) {
          playPickupRustle();
          this.sel = null;
          this.submit(intent);
        }
      }
    };
    panel.append(back);
    const grid = el('div', 'items hero-pack-grid');
    for (let index = 0; index < PACK_PAGE; index++) {
      const n = this.page * PACK_PAGE + index;
      const st = h.inv[n];
      if (!st) {
        const empty = el('div', 'hero-pack-empty', S.hero.empty);
        empty.dataset.equipmentTarget = 'pack';
        empty.onclick = () => {
          if (this.sel && this.sel.from === 'eq') {
            const intent = this.intent(this.sel);
            if (intent) {
              playPickupRustle();
              this.sel = null;
              this.submit(intent);
            }
          }
        };
        grid.append(empty);
        continue;
      }
      const d = getItemDef(st.item);
      if (!d) continue;
      const bt = button(st.n > 1 ? `${d.name} x${st.n}` : d.name, `inv${n}`, () => {
        this.hideCardTooltip();
        this.sel = this.sel?.from === 'inv' && this.sel.slot === n ? null : { from: 'inv', item: st.item, slot: n };
        if (this.sel) playPickupRustle();
        this.render(true);
      }, `${S.hero.level} ${d.tier} · ${d.w * st.n} ${S.hero.weight.toLowerCase()}`);
      bt.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'inv', item: st.item, slot: n });
        if (intent) {
          const preview = this.preview(intent);
          if (preview && !preview.why) {
            const def = getItemDef(st.item);
            const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
            playEquipSfx(isMetal);
            this.submit(intent);
          }
        }
      };
      bt.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'inv', item: st.item, slot: n });
        if (intent) {
          const preview = this.preview(intent);
          if (preview && !preview.why) {
            const def = getItemDef(st.item);
            const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
            playEquipSfx(isMetal);
            this.submit(intent);
          }
        }
      };
      bt.prepend(itemIcon(st.item));
      bt.classList.toggle('sel', this.sel?.from === 'inv' && this.sel.slot === n);
      bt.classList.toggle('no', blocker(h, st.item) !== 0);
      this.ctx.tipOn(bt, formatItemTooltip(st.item, h));
      const isSet = isSetItem(d.name);
      const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
      bt.dataset.rarity = rarity;
      if (isSet) bt.classList.add('rarity-set');
      bt.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(st.item, bt);
      });
      bt.addEventListener('pointerleave', () => this.hideCardTooltip());
      grid.append(this.cell(bt, { from: 'inv', item: st.item, slot: n }));
    }
    const pages = el('div', 'hero-pack-pages');
    const go = (delta: number) => {
      if (this.drag) return;
      this.hideCardTooltip();
      this.page += delta;
      this.render(true);
    };
    const prev = button('‹', 'pack-prev', () => go(-1));
    const next = button('›', 'pack-next', () => go(1));
    const count = Math.max(1, Math.ceil(h.inv.length / PACK_PAGE));
    prev.disabled = this.page === 0;
    next.disabled = this.page + 1 >= count;
    prev.setAttribute('aria-label', S.town.previousPage);
    next.setAttribute('aria-label', S.town.nextPage);
    pages.append(prev, el('span', '', `${this.page + 1} / ${count}`), next);
    panel.append(grid, pages);
    if (!h.inv.length) panel.append(el('p', 'note', S.hero.noItems));
    return panel;
  }

  private detail(h: HeroState, sel: Sel): HTMLElement {
    const d = getItemDef(sel.item);
    const box = el('div', 'detail');
    if (!d) return box;
    box.append(renderItemTooltipDom(sel.item, h));
    const intent = this.intent(sel);
    const preview = equipmentPreview(h, this.ctx.sim().cb.hp[h.id] > 0, sel);
    const why = preview?.why ?? (sel.from === 'inv' ? blocker(h, sel.item) : 0);
    if (why) box.append(el('div', 'note', `⚠ ${WHY_TEXT[why]}`));
    if (preview && preview.replacement >= 0) box.append(el('p', 'note', `${S.hero.replaceEquipment} ${getItemDef(preview.replacement)?.name ?? ''}`));
    const acts = el('div', 'acts');
    if (preview) {
      const worn = sel.from === 'eq';
      const action = button(worn ? S.hero.unequip : S.hero.equip, worn ? 'act-unequip' : 'act-use', () => {
        if (intent) this.submit(intent);
      });
      action.disabled = !intent || why !== 0;
      acts.append(action);
    }
    if (sel.from === 'inv') {
      if (!preview) {
        const go = button(d.kind === Ik.Learn ? S.hero.learn : S.hero.use, 'act-use', () => this.act({ type: 'hero', op: 'use', item: sel.item }));
        go.disabled = why !== 0;
        acts.append(go);
      }
      acts.append(button(S.hero.drop, 'act-drop', () => this.act({ type: 'hero', op: 'drop', item: sel.item })));
    }
    box.append(acts);
    if (sel.from === 'inv') {
      box.append(el('div', 'note', S.hero.quickSlot));
      const qs = el('div', 'qs');
      for (let n = 0; n < 9; n++) qs.append(button(`F${n + 4}`, `qs${n}`, () => {
        this.ctx.setSlot(n, 100 + sel.item);
        this.ctx.toast(S.hero.slotSet);
      }));
      box.append(qs);
    }
    return box;
  }

  /** The creation sheet. `onStart` runs once with the choice. */
  showCreate(onStart: (cls: number, female: boolean, diff: number) => void): void {
    this.ctx.onOpen();
    this.close();
    let cls = 0;
    let female = false;
    let diff = 1;
    const draw = (): void => {
      const c = this.create;
      c.replaceChildren();
      const head = el('div', 'sheet-head');
      head.append(el('h2', '', S.hero.createTitle));
      c.append(head);
      const cols = el('div', 'cols');
      const left = el('div');
      const right = el('div');
      cols.append(left, right);
      const group = (title: string, names: readonly string[], cur: number, tips: readonly string[] | null, set: (n: number) => void): void => {
        left.append(el('h3', '', title));
        const row = el('div', 'choice');
        row.setAttribute('role', 'radiogroup');
        names.forEach((name, n) => {
          const b = button(name, `${title}${n}`, () => {
            set(n);
            draw();
            c.querySelector<HTMLElement>(`[data-k="${title}${n}"]`)?.focus();
          });
          b.setAttribute('aria-pressed', String(n === cur));
          if (tips) b.title = tips[n];
          row.append(b);
        });
        left.append(row);
        if (tips) left.append(el('p', 'note', tips[cur]));
      };
      group(S.hero.cls, S.hero.classes, cls, S.hero.classTips, (n) => (cls = n));
      group(S.hero.sex, S.hero.sexes, female ? 1 : 0, null, (n) => (female = n === 1));
      group(S.hero.diff, S.hero.diffs, diff, S.hero.diffTips, (n) => (diff = n));
      const st = startState(0, cls, female, diff);
      const d = derive(st);
      const spells = SPELLS.filter((_, sid) => ((st.known >>> sid) & 1) === 1).map((s) => s.name).join(', ');
      right.append(el('h3', '', S.hero.attributes));
      const lines = el('div', 'lines');
      for (let k = 0; k < 4; k++) lines.append(line(S.hero.attrs[k], String(d.attr[k]), S.hero.attrTips[k]));
      lines.append(line(S.hp, String(d.hpMax)), line(S.mana, String(d.manaMax)), line(S.hero.weight, `${d.capacity}`), line(S.spellsBtn, spells));
      right.append(lines);
      c.append(cols);
      const go = button(S.hero.start, 'start', () => {
        this.create.hidden = true;
        onStart(cls, female, diff);
      });
      go.style.marginTop = '12px';
      go.style.width = '100%';
      c.append(go);
    };
    draw();
    this.create.hidden = false;
    this.create.querySelector<HTMLElement>('[data-k="start"]')?.focus();
  }
}
