import { Slot } from './sim/items';
import type { HeroState } from './sim/hero';
import { equipmentLayers } from './hero-presentation';

export function slotWatermarkIcon(slot: number): SVGSVGElement {
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

export function figure(h: HeroState): SVGSVGElement {
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

  // Background Alcove & Gothic Arch
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
