import type { MapDoc } from './mapdoc';
import { speakerName, type MissionContent } from './missioncontent';
import { getPlaquesByAct, loadLocationPlaques, type CampaignStage, type LocationPlaqueEntry } from './data/text/index';
import { Kind } from './sim/combat';
import type { Sim } from './sim/sim';
import { S } from './strings';
import {
  blip,
  play,
  playDialogueVoice,
  playNpcBark,
  playSpeakerSwitchThrill,
  setDialogueDucking,
  stopDialogueVoice,
} from './audio';
import { resolveDialogueVoiceClip } from './audio-catalog';

/** Host callbacks: the game owns the pause flag. */
export interface MissionHost {
  pause(on: boolean): void;
  navigateTo?(tx: number, ty: number, label: string): void;
}

const OBJ_MARK = ['', '◻', '✔', '✖'];

import type { QuestObjective, QuestReward, QuestDossier } from './questlog';
export type { QuestObjective, QuestReward, QuestDossier };

/** SVG Vector Portraits for Gothic Characters */
export function getWardenHalePortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-hale" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#2c3b47"/>
      <stop offset="100%" stop-color="#0f161c"/>
    </radialGradient>
    <linearGradient id="iron-armor" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9aa7b2"/>
      <stop offset="50%" stop-color="#5a6873"/>
      <stop offset="100%" stop-color="#2c353c"/>
    </linearGradient>
    <linearGradient id="gold-trim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffe699"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#8a6d1c"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-hale)"/>
  <path d="M 15 120 Q 30 75 60 70 Q 90 75 105 120 Z" fill="#1b2832" stroke="#0e171d" stroke-width="2"/>
  <path d="M 32 88 L 60 98 L 88 88 L 82 120 L 38 120 Z" fill="url(#iron-armor)" stroke="#1a2026" stroke-width="2"/>
  <path d="M 45 92 L 60 97 L 75 92" stroke="url(#gold-trim)" stroke-width="2.5" fill="none"/>
  <path d="M 42 55 L 78 55 L 75 80 L 45 80 Z" fill="#3d4952" stroke="#222b31" stroke-width="1.5"/>
  <path d="M 34 52 C 32 20 88 20 86 52 C 86 64 80 72 60 74 C 40 72 34 64 34 52 Z" fill="url(#iron-armor)" stroke="#1c252c" stroke-width="2.5"/>
  <path d="M 58 18 L 62 18 L 62 60 L 58 60 Z" fill="url(#gold-trim)"/>
  <path d="M 35 48 C 45 42 75 42 85 48 L 84 54 C 74 48 46 48 36 54 Z" fill="url(#gold-trim)"/>
  <rect x="42" y="50" width="36" height="5" rx="1.5" fill="#080c0f"/>
  <circle cx="51" cy="52.5" r="1.5" fill="#a8d4ff"/>
  <circle cx="69" cy="52.5" r="1.5" fill="#a8d4ff"/>
  <line x1="52" y1="62" x2="52" y2="67" stroke="#10171d" stroke-width="1.5"/>
  <line x1="56" y1="61" x2="56" y2="68" stroke="#10171d" stroke-width="1.5"/>
  <line x1="60" y1="60" x2="60" y2="69" stroke="#10171d" stroke-width="1.5"/>
  <line x1="64" y1="61" x2="64" y2="68" stroke="#10171d" stroke-width="1.5"/>
  <line x1="68" y1="62" x2="68" y2="67" stroke="#10171d" stroke-width="1.5"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="url(#gold-trim)" stroke-width="2.5"/>
  <rect x="5" y="5" width="110" height="110" rx="2" fill="none" stroke="#222b31" stroke-width="1"/>
</svg>`;
}

export function getChieftainGroktarPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-grok" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#4a1c14"/>
      <stop offset="100%" stop-color="#140806"/>
    </radialGradient>
    <linearGradient id="gnoll-fur" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5a2b"/>
      <stop offset="50%" stop-color="#5c3818"/>
      <stop offset="100%" stop-color="#36200d"/>
    </linearGradient>
    <linearGradient id="blood-red" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4422"/>
      <stop offset="100%" stop-color="#881100"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-grok)"/>
  <path d="M 10 120 L 35 85 L 85 85 L 110 120 Z" fill="#2b231f" stroke="#140f0c" stroke-width="2"/>
  <path d="M 25 80 L 32 65 L 38 82 Z" fill="#66554b" stroke="#140f0c" stroke-width="1.5"/>
  <path d="M 82 82 L 88 65 L 95 80 Z" fill="#66554b" stroke="#140f0c" stroke-width="1.5"/>
  <circle cx="45" cy="98" r="4" fill="#d9cfbe"/>
  <circle cx="60" cy="102" r="5" fill="#e8dfce"/>
  <circle cx="75" cy="98" r="4" fill="#d9cfbe"/>
  <path d="M 28 42 L 18 16 L 44 32 Z" fill="#4a2d14" stroke="#1c1107" stroke-width="2"/>
  <circle cx="21" cy="20" r="2.5" fill="none" stroke="#d4af37" stroke-width="1.5"/>
  <path d="M 92 42 L 102 16 L 76 32 Z" fill="#4a2d14" stroke="#1c1107" stroke-width="2"/>
  <circle cx="99" cy="20" r="2.5" fill="none" stroke="#d4af37" stroke-width="1.5"/>
  <path d="M 32 50 C 25 28 95 28 88 50 C 94 72 82 92 60 92 C 38 92 26 72 32 50 Z" fill="url(#gnoll-fur)" stroke="#1a0f07" stroke-width="2"/>
  <path d="M 60 18 L 56 36 L 60 40 L 64 36 Z" fill="#1f140c"/>
  <path d="M 60 30 L 54 48 L 60 52 L 66 48 Z" fill="#1f140c"/>
  <path d="M 38 40 L 60 48 L 82 40 L 76 45 L 60 52 L 44 45 Z" fill="url(#blood-red)"/>
  <ellipse cx="46" cy="52" rx="4.5" ry="3.5" fill="#ffaa00"/>
  <ellipse cx="74" cy="52" rx="4.5" ry="3.5" fill="#ffaa00"/>
  <circle cx="46" cy="52" r="1.5" fill="#1a0000"/>
  <circle cx="74" cy="52" r="1.5" fill="#1a0000"/>
  <line x1="42" y1="46" x2="68" y2="76" stroke="#991515" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="56" x2="52" y2="52" stroke="#551010" stroke-width="1.5"/>
  <line x1="58" y1="66" x2="62" y2="62" stroke="#551010" stroke-width="1.5"/>
  <path d="M 48 64 Q 60 58 72 64 L 70 78 Q 60 84 50 78 Z" fill="#24140b"/>
  <ellipse cx="60" cy="65" rx="5" ry="3.5" fill="#100804"/>
  <polygon points="52,76 54,84 56,76" fill="#fff5d9"/>
  <polygon points="64,76 66,84 68,76" fill="#fff5d9"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#8a2818" stroke-width="2.5"/>
  <rect x="5" y="5" width="110" height="110" rx="2" fill="none" stroke="#22110c" stroke-width="1"/>
</svg>`;
}

export function getHeroPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-hero" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#3a2f1c"/>
      <stop offset="100%" stop-color="#14100c"/>
    </radialGradient>
    <linearGradient id="hero-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff0aa"/>
      <stop offset="50%" stop-color="#d8b24a"/>
      <stop offset="100%" stop-color="#735a1a"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-hero)"/>
  <path d="M 20 120 Q 35 78 60 75 Q 85 78 100 120 Z" fill="#2e2518" stroke="#17120a" stroke-width="2"/>
  <path d="M 38 88 L 60 100 L 82 88 L 76 120 L 44 120 Z" fill="#5c4826" stroke="#2a1f0d" stroke-width="2"/>
  <circle cx="60" cy="48" r="26" fill="#755a30" stroke="#362610" stroke-width="2"/>
  <path d="M 36 46 C 40 22 80 22 84 46 C 84 58 78 66 60 68 C 42 66 36 58 36 46 Z" fill="url(#hero-gold)" stroke="#3d2d0c" stroke-width="2"/>
  <rect x="46" y="44" width="28" height="6" rx="2" fill="#14100c"/>
  <circle cx="53" cy="47" r="2" fill="#ffd770"/>
  <circle cx="67" cy="47" r="2" fill="#ffd770"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="url(#hero-gold)" stroke-width="2.5"/>
</svg>`;
}

export function getFallbackPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-fallback-sentinel" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#2d3748"/>
      <stop offset="60%" stop-color="#1a202c"/>
      <stop offset="100%" stop-color="#0a0d12"/>
    </radialGradient>
    <linearGradient id="fallback-iron" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a0aec0"/>
      <stop offset="45%" stop-color="#718096"/>
      <stop offset="70%" stop-color="#4a5568"/>
      <stop offset="100%" stop-color="#2d3748"/>
    </linearGradient>
    <linearGradient id="fallback-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ecc94b"/>
      <stop offset="100%" stop-color="#b7791f"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-fallback-sentinel)"/>
  <path d="M 12 120 C 25 88 42 82 60 82 C 78 82 95 88 108 120 Z" fill="url(#fallback-iron)" stroke="#1a202c" stroke-width="2.5"/>
  <path d="M 32 86 C 45 92 75 92 88 86 C 80 105 40 105 32 86 Z" fill="#2d3748" stroke="#1a202c" stroke-width="1.5"/>
  <path d="M 38 46 C 36 22 84 22 82 46 C 82 64 78 78 60 80 C 42 78 38 64 38 46 Z" fill="url(#fallback-iron)" stroke="#1a202c" stroke-width="2.5"/>
  <path d="M 57 24 L 63 24 L 63 78 L 57 78 Z" fill="url(#fallback-gold)"/>
  <line x1="42" y1="46" x2="78" y2="46" stroke="#1a202c" stroke-width="3"/>
  <line x1="44" y1="46" x2="55" y2="46" stroke="#1a202c" stroke-width="2.5"/>
  <line x1="65" y1="46" x2="76" y2="46" stroke="#1a202c" stroke-width="2.5"/>
  <circle cx="51" cy="58" r="1.5" fill="#1a202c"/>
  <circle cx="69" cy="58" r="1.5" fill="#1a202c"/>
  <circle cx="53" cy="66" r="1.5" fill="#1a202c"/>
  <circle cx="67" cy="66" r="1.5" fill="#1a202c"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="url(#fallback-gold)" stroke-width="2"/>
</svg>`;
}

export function getHighArcanistVaelenPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-vaelen" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#2d1c47"/>
      <stop offset="60%" stop-color="#140a24"/>
      <stop offset="100%" stop-color="#07030d"/>
    </radialGradient>
    <linearGradient id="astral-robes" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4a3075"/>
      <stop offset="50%" stop-color="#2b1747"/>
      <stop offset="100%" stop-color="#120821"/>
    </linearGradient>
    <linearGradient id="astral-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0e8ff"/>
      <stop offset="50%" stop-color="#8ba4d8"/>
      <stop offset="100%" stop-color="#3d4f7c"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-vaelen)"/>
  <circle cx="60" cy="42" r="32" fill="none" stroke="#5e3894" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
  <path d="M 12 120 Q 30 72 60 68 Q 90 72 108 120 Z" fill="url(#astral-robes)" stroke="#1a0c2e" stroke-width="2"/>
  <path d="M 38 72 L 60 90 L 82 72 L 78 120 L 42 120 Z" fill="#180c2b" stroke="url(#astral-silver)" stroke-width="1.5"/>
  <path d="M 32 46 C 30 18 90 18 88 46 C 88 64 80 72 60 74 C 40 72 32 64 32 46 Z" fill="#24133b" stroke="#0f071a" stroke-width="2"/>
  <path d="M 40 40 C 44 26 76 26 80 40 L 76 56 C 70 60 50 60 44 56 Z" fill="#4d3525"/>
  <ellipse cx="49" cy="48" rx="3.5" ry="2.5" fill="#a4e5ff"/>
  <circle cx="49" cy="48" r="1.2" fill="#ffffff"/>
  <ellipse cx="71" cy="48" rx="3.5" ry="2.5" fill="#a4e5ff"/>
  <circle cx="71" cy="48" r="1.2" fill="#ffffff"/>
  <path d="M 30 42 C 34 20 86 20 90 42 C 92 68 84 82 60 84 C 36 82 28 68 30 42 Z" fill="none" stroke="url(#astral-robes)" stroke-width="4"/>
  <polygon points="60,20 63,26 69,27 64,31 66,37 60,34 54,37 56,31 51,27 57,26" fill="url(#astral-silver)"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="url(#astral-silver)" stroke-width="2.5"/>
</svg>`;
}

export function getFordScoutBrenPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-bren" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#1e3324"/>
      <stop offset="60%" stop-color="#0f1f14"/>
      <stop offset="100%" stop-color="#050a06"/>
    </radialGradient>
    <linearGradient id="scout-leather" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4a3e2c"/>
      <stop offset="50%" stop-color="#2d251a"/>
      <stop offset="100%" stop-color="#14100b"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-bren)"/>
  <path d="M 15 120 Q 35 76 60 72 Q 85 76 105 120 Z" fill="url(#scout-leather)" stroke="#120e09" stroke-width="2"/>
  <path d="M 35 74 L 85 74 L 75 120 L 45 120 Z" fill="#243324" stroke="#101710" stroke-width="1.5"/>
  <path d="M 30 48 C 28 20 92 20 90 48 C 90 66 82 76 60 78 C 38 76 30 66 30 48 Z" fill="#2b3b2d" stroke="#121a13" stroke-width="2.5"/>
  <ellipse cx="48" cy="49" rx="3.5" ry="2.2" fill="#d9ad3d"/>
  <circle cx="48" cy="49" r="1.3" fill="#1f1400"/>
  <ellipse cx="72" cy="49" rx="3.5" ry="2.2" fill="#d9ad3d"/>
  <circle cx="72" cy="49" r="1.3" fill="#1f1400"/>
  <line x1="42" y1="44" x2="54" y2="47" stroke="#172218" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="78" y1="44" x2="66" y2="47" stroke="#172218" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 45 66 Q 60 62 75 66" stroke="#182218" stroke-width="2" fill="none"/>
  <path d="M 28 46 C 30 14 90 14 92 46 C 94 62 88 78 60 80 C 32 78 26 62 28 46 Z" fill="none" stroke="#223625" stroke-width="5"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#48694c" stroke-width="2.5"/>
</svg>`;
}

export function getCaptainMerrickPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-merrick" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#3d2b24"/>
      <stop offset="60%" stop-color="#1f1410"/>
      <stop offset="100%" stop-color="#0a0504"/>
    </radialGradient>
    <linearGradient id="merrick-iron" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a3b1c2"/>
      <stop offset="50%" stop-color="#55606e"/>
      <stop offset="100%" stop-color="#242b33"/>
    </linearGradient>
    <linearGradient id="bronze-trim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e09e53"/>
      <stop offset="50%" stop-color="#a86927"/>
      <stop offset="100%" stop-color="#5c350c"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-merrick)"/>
  <path d="M 12 120 Q 30 74 60 70 Q 90 74 108 120 Z" fill="#241a16" stroke="#120c09" stroke-width="2"/>
  <path d="M 30 84 L 60 96 L 90 84 L 84 120 L 36 120 Z" fill="url(#merrick-iron)" stroke="#1a2026" stroke-width="2"/>
  <path d="M 40 88 L 60 94 L 80 88" stroke="url(#bronze-trim)" stroke-width="2.5" fill="none"/>
  <path d="M 34 48 C 32 16 88 16 86 48 C 86 64 80 74 60 76 C 40 74 34 64 34 48 Z" fill="url(#merrick-iron)" stroke="#141a21" stroke-width="2.5"/>
  <path d="M 58 14 L 62 14 L 62 55 L 58 55 Z" fill="url(#bronze-trim)"/>
  <rect x="44" y="46" width="32" height="6" rx="2" fill="#0d1114"/>
  <circle cx="52" cy="49" r="1.5" fill="#f5d687"/>
  <circle cx="68" cy="49" r="1.5" fill="#f5d687"/>
  <path d="M 48 64 L 72 64 L 68 73 L 52 73 Z" fill="#1b2126" stroke="#0e1317" stroke-width="1.5"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="url(#bronze-trim)" stroke-width="2.5"/>
</svg>`;
}

export function getTavernPatronPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-patron" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#4a301d"/>
      <stop offset="60%" stop-color="#211309"/>
      <stop offset="100%" stop-color="#0a0502"/>
    </radialGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-patron)"/>
  <path d="M 18 120 Q 36 78 60 74 Q 84 78 102 120 Z" fill="#2d1f16" stroke="#140c07" stroke-width="2"/>
  <path d="M 32 50 C 30 22 90 22 88 50 C 88 66 78 76 60 78 C 42 76 32 66 32 50 Z" fill="#422e20" stroke="#1a110a" stroke-width="2"/>
  <circle cx="50" cy="48" r="2.5" fill="#f0c27b"/>
  <circle cx="70" cy="48" r="2.5" fill="#f0c27b"/>
  <path d="M 46 64 Q 60 70 74 64" stroke="#24140a" stroke-width="2.5" fill="none"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#875630" stroke-width="2.5"/>
</svg>`;
}

export function getBossOverlordPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-overlord" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#5a1808"/>
      <stop offset="60%" stop-color="#240702"/>
      <stop offset="100%" stop-color="#0a0201"/>
    </radialGradient>
    <linearGradient id="magma-core" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff9922"/>
      <stop offset="50%" stop-color="#ff3300"/>
      <stop offset="100%" stop-color="#880000"/>
    </linearGradient>
    <linearGradient id="basalt-armor" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4a423d"/>
      <stop offset="50%" stop-color="#26211e"/>
      <stop offset="100%" stop-color="#120e0c"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-overlord)"/>
  <path d="M 10 120 L 32 80 L 88 80 L 110 120 Z" fill="url(#basalt-armor)" stroke="#1a0a06" stroke-width="2.5"/>
  <path d="M 40 85 L 60 102 L 80 85 L 75 120 L 45 120 Z" fill="url(#magma-core)" opacity="0.85"/>
  <path d="M 32 50 C 26 15 94 15 88 50 C 88 72 78 85 60 88 C 42 85 32 72 32 50 Z" fill="url(#basalt-armor)" stroke="#0d0402" stroke-width="3"/>
  <path d="M 28 35 L 14 12 L 38 28 Z" fill="#291b14" stroke="#ff4400" stroke-width="1.5"/>
  <path d="M 92 35 L 106 12 L 82 28 Z" fill="#291b14" stroke="#ff4400" stroke-width="1.5"/>
  <line x1="60" y1="22" x2="60" y2="52" stroke="url(#magma-core)" stroke-width="2"/>
  <line x1="44" y1="36" x2="76" y2="36" stroke="url(#magma-core)" stroke-width="1.5"/>
  <line x1="48" y1="62" x2="72" y2="62" stroke="url(#magma-core)" stroke-width="2"/>
  <ellipse cx="48" cy="48" rx="5" ry="3" fill="#ffee66"/>
  <ellipse cx="72" cy="48" rx="5" ry="3" fill="#ffee66"/>
  <circle cx="48" cy="48" r="1.8" fill="#ff1100"/>
  <circle cx="72" cy="48" r="1.8" fill="#ff1100"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#e04010" stroke-width="2.5"/>
</svg>`;
}

export function getHighNecromancerPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-necro" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#142834"/>
      <stop offset="60%" stop-color="#08141d"/>
      <stop offset="100%" stop-color="#02060a"/>
    </radialGradient>
    <linearGradient id="bone-cowl" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b4d59"/>
      <stop offset="50%" stop-color="#1e2830"/>
      <stop offset="100%" stop-color="#0b1014"/>
    </linearGradient>
    <linearGradient id="cyan-soul" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0ffff"/>
      <stop offset="50%" stop-color="#33ddff"/>
      <stop offset="100%" stop-color="#006688"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-necro)"/>
  <path d="M 12 120 Q 30 74 60 70 Q 90 74 108 120 Z" fill="url(#bone-cowl)" stroke="#081016" stroke-width="2"/>
  <path d="M 30 52 C 26 16 94 16 90 52 C 90 72 80 82 60 84 C 40 82 30 72 30 52 Z" fill="#0f171d" stroke="#050a0e" stroke-width="2.5"/>
  <path d="M 38 42 C 40 28 80 28 82 42 L 78 72 C 70 78 50 78 42 72 Z" fill="#d4cfbe" stroke="#3d372e" stroke-width="1.5"/>
  <ellipse cx="48" cy="50" rx="4.5" ry="3.5" fill="#081014"/>
  <ellipse cx="72" cy="50" rx="4.5" ry="3.5" fill="#081014"/>
  <circle cx="48" cy="50" r="2" fill="url(#cyan-soul)"/>
  <circle cx="72" cy="50" r="2" fill="url(#cyan-soul)"/>
  <polygon points="56,60 64,60 60,66" fill="#0c1216"/>
  <line x1="48" y1="70" x2="72" y2="70" stroke="#0c1216" stroke-width="2"/>
  <line x1="52" y1="67" x2="52" y2="73" stroke="#0c1216" stroke-width="1.5"/>
  <line x1="57" y1="67" x2="57" y2="73" stroke="#0c1216" stroke-width="1.5"/>
  <line x1="63" y1="67" x2="63" y2="73" stroke="#0c1216" stroke-width="1.5"/>
  <line x1="68" y1="67" x2="68" y2="73" stroke="#0c1216" stroke-width="1.5"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#33ddff" stroke-width="2.5"/>
</svg>`;
}

export function getGoldWaxSealSvg(): string {
  return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="wax-seal-svg">
  <defs>
    <radialGradient id="gold-seal-grad" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffea9f"/>
      <stop offset="45%" stop-color="#d49b28"/>
      <stop offset="85%" stop-color="#8a5e12"/>
      <stop offset="100%" stop-color="#4e3306"/>
    </radialGradient>
  </defs>
  <path d="M 30 4 C 42 3 54 12 56 24 C 58 36 52 48 42 54 C 30 58 14 56 7 45 C 0 34 6 18 16 9 C 22 5 25 5 30 4 Z" fill="url(#gold-seal-grad)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"/>
  <circle cx="30" cy="30" r="19" fill="#aa791c" stroke="#ffe082" stroke-width="1.5"/>
  <path d="M 20 20 L 40 40 M 20 40 L 40 20" stroke="#ffecb3" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="30" cy="30" r="4" fill="#ffe082"/>
</svg>`;
}

export function getSilverWaxSealSvg(): string {
  return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="wax-seal-svg">
  <defs>
    <radialGradient id="silver-seal-grad" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#e0e6ed"/>
      <stop offset="45%" stop-color="#909aa4"/>
      <stop offset="85%" stop-color="#55606c"/>
      <stop offset="100%" stop-color="#2a333d"/>
    </radialGradient>
  </defs>
  <path d="M 30 4 C 42 3 54 12 56 24 C 58 36 52 48 42 54 C 30 58 14 56 7 45 C 0 34 6 18 16 9 C 22 5 25 5 30 4 Z" fill="url(#silver-seal-grad)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"/>
  <circle cx="30" cy="30" r="19" fill="#697684" stroke="#c0cdd8" stroke-width="1.5"/>
  <rect x="22" y="22" width="16" height="16" rx="2" fill="none" stroke="#e0e8f0" stroke-width="2"/>
</svg>`;
}

export function getCompletedWaxSealSvg(): string {
  return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="wax-seal-svg">
  <defs>
    <radialGradient id="ruby-seal-grad" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ff7b7b"/>
      <stop offset="45%" stop-color="#b71c1c"/>
      <stop offset="85%" stop-color="#6a0c0c"/>
      <stop offset="100%" stop-color="#350404"/>
    </radialGradient>
  </defs>
  <path d="M 30 4 C 44 2 55 14 57 26 C 58 38 50 50 39 55 C 28 59 13 54 6 43 C -1 32 4 16 15 8 C 21 4 25 5 30 4 Z" fill="url(#ruby-seal-grad)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"/>
  <circle cx="30" cy="30" r="19" fill="#8b1111" stroke="#ff8a80" stroke-width="1.5"/>
  <path d="M 21 30 L 27 36 L 40 22" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * AAA Gothic Quest Journal, character portrait dialogue frames, and objective tracking.
 */
export class MissionUi {
  private readonly goals = document.createElement('div');
  private readonly dialogueModal = document.createElement('div');
  private readonly questJournalModal = document.createElement('div');

  private queue: { who: string; text: string; msgId?: number }[] = [];
  private cursor = 0;
  private dialogueActive = false;
  private journalOpen = false;
  private activeQuestId = 'main-scourge';
  private lastSim: Sim | null = null;
  private currentMsgId: number | undefined = undefined;
  private typingTimer: number | null = null;
  private fullTypingText = '';
  private typingCallback: (() => void) | null = null;
  private finishCurrentTyping: (() => void) | null = null;
  private lastSpeaker: string | null = null;
  private plaques: LocationPlaqueEntry[] = [];

  constructor(
    private readonly doc: MapDoc,
    private readonly host: MissionHost,
    private readonly content: MissionContent | null = null,
  ) {
    // HUD Objectives Tracker
    this.goals.id = 'objectives';
    this.goals.className = 'gothic-hud-tracker collapsed';
    this.goals.hidden = true;
    this.goals.onclick = () => this.toggleObjectives();
    this.goals.ondblclick = (e) => {
      e.stopPropagation();
      this.toggleJournal(this.lastSim ?? undefined);
    };

    // Gothic Character Dialogue Frame
    this.dialogueModal.id = 'gothic-dialogue';
    this.dialogueModal.className = 'gothic-dialogue-overlay';
    this.dialogueModal.hidden = true;

    // Interactive Quest Journal Tome
    this.questJournalModal.id = 'quest-journal';
    this.questJournalModal.className = 'gothic-journal-overlay';
    this.questJournalModal.hidden = true;

    document.body.append(this.goals, this.dialogueModal, this.questJournalModal);

    // Bind [Q Quests] button in HUD if present
    this.bindHudButtons();
  }

  private bindHudButtons(): void {
    const btn = document.getElementById('btn-quests');
    if (btn) {
      btn.onclick = () => this.toggleJournal(this.lastSim ?? undefined);
    }
  }

  /** True while a briefing or dialogue line is on screen or queued. */
  get busy(): boolean {
    return this.dialogueActive || this.queue.length > 0;
  }

  isDialogueOpen(): boolean {
    return this.dialogueActive;
  }

  isJournalOpen(): boolean {
    return this.journalOpen;
  }

  private t(key: string, fallback = ''): string {
    return this.doc.text[key] ?? fallback;
  }

  /** Speaker metadata: title, rank, and portrait SVG */
  private getSpeakerInfo(who: string): { name: string; rank: string; portraitSvg: string } {
    const lower = who.toLowerCase();
    const pid = /^(field|merc|npc)-([a-z-]+)$/.exec(lower);
    if (pid && pid[2] !== 'warden-hale') {
      const artKey = `${pid[1] === 'merc' ? 'merc' : 'npc'}-${pid[2]}`;
      if (PAINTED_SPEAKERS.has(artKey)) {
        const title = pid[2].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
        return {
          name: title,
          rank: pid[1] === 'merc' ? 'Hired Sellsword' : 'Border Folk',
          portraitSvg: paintedPortrait(`portraits/${artKey}`, getFallbackPortraitSvg()),
        };
      }
    }
    if (lower.includes('garrick')) {
      return {
        name: 'Captain Garrick',
        rank: 'Highland Border Sentinel & Commander of the Sunken Ford Picket',
        portraitSvg: paintedPortrait('portraits/npc-ashbrook-watchman', getCaptainMerrickPortraitSvg()),
      };
    }
    if (lower.includes('hale') || lower.includes('warden')) {
      return {
        name: 'Warden Hale',
        rank: 'High Captain of the Thornwick Border Guard & Knight-Commander',
        portraitSvg: paintedPortrait('portraits/npc-warden-hale', getWardenHalePortraitSvg()),
      };
    }
    if (lower.includes('vaelen') || lower.includes('arcanist')) {
      return {
        name: 'High Arcanist Vaelen',
        rank: 'Grand Scholar of the Astral Veil & Keeper of the Primeval Runes',
        portraitSvg: paintedPortrait('npc-aldren', getHighArcanistVaelenPortraitSvg()),
      };
    }
    if (lower.includes('bren') || lower.includes('ford-scout') || lower.includes('river scout')) {
      return {
        name: 'Ford-Scout Bren',
        rank: 'Chief Frontier Pathfinder & Master of the River Marches',
        portraitSvg: paintedPortrait('npc-scout', getFordScoutBrenPortraitSvg()),
      };
    }
    if (lower.includes('merrick') || lower.includes('commander merrick')) {
      return {
        name: 'Captain Merrick',
        rank: 'Garrison Commander of the High Keep & Master of Ordnance',
        portraitSvg: paintedPortrait('npc-aldren', getCaptainMerrickPortraitSvg()),
      };
    }
    if (lower.includes('patron') || lower.includes('barkeep') || lower.includes('corin') || lower.includes('rumor')) {
      return {
        name: 'Master Corin',
        rank: 'Tavern Chronicler & Informant of the Frontier Underworld',
        portraitSvg: paintedPortrait('npc-quillon', getTavernPatronPortraitSvg()),
      };
    }
    if (lower.includes('grok') || lower.includes('chief') || lower.includes('gnoll')) {
      return {
        name: "Chieftain Grok'tar",
        rank: 'Blood-Warlord of the Riverfang Gnoll Horde',
        portraitSvg: paintedPortrait('npc-groktar', getChieftainGroktarPortraitSvg()),
      };
    }
    if (lower.includes('vorak') || lower.includes('ashkarath') || lower.includes('cinder') || lower.includes('ember')) {
      return {
        name: who.includes('Ashkarath') ? 'Ashkarath the Cinder King' : 'Ember Overlord Vorak',
        rank: 'Primordial Sovereign of the Obsidian Caldera & Cleansing Flame',
        portraitSvg: paintedPortrait('frame-ashkarath', getBossOverlordPortraitSvg()),
      };
    }
    if (lower.includes('malgath') || lower.includes('necro') || lower.includes('mordred') || lower.includes('vesperion')) {
      return {
        name: who.includes('Mordred') ? 'Mordred the Ashen' : who.includes('Vesperion') ? 'Vesperion the Hollow Choir' : 'High Necromancer Malgath',
        rank: 'Arch-Prelate of Immutable Silence & the Bone Choir',
        portraitSvg: paintedPortrait('frame-vesperion', getHighNecromancerPortraitSvg()),
      };
    }
    if (lower.includes('korrath') || lower.includes('arch-warden')) {
      return {
        name: 'Arch-Warden Korrath',
        rank: 'Eternal Sentinel of Imperial Law & Granite Petrifaction',
        portraitSvg: paintedPortrait('frame-gorrathul', getBossOverlordPortraitSvg()),
      };
    }
    if (lower.includes('gorrathul')) {
      return {
        name: 'Gorrathul the Sand Glutton',
        rank: 'Subterranean Frost-Gorged Colossus of the Dunes',
        portraitSvg: paintedPortrait('frame-gorrathul', getBossOverlordPortraitSvg()),
      };
    }
    if (lower.includes('morvessa')) {
      return {
        name: 'Morvessa the Silk Matron',
        rank: 'Brood Queen of the Sunless Bone Catacombs',
        portraitSvg: paintedPortrait('frame-morvessa', getHighNecromancerPortraitSvg()),
      };
    }
    if (lower.includes('narrator') || lower === 'chronicle') {
      return {
        name: 'Chronicle of Thornvael',
        rank: 'Campaign Record',
        portraitSvg: paintedPortrait('portraits/npc-disgraced-scribe', getCaptainMerrickPortraitSvg()),
      };
    }
    if (lower.includes('hero') || lower.includes('you')) {
      return {
        name: 'Expeditionary Commander',
        rank: 'Leader of the Twelve & Chosen Champion of Thornvael',
        portraitSvg: paintedPortrait('npc-commander', getHeroPortraitSvg()),
      };
    }
    const named: Array<[string, string, string, string]> = [
      ['garrick', 'Captain Garrick', 'Highland Border Sentinel & Commander of the Sunken Ford Picket', 'portraits/npc-ashbrook-watchman'],
      ['fenwick', 'Ferryman Fenwick', 'Master of the Border Shallows & River Ferry', 'portraits/npc-alder-ferryman'],
      ['bram', 'Quartermaster Bram', 'Provincial Requisition Officer & Camp Purveyor', 'portraits/npc-border-peddler'],
      ['elias', 'Brother Elias the Scorched', 'Penitent Cleric of the Ashen Way', 'portraits/npc-threshold-penitent'],
      ['hobb', 'Hobb the Smith', 'Frontier Armorer & Anvil Master', 'portraits/npc-foundry-stoker'],
      ['kors', 'Shipwright Kors', 'Master Carpenter of the Drowned Coast', 'portraits/npc-harbor-pilot'],
      ['lyra', 'Warden Lyra', 'Shield-Captain of the Highland Patrols', 'portraits/npc-warden-hale'],
      ['marta', 'Alchemist Marta', 'Keeper of Vials & Peat Distillates', 'portraits/npc-leech-apothecary'],
      ['pip', 'Pip the Mudlark', 'Canal Scavenger & Fen Runner', 'portraits/npc-fen-peatcutter'],
      ['rowan', 'Commander Rowan', 'Garrison Commander of the Caldera Redoubts', 'portraits/npc-greystone-sentry'],
      ['sera', 'Healer Sera', 'Field Chirurgeon of the Border Levies', 'portraits/npc-ford-herbalist'],
      ['tull', 'Tull the Water-Seller', 'Alkali Basin Carver & Sump Trader', 'portraits/npc-alkali-drover'],
      ['vok', 'Forgemaster Vok', 'Imperial Smith & Blade Hardener', 'portraits/npc-foundry-stoker'],
      ['zahra', 'Scholar Zahra', 'Antiquarian & Chronicle Notary', 'portraits/npc-disgraced-scribe'],
      ['orlen', 'Orlen the Grave-Tender', 'Marsh Herbalist & Master of Rot-Wards', 'npc-orlen'],
      ['sabik', 'Sabik the Sand-Walker', 'Chief Dune Scout of the Glass Wastes', 'npc-sabik'],
      ['quillon', 'Sage Quillon', 'High Sage of the Drowned Coast & Tide-Caller', 'npc-quillon'],
      ['aldren', 'Sir Aldren the Iron-Willed', 'Veteran Knight-Commander of the Burnt Keep', 'npc-aldren'],
      ['isolde', 'Captain Isolde', 'Vanguard Commander of the Ashbrook Relief Cohort', 'npc-commander'],
      ['vance', 'Marshal Vance', 'Supreme Commander of the Highcrest Vanguard', 'npc-commander'],
      ['veyra', 'Harbor Marshal Veyra', 'Defender of the Drowned Bastions & Sea Lanes', 'npc-quillon'],
      ['marlow', 'Reeve Marlow', 'Frontier Bailiff of Thornwick Market', 'npc-hale'],
      ['outpost scout', 'Frontier Ranger', 'Highland Reconnaissance Scout', 'npc-scout'],
    ];
    for (const [key, name, rank, imgKey] of named) {
      if (lower.includes(key)) {
        return { name, rank, portraitSvg: paintedPortrait(imgKey, getCaptainMerrickPortraitSvg()) };
      }
    }
    if (lower.includes('cache') || lower.includes('coffer') || lower.includes('granary') || lower.includes('lockbox')) {
      return {
        name: who || 'Garrison Requisition Coffer',
        rank: 'Recovered Military Baggage & Ledgers',
        portraitSvg: getFallbackPortraitSvg(),
      };
    }
    if (lower.includes('shrine')) {
      return {
        name: 'Purified Shrine',
        rank: 'Ancient Elemental Wardstone',
        portraitSvg: getFallbackPortraitSvg(),
      };
    }
    return {
      name: who || 'Garrison Scout',
      rank: 'Highland Border Sentinel',
      portraitSvg: paintedPortrait('portraits/npc-ashbrook-watchman', getCaptainMerrickPortraitSvg()),
    };
  }

  /** Formats dialogues into rich literary prose with internal voices, sensory action beats, and player stances */
  private formatDiscoDialogue(who: string, text: string, allowChoices = false): {
    badgeTag: string;
    badgeClass: string;
    sensoryBeat: string;
    speech: string;
    choices: Array<{ num: number; tag: string; text: string }>;
  } {
    const lower = who.toLowerCase();

    let badgeTag = '';
    let badgeClass = 'de-war-logic';
    let sensoryBeat = '';
    let speech = text;

    const tagMatch = speech.match(/^\[([A-Z\s/-]+(?::\s*[A-Za-z]+)?)\]\s*/);
    if (tagMatch) {
      badgeTag = tagMatch[1];
      speech = speech.slice(tagMatch[0].length);
      const tagLower = badgeTag.toLowerCase();
      if (tagLower.includes('astral') || tagLower.includes('veil')) badgeClass = 'de-astral';
      else if (tagLower.includes('tactical') || tagLower.includes('perception')) badgeClass = 'de-tactical';
      else if (tagLower.includes('quartermaster') || tagLower.includes('logistics')) badgeClass = 'de-quartermaster';
      else if (tagLower.includes('skepticism') || tagLower.includes('humor')) badgeClass = 'de-skepticism';
      else if (tagLower.includes('dread')) badgeClass = 'de-dread';
      else if (tagLower.includes('primordial')) badgeClass = 'de-primordial';
      else if (tagLower.includes('cohort')) badgeClass = 'de-cohort';
    }

    const sensoryMatch = speech.match(/^\*\((.*?)\)\*\s*/s);
    if (sensoryMatch) {
      sensoryBeat = sensoryMatch[1].trim();
      speech = speech.slice(sensoryMatch[0].length);
    }

    // Default cognitive framing if not explicitly present in raw text
    if (!badgeTag) {
      if (lower.includes('narrator') || lower === 'chronicle') {
        badgeTag = 'CHRONICLE OF THE MARCH';
        badgeClass = 'de-cohort';
      } else if (lower.includes('garrick')) {
        badgeTag = "WATCH CAPTAIN'S REPORT - Medium: Success";
        badgeClass = 'de-war-logic';
        if (!sensoryBeat) sensoryBeat = 'Rain streaks the blackened rivets of his brigandine as he gestures toward the mist-choked shallows.';
      } else if (lower.includes('hobb')) {
        badgeTag = 'ANVIL & REQUISITIONS - Easy: Success';
        badgeClass = 'de-quartermaster';
        if (!sensoryBeat) sensoryBeat = 'Charcoal grit and forge-scale cling to his leather apron while he tests the balance of a spare spearhead.';
      } else if (lower.includes('marta')) {
        badgeTag = 'HEARTH & VIGIL - Medium: Success';
        badgeClass = 'de-skepticism';
        if (!sensoryBeat) sensoryBeat = 'Her eyes measure the cohort over glass phials of peat distillate, sharp as cold iron.';
      } else if (lower.includes('fenwick')) {
        badgeTag = 'RIVERMAN LORE - Easy: Success';
        badgeClass = 'de-tactical';
        if (!sensoryBeat) sensoryBeat = 'River silt stains his oilskin cloak; his gaze tracks every swirl of current along the piling stones.';
      } else if (lower.includes('hero') || lower.includes('commander') || lower === 'you') {
        badgeTag = "COMMANDER'S RESOLVE - Easy: Success";
        badgeClass = 'de-war-logic';
        if (!sensoryBeat) sensoryBeat = 'Your gauntlet settles onto the hilt as the company waits in silence for the order to advance.';
      } else if (lower.includes('hale') || lower.includes('warden')) {
        badgeTag = 'WAR LOGIC - Medium: Success';
        badgeClass = 'de-war-logic';
        if (!sensoryBeat) sensoryBeat = 'A damp mountain gale rattles the tarnished plates of his gorget. He exhales a gray plume smelling of bitter chicory and cold tallow.';
      } else if (lower.includes('bren') || lower.includes('scout')) {
        badgeTag = 'TACTICAL CALCULUS - Easy: Success';
        badgeClass = 'de-tactical';
        if (!sensoryBeat) sensoryBeat = 'His breath comes in ragged, shallow gasps. Mud is caked to his brow and his fingers nervously trace the fletching of an arrow.';
      } else if (lower.includes('vaelen') || lower.includes('arcanist')) {
        badgeTag = 'ASTRAL SHIVER - Challenging: Success';
        badgeClass = 'de-astral';
        if (!sensoryBeat) sensoryBeat = 'The air around his sleeves vibrates with the faint metallic taste of ozone. His pale eyes reflect runic calculations invisible to mortal sight.';
      } else if (lower.includes('merrick')) {
        badgeTag = "QUARTERMASTER'S EYE - Easy: Success";
        badgeClass = 'de-quartermaster';
        if (!sensoryBeat) sensoryBeat = 'He taps the pommel of his broadsword against iron greaves, calculating tensile strength and the physics of blunt impact.';
      } else if (lower.includes('corin') || lower.includes('patron') || lower.includes('barkeep')) {
        badgeTag = 'FRONTIER SKEPTICISM - Formidable: Success';
        badgeClass = 'de-skepticism';
        if (!sensoryBeat) sensoryBeat = 'He wrings a grease-blackened rag over the timber counter, his eyes darting to the locked coffer beneath the shelf.';
      } else if (lower.includes('grok') || lower.includes('boss') || lower.includes('chief')) {
        badgeTag = 'VISCERAL DREAD - Extreme: Success';
        badgeClass = 'de-dread';
        if (!sensoryBeat) sensoryBeat = 'Yellowed fangs glisten with spit and bile. A scarred chest heaves like a dying furnace beneath soot-blackened leather straps.';
      } else if (lower.includes('vorak') || lower.includes('ashkarath') || lower.includes('cinder') || lower.includes('ember')) {
        badgeTag = 'PRIMORDIAL RECKONING - Heroic: Success';
        badgeClass = 'de-primordial';
        if (!sensoryBeat) sensoryBeat = 'The air before him shimmers with white heat, scorching the eyes. The bedrock groans under magma veins answering his heartbeat.';
      } else if (lower.includes('malgath') || lower.includes('necro') || lower.includes('mordred') || lower.includes('vesperion')) {
        badgeTag = 'CHILL OF THE VEIL - Challenging: Success';
        badgeClass = 'de-astral';
        if (!sensoryBeat) sensoryBeat = 'A profound, unnatural stillness falls over the hall. The air drops below freezing, drawing frost across the edges of your mail.';
      } else if (lower.includes('cache') || lower.includes('coffer') || lower.includes('granary') || lower.includes('lockbox')) {
        badgeTag = 'LOGISTICS - Trivial: Success';
        badgeClass = 'de-quartermaster';
        if (!sensoryBeat) sensoryBeat = 'Prying back the iron-reinforced lid reveals the tangible spoils of frontier warfare.';
      } else {
        badgeTag = 'FIELD REPORT - Easy: Success';
        badgeClass = 'de-cohort';
        if (!sensoryBeat) sensoryBeat = 'The company watches the skyline through drifting mist as steel and leather settle into battle trim.';
      }
    }

    // Commander stance responses appear only when choices are explicitly appropriate
    let choices: Array<{ num: number; tag: string; text: string }> = [];
    if (allowChoices) {
      if (lower.includes('hale') || lower.includes('warden') || lower.includes('garrick')) {
        choices = [
          { num: 1, tag: '[War Logic]', text: 'Understood, Captain. Vanguard maintains wedge formation and secures the choke points.' },
          { num: 2, tag: '[Frontier Skepticism]', text: 'Another ditch to drown in for a High Council that wouldn\'t know our graves.' },
          { num: 3, tag: '[Iron Will]', text: 'Sound the advance. We do not yield an inch of this ground.' },
        ];
      } else if (lower.includes('bren') || lower.includes('scout') || lower.includes('fenwick')) {
        choices = [
          { num: 1, tag: '[Tactical Calculus]', text: 'Report enemy dispositions. Where is their flanking reserve?' },
          { num: 2, tag: '[Frontier Skepticism]', text: 'If their bowmen hold the high bluff, we are marching into a slaughterhouse.' },
          { num: 3, tag: '[Iron Will]', text: 'Keep your nerve. Lead the vanguard through the reeds.' },
        ];
      } else if (lower.includes('vaelen') || lower.includes('arcanist')) {
        choices = [
          { num: 1, tag: '[Astral Shiver]', text: 'I can feel the cold vibration in my teeth. The Veil is tearing.' },
          { num: 2, tag: '[War Logic]', text: 'Channel the ley-energy into protective wards. We need defense, not theories.' },
          { num: 3, tag: '[Veteran Flesh]', text: 'Sorcery or cold iron, blood spilled on stones dries the same.' },
        ];
      } else if (lower.includes('merrick') || lower.includes('hobb')) {
        choices = [
          { num: 1, tag: '[Quartermaster\'s Eye]', text: 'Are the shields braced for heavy blunt trauma?' },
          { num: 2, tag: '[War Logic]', text: 'Tighten the vanguard harness. We push step by step.' },
          { num: 3, tag: '[Iron Will]', text: 'Frontier steel will hold. To the line!' },
        ];
      } else if (lower.includes('corin') || lower.includes('patron') || lower.includes('barkeep') || lower.includes('marta')) {
        choices = [
          { num: 1, tag: '[Frontier Skepticism]', text: 'Watered ale and exaggerated terror—the frontier never changes.' },
          { num: 2, tag: '[Quartermaster\'s Eye]', text: 'What is the true price of these rumors?' },
          { num: 3, tag: '[Iron Will]', text: 'Give me the truth. My cohort moves at first light.' },
        ];
      } else if (lower.includes('grok') || lower.includes('vorak') || lower.includes('malgath') || lower.includes('boss') || lower.includes('chief') || lower.includes('mordred')) {
        choices = [
          { num: 1, tag: '[War Logic]', text: 'Your flanks are overextended. Your reign ends in this dirt.' },
          { num: 2, tag: '[Visceral Dread]', text: 'Steel against fang. Let\'s see whose marrow splinters first.' },
          { num: 3, tag: '[Iron Will]', text: 'For Thornwick and the fallen. To the death.' },
        ];
      } else if (lower.includes('cache') || lower.includes('coffer') || lower.includes('granary') || lower.includes('lockbox')) {
        choices = [
          { num: 1, tag: '[Quartermaster\'s Eye]', text: 'Secure the coinage and inspect the requisition scrolls.' },
          { num: 2, tag: '[War Logic]', text: 'Distribute the silver among the mercenary cohort.' },
          { num: 3, tag: '[Iron Will]', text: 'Lock the coffer in the baggage train. We press on.' },
        ];
      } else {
        choices = [
          { num: 1, tag: '[War Logic]', text: 'Understood. Deploy the archers and hold the line.' },
          { num: 2, tag: '[Frontier Skepticism]', text: 'They promise glory, but deliver only mud and grave-markers.' },
          { num: 3, tag: '[Iron Will]', text: 'Forward. Not one step back.' },
        ];
      }
    }

    return { badgeTag, badgeClass, sensoryBeat, speech, choices };
  }

  /**
   * Character Portrait Dialogue Box (#gothic-dialogue):
   * Speaker portrait on left, gold filigree nameplate, typewriter typography with typing sound cue.
   */
  private showDialogue(who: string, text: string, buttonText: string, done: () => void): void {
    const loadingEl = typeof document !== 'undefined' ? document.getElementById('tv-loading-screen') : null;
    if (loadingEl) {
      loadingEl.classList?.remove('is-hiding');
      loadingEl.hidden = true;
      loadingEl.style.display = 'none';
    }
    this.dialogueActive = true;
    this.host.pause(true);
    this.dialogueModal.hidden = false;
    this.dialogueModal.replaceChildren();

    const lowerWho = who.toLowerCase();
    const isNarrator = lowerWho.includes('narrator') || lowerWho === 'chronicle';
    const hasRealChoiceVar =
      this.currentMsgId !== undefined && this.doc.text[`msg.${this.currentMsgId}.var`] !== undefined;
    const isFinalBriefingLine = buttonText === S.mission.begin;
    const allowChoices = !isNarrator && (hasRealChoiceVar || isFinalBriefingLine);

    const info = this.getSpeakerInfo(who);
    const formatted = this.formatDiscoDialogue(who, text, allowChoices);
    const voiceClip = resolveDialogueVoiceClip(who, text, this.doc.name);

    const isSpeakerSwitch = this.lastSpeaker === null || this.lastSpeaker.toLowerCase() !== who.toLowerCase();
    this.lastSpeaker = who;

    try {
      stopDialogueVoice();
    } catch {
      // Safe in headless or audio-disabled test runs
    }
    if (isSpeakerSwitch) {
      try {
        playSpeakerSwitchThrill();
        if (!voiceClip) playNpcBark(who, 0);
      } catch {
        // Safe in headless or audio-disabled test runs
      }
    }
    if (voiceClip) {
      try {
        playDialogueVoice(voiceClip);
      } catch {
        // Safe in headless or audio-disabled test runs
      }
    }
    try {
      setDialogueDucking(true);
    } catch {
      // Safe in headless or audio-disabled test runs
    }

    const frame = document.createElement('div');
    frame.className = `gothic-dialogue-frame${isSpeakerSwitch ? ' speaker-switch-thrill' : ''}`;

    // Left Column: Speaker Portrait (Disco Elysium Grand Side Canvas)
    const portraitCol = document.createElement('div');
    portraitCol.className = `gothic-portrait-wrapper${isSpeakerSwitch ? ' portrait-shiver-thrill' : ''}`;
    portraitCol.innerHTML = info.portraitSvg;

    // Right Column: Dialogue Nameplate & Body
    const contentCol = document.createElement('div');
    contentCol.className = 'gothic-dialogue-content';

    const nameplate = document.createElement('div');
    nameplate.className = 'gothic-nameplate';
    nameplate.innerHTML = `<span class="filigree-flourish">✦</span> <span class="speaker-name">${info.name}</span> <span class="filigree-flourish">✦</span>
      <div class="speaker-rank">${info.rank}</div>`;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'gothic-dialogue-body';

    const badgeEl = document.createElement('div');
    badgeEl.className = `de-skill-badge ${formatted.badgeClass}`;
    badgeEl.textContent = formatted.badgeTag;

    const sensoryEl = document.createElement('div');
    sensoryEl.className = 'de-sensory-beat';
    sensoryEl.textContent = formatted.sensoryBeat;
    sensoryEl.hidden = !formatted.sensoryBeat;

    const speechEl = document.createElement('div');
    speechEl.className = 'de-speech-text';
    speechEl.textContent = '';

    const choicesEl = document.createElement('div');
    choicesEl.className = 'commander-responses-container';
    choicesEl.hidden = formatted.choices.length === 0;
    choicesEl.style.display = 'none';

    const footer = document.createElement('div');
    footer.className = 'gothic-dialogue-footer';

    const queueCounter = document.createElement('span');
    queueCounter.className = 'dialogue-queue-count';
    queueCounter.textContent = this.queue.length ? `Next in Queue: +${this.queue.length}` : 'Directive Final';

    const contBtn = document.createElement('button');
    contBtn.className = 'gothic-continue-btn';
    contBtn.innerHTML = `${buttonText} <span class="btn-hotkey">[Space / Click]</span>`;

    footer.append(queueCounter, contBtn);
    bodyEl.append(badgeEl, sensoryEl, speechEl, choicesEl);
    contentCol.append(nameplate, bodyEl, footer);
    frame.append(portraitCol, contentCol);
    this.dialogueModal.append(frame);

    // Typewriter effect state
    if (this.typingTimer !== null) clearInterval(this.typingTimer);
    this.fullTypingText = formatted.speech;
    let charIdx = 0;
    let isTyping = true;

    const finishTyping = () => {
      if (this.typingTimer !== null) {
        clearInterval(this.typingTimer);
        this.typingTimer = null;
      }
      speechEl.textContent = this.fullTypingText;
      isTyping = false;
      if (formatted.choices.length > 0) {
        choicesEl.hidden = false;
        choicesEl.style.display = 'flex';
      } else {
        choicesEl.hidden = true;
        choicesEl.style.display = 'none';
      }
      const firstChoice = choicesEl.querySelector<HTMLButtonElement>('.commander-choice-btn');
      if (firstChoice) firstChoice.focus();
      else contBtn.focus();
    };

    this.finishCurrentTyping = finishTyping;

    const advance = () => {
      if (isTyping) {
        finishTyping();
      } else {
        try {
          stopDialogueVoice();
        } catch {
          // Safe in headless tests
        }
        this.dialogueModal.hidden = true;
        this.dialogueActive = false;
        if (this.queue.length === 0) {
          this.lastSpeaker = null;
          try {
            setDialogueDucking(false);
          } catch {
            // Safe in headless tests
          }
        }
        done();
      }
    };

    formatted.choices.forEach((c) => {
      const choiceBtn = document.createElement('button');
      choiceBtn.type = 'button';
      choiceBtn.className = 'commander-choice-btn';
      choiceBtn.innerHTML = `<span class="choice-num">${c.num}.</span> <span class="choice-tag">${c.tag}</span> <span class="choice-text">"${c.text}"</span>`;
      choiceBtn.onclick = (e) => {
        e.stopPropagation();
        const st = this.lastSim?.script?.st;
        if (st) {
          st.vars[31] = c.num;
          const varSpec = this.currentMsgId !== undefined ? this.doc.text[`msg.${this.currentMsgId}.var`] : undefined;
          if (varSpec !== undefined) {
            const varIdx = Number.parseInt(varSpec, 10);
            if (Number.isInteger(varIdx) && varIdx >= 0 && varIdx < st.vars.length) {
              st.vars[varIdx] = c.num;
            }
          }
        }
        try { blip(); } catch {}
        advance();
      };
      choicesEl.append(choiceBtn);
    });

    this.typingCallback = advance;
    contBtn.onclick = (e) => {
      e.stopPropagation();
      advance();
    };
    frame.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (isTyping) {
        finishTyping();
      }
    };

    // Typewriter interval with audio cue
    this.typingTimer = window.setInterval(() => {
      if (charIdx < formatted.speech.length) {
        speechEl.textContent += formatted.speech[charIdx];
        if (charIdx % 3 === 0 && formatted.speech[charIdx] !== ' ') {
          try {
            blip();
          } catch {
            // Audio context safely ignored in test/headless
          }
        }
        charIdx++;
      } else {
        finishTyping();
      }
    }, 18);
  }

  /** Selects a commander response stance (1, 2, 3) or advances dialogue. */
  selectStance(choiceIdx: number): void {
    if (!this.dialogueActive) return;
    if (this.typingTimer !== null) {
      this.finishCurrentTyping?.();
    } else {
      const choiceBtns = this.dialogueModal.querySelectorAll<HTMLButtonElement>('.commander-choice-btn');
      if (choiceBtns && choiceBtns[choiceIdx - 1]) {
        choiceBtns[choiceIdx - 1].click();
      } else {
        try { blip(); } catch {}
        this.advanceDialogue();
      }
    }
  }

  /** Advances dialogue on keyboard Space or Enter. */
  advanceDialogue(): void {
    if (this.dialogueActive && this.typingCallback) {
      this.typingCallback();
    }
  }

  /**
   * Mission briefing: Warden Hale's opening gothic dialogue leading into active deployment.
   */
  briefing(begin: () => void): void {
    const title = this.t('title', this.doc.name);
    const body = this.t('body', 'Hostile warbands have breached the frontier riverbanks and fired the watch outposts. Rally your vanguard, advance across the shallows under covering fire, and strike down their warlord before our lines are encircled.');
    const go = () => {
      this.host.pause(false);
      begin();
      // Render initial objectives
      if (this.lastSim) this.update(this.lastSim);
    };
    const scene = this.content?.intro_scene ?? [];
    const play = (i: number): void => {
      if (i >= scene.length) return go();
      this.showDialogue(speakerName(scene[i].speaker), scene[i].line, i + 1 < scene.length ? S.mission.next : S.mission.begin, () => play(i + 1));
    };
    this.showDialogue('Warden Hale', `${title}: ${body}`, scene.length ? S.mission.next : S.mission.begin, () => play(0));
  }

  /** Called a few times a second: handles dialogue queue and live HUD objectives */
  update(sim: Sim): void {
    this.lastSim = sim;
    const st = sim.script?.st;
    if (!st) return;

    // Ingest new messages from script state
    for (; this.cursor < st.msgs.length; this.cursor += 2) {
      const n = st.msgs[this.cursor + 1];
      this.queue.push({
        who: this.t(`msg.${n}.who`, 'Warden Hale'),
        text: this.t(`msg.${n}`, `(${S.mission.noText} ${n})`),
        msgId: n,
      });
    }

    // Display next dialogue in queue
    if (!this.dialogueActive && this.queue.length) {
      const m = this.queue.shift()!;
      this.currentMsgId = m.msgId;
      this.showDialogue(m.who, m.text, this.queue.length ? S.mission.next : S.mission.go, () => {
        this.currentMsgId = undefined;
        if (!this.queue.length) {
          this.host.pause(false);
        } else {
          this.update(sim);
        }
      });
    }

    // Update HUD Quest Tracker
    this.renderObjectivesHud(sim);
  }

  public isObjectivesCollapsed = true;

  /** Toggle on-demand quest objectives banner */
  public toggleObjectives(): void {
    this.isObjectivesCollapsed = !this.isObjectivesCollapsed;
    if (this.lastSim) this.renderObjectivesHud(this.lastSim);
  }

  /** Render the parchment HUD tracker in top-left */
  private renderObjectivesHud(sim: Sim): void {
    const st = sim.script?.st;
    if (!st) return;

    const quest = this.evaluateQuestDossier(sim);
    if (!quest.objectives.length) {
      this.goals.hidden = true;
      return;
    }

    this.goals.hidden = false;
    this.goals.replaceChildren();

    if (this.isObjectivesCollapsed) {
      this.goals.className = 'gothic-hud-tracker collapsed';
      const completed = quest.objectives.filter((o) => o.completed).length;
      const header = document.createElement('div');
      header.className = 'tracker-collapsed-row';
      header.innerHTML = `<span class="tracker-icon">📜</span> <span class="tracker-title-text">Quests [Q] (${completed}/${quest.objectives.length})</span> <span class="tracker-chevron">▾</span>`;
      header.onclick = () => this.toggleObjectives();
      header.ondblclick = (e) => {
        e.stopPropagation();
        this.toggleJournal(this.lastSim ?? undefined);
      };
      this.goals.append(header);
    } else {
      this.goals.className = 'gothic-hud-tracker expanded';

      // Header Bar
      const header = document.createElement('div');
      header.className = 'tracker-title';
      header.innerHTML = `
        <div class="tracker-title-bar">
          <span class="tracker-title-text">📜 ${quest.title}</span>
          <span class="tracker-chevron">▴</span>
        </div>
        <div class="tracker-hint">[Click: Collapse | 2x: Journal]</div>
      `;
      header.onclick = (e) => {
        e.stopPropagation();
        this.toggleObjectives();
      };
      header.ondblclick = (e) => {
        e.stopPropagation();
        this.toggleJournal(this.lastSim ?? undefined);
      };
      this.goals.append(header);

      // Objective list
      const list = document.createElement('div');
      list.className = 'tracker-obj-list';

      for (const obj of quest.objectives) {
        const row = document.createElement('div');
        row.className = `tracker-obj-row ${obj.completed ? 'completed' : ''} ${obj.targetX !== undefined ? 'navigable' : ''}`;
        const mark = obj.completed ? '✔' : '◻';
        const progress = obj.total > 1 ? ` (${obj.current}/${obj.total})` : '';
        const navPin = obj.targetX !== undefined && !obj.completed ? '<span class="tracker-nav-pin" aria-label="Auto-Navigate">🧭</span>' : '';
        row.innerHTML = `
          <span class="tracker-mark">${mark}</span>
          <span class="tracker-obj-text">${obj.text}${progress}</span>
          ${navPin}
        `;
        if (obj.targetX !== undefined && obj.targetY !== undefined) {
          row.onclick = (e) => {
            e.stopPropagation();
            this.host.navigateTo?.(obj.targetX!, obj.targetY!, obj.text);
          };
        } else {
          row.onclick = (e) => {
            e.stopPropagation();
          };
        }
        list.append(row);
      }
      this.goals.append(list);
    }
  }

  /** Evaluates live quest progress directly from the simulation state */
  private evaluateQuestDossier(sim: Sim | null): QuestDossier {
    const st = sim?.script?.st;
    const isFordMap = this.doc.name.toLowerCase().includes('ford') || this.doc.name.toLowerCase().includes('blood');

    if (isFordMap) {
      // Build objectives from doc.text if present, ensuring live tracking from st.sub
      const customObjs: QuestObjective[] = [];
      const fordCoords: [number, number][] = [
        [32, 32], // Sunken Ford
        [34, 18], // River Ambush
        [39, 31], // High Ridge
        [52, 12], // Chieftain Grok'tar
        [8, 28],  // Granary Supply Cache
      ];
      if (st) {
        for (let i = 0; i < 16 && this.doc.text[`obj.${i}`] !== undefined; i++) {
          const text = this.doc.text[`obj.${i}`];
          const isCompleted = st.sub[i] === 2;
          const kindSpec = (this.doc.text[`obj.${i}.kind`] ?? '').toLowerCase();
          const isOptional =
            kindSpec === 'side' ||
            (kindSpec !== 'main' &&
              (text.toLowerCase().includes('recover') ||
                text.toLowerCase().includes('purify') ||
                text.toLowerCase().includes('optional') ||
                text.toLowerCase().startsWith('side:')));
          let coords: [number, number] = fordCoords[i] ?? [32, 32];
          const posSpec = this.doc.text[`obj.${i}.pos`];
          if (posSpec) {
            const parts = posSpec.split(',').map((s) => Number.parseInt(s.trim(), 10));
            if (parts.length === 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1])) {
              coords = [parts[0], parts[1]];
            }
          }
          customObjs.push({
            id: `obj-${i}`,
            text: isOptional && !text.toLowerCase().includes('optional') && !text.toLowerCase().startsWith('side:') ? `Optional: ${text}` : text,
            completed: isCompleted,
            current: isCompleted ? 1 : 0,
            total: 1,
            optional: isOptional,
            targetX: coords[0],
            targetY: coords[1],
          });
        }
      }

      // Default fallback objectives if none in text
      const defaultObjs: QuestObjective[] = [
        {
          id: 'obj-ford',
          text: 'Cross the Sunken Ford',
          completed: st ? (st.sub[0] === 2 || (st.sv[0] ?? 0) >= 1) : false,
          current: (st && (st.sub[0] === 2 || (st.sv[0] ?? 0) >= 1)) ? 1 : 0,
          total: 1,
          targetX: 32,
          targetY: 32,
        },
        {
          id: 'obj-ambush',
          text: 'Clear the River Ambush',
          completed: st ? st.sub[1] === 2 : false,
          current: (st && st.sub[1] === 2) ? 4 : (st && (st.sv[0] ?? 0) >= 1 ? 2 : 0),
          total: 4,
          targetX: 34,
          targetY: 18,
        },
        {
          id: 'obj-ridge',
          text: 'Infiltrate the High Ridge',
          completed: st ? (st.sub[2] === 2 || (st.sub[3] ?? 0) === 2) : false,
          current: (st && (st.sub[2] === 2 || (st.sub[3] ?? 0) === 2)) ? 1 : 0,
          total: 1,
          targetX: 39,
          targetY: 31,
        },
        {
          id: 'obj-chief',
          text: "Slay Chieftain Grok'tar",
          completed: sim ? (sim.cb.hp[12] <= 0 || (st?.sub[3] ?? 0) === 2) : false,
          current: (sim && (sim.cb.hp[12] <= 0 || (st?.sub[3] ?? 0) === 2)) ? 1 : 0,
          total: 1,
          targetX: 52,
          targetY: 12,
        },
        {
          id: 'obj-granary',
          text: 'Optional: Recover Granary Supply Cache',
          completed: sim ? (sim.cb.gold[0] >= 40 || (st?.sub[4] ?? 0) === 2) : false,
          current: (sim && (sim.cb.gold[0] >= 40 || (st?.sub[4] ?? 0) === 2)) ? 1 : 0,
          total: 1,
          optional: true,
          targetX: 8,
          targetY: 28,
        },
      ];

      const narrativeText = this.t('body') || `Warden Hale has sounded the grim muster bells at Thornwick Keep. Following weeks of escalating border skirmishes, the highland gnoll packs have united under Chieftain Grok'tar. They have burned the river mills, butchered the frontier patrols, and severed the grain supply roads to Thornwick.\n\nIntelligence reveals that Grok'tar is performing dark blood sacrifices upon ancient warding stones to shatter the realm's protective barriers. Your direct orders from the high garrison watch: march your company east, force a bloody crossing through the Sunken Ford, break the river ambushes, storm the High Ridge redoubt, and execute Chieftain Grok'tar upon his command bluff.\n\nField Warnings: Beware deep mud along the riverbanks that impedes heavy armor; gnoll archers conceal themselves behind the willows and fire poisoned barbed iron.`;

      return {
        id: 'main-scourge',
        category: 'main',
        actTitle: 'Act I · Chapter 1: The Scourge of Thornvael',
        title: this.t('title', 'Blood at the Ford'),
        location: 'Thornwick Marches · The Sunken Ford',
        narrative: narrativeText,
        objectives: customObjs.length >= 3 ? customObjs : defaultObjs,
        rewards: {
          gold: 250,
          xp: 500,
          renown: '+15 Thornwick Favor',
          item: 'Guaranteed Magic / Rare Tier II Item Drop',
        },
        sealText: 'SEALED BY WARDEN HALE · THORNWICK GARRISON',
      };
    }

    // Generic fallback for custom / other campaign maps
    const genericObjs: QuestObjective[] = [];
    if (st) {
      for (let i = 0; i < 16 && this.doc.text[`obj.${i}`] !== undefined; i++) {
        const text = this.doc.text[`obj.${i}`];
        const state = st.sub[i] ?? 0;
        const kindSpec = (this.doc.text[`obj.${i}.kind`] ?? '').toLowerCase();
        const isOptional =
          kindSpec === 'side' ||
          (kindSpec !== 'main' &&
            (text.toLowerCase().includes('optional') || text.toLowerCase().startsWith('side:')));
        let gx = Math.round(this.doc.w / 2);
        let gy = Math.round(this.doc.h / 2);
        const posSpec = this.doc.text[`obj.${i}.pos`];
        let parsedPos = false;
        if (posSpec) {
          const parts = posSpec.split(',').map((s) => Number.parseInt(s.trim(), 10));
          if (parts.length === 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1])) {
            gx = parts[0];
            gy = parts[1];
            parsedPos = true;
          }
        }
        if (!parsedPos) {
          if (this.doc.regions && this.doc.regions[i]) {
            const reg = this.doc.regions[i];
            gx = Math.round((reg.x1 + reg.x2) / 2);
            gy = Math.round((reg.y1 + reg.y2) / 2);
          } else if (this.doc.units && this.doc.units.length > 0) {
            const u = this.doc.units[i % this.doc.units.length];
            gx = u.x;
            gy = u.y;
          }
        }
        genericObjs.push({
          id: `gen-obj-${i}`,
          text,
          completed: state === 2,
          current: state === 2 ? 1 : 0,
          total: 1,
          optional: isOptional,
          targetX: gx,
          targetY: gy,
        });
      }
    }

    return {
      id: 'generic-mission',
      category: 'main',
      actTitle: `Campaign Operation: ${this.doc.name}`,
      title: this.t('title', this.doc.name),
      location: 'Frontiers of Thornvael',
      narrative: this.t('body', 'Advance your detachment, fulfill the mission objectives, and ensure the company prevails against hostile forces.'),
      objectives: genericObjs.length ? genericObjs : [{
        id: 'obj-primary',
        text: 'Destroy all enemy forces',
        completed: st ? st.status === 1 : false,
        current: st?.status === 1 ? 1 : 0,
        total: 1,
        targetX: Math.round(this.doc.w / 2),
        targetY: Math.round(this.doc.h / 2),
      }],
      rewards: {
        gold: 200,
        xp: 400,
        renown: '+10 Regional Favor',
        item: 'Frontier Equipment Spoils',
      },
      sealText: 'OFFICIAL GARRISON DISPATCH',
    };
  }

  /**
   * Interactive Quest Journal (#quest-journal, opened via Q key or HUD button [Q Quests])
   */
  toggleJournal(sim?: Sim): void {
    if (this.journalOpen) {
      this.closeJournal();
    } else {
      this.openJournal(sim);
    }
  }

  openJournal(sim?: Sim): void {
    if (sim) this.lastSim = sim;
    this.journalOpen = true;
    this.renderQuestJournal();
    this.questJournalModal.hidden = false;
    if (!this.plaques.length && typeof fetch === 'function') {
      const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : './';
      void loadLocationPlaques(base).then((pack) => {
        if (Array.isArray(pack?.entries)) {
          this.plaques = pack.entries;
          if (this.journalOpen && this.activeQuestId === 'field-plaques') {
            this.renderQuestJournal();
          }
        }
      }).catch(() => undefined);
    }
    try {
      play('click', 3);
    } catch {
      // Audio context ignored in tests
    }
  }

  closeJournal(): void {
    this.journalOpen = false;
    this.questJournalModal.hidden = true;
  }

  /** Renders the dual-pane parchment Quest Journal */
  private renderQuestJournal(): void {
    const q = this.questJournalModal;
    q.replaceChildren();

    const mainDossier = this.evaluateQuestDossier(this.lastSim);

    // Outer Journal Tome Container
    const journalFrame = document.createElement('div');
    journalFrame.className = 'gothic-journal-frame';

    // Header with wax seal crest & close button
    const header = document.createElement('div');
    header.className = 'gothic-journal-header';
    header.innerHTML = `
      <div class="journal-title-box">
        <span class="journal-header-crest">📜</span>
        <div>
          <h2>CHRONICLE OF THORNVAEL</h2>
          <span class="journal-subtitle">Garrison Quest Journal & Strategic Dossier</span>
        </div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'journal-close-btn';
    closeBtn.innerHTML = '✕ <span class="btn-hotkey">[Q / Esc]</span>';
    closeBtn.onclick = () => this.closeJournal();
    header.append(closeBtn);

    // Dual-Pane Layout
    const dualPane = document.createElement('div');
    dualPane.className = 'gothic-journal-dual-pane';

    // Left Pane: Quest Navigation
    const leftPane = document.createElement('div');
    leftPane.className = 'journal-nav-pane';

    const mainQuestsLabel = document.createElement('div');
    mainQuestsLabel.className = 'journal-section-label';
    mainQuestsLabel.textContent = 'ACTIVE CAMPAIGN';

    const questList = document.createElement('div');
    questList.className = 'journal-quest-list';

    // Quest Item 1: Main Quest
    const mainItem = document.createElement('div');
    mainItem.className = `journal-quest-card ${this.activeQuestId === 'main-scourge' ? 'selected' : ''}`;
    mainItem.innerHTML = `
      <div class="quest-seal-icon">${getGoldWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">${mainDossier.title}</div>
        <div class="quest-card-chapter">${mainDossier.actTitle.split(':')[0]}</div>
        <div class="quest-card-status">${mainDossier.objectives.filter((o) => o.completed).length}/${mainDossier.objectives.length} Objectives</div>
      </div>
    `;
    mainItem.onclick = () => {
      this.activeQuestId = 'main-scourge';
      this.renderQuestJournal();
    };

    // Quest Item 2: Side Quest 1 (Granary)
    const sideItem = document.createElement('div');
    sideItem.className = `journal-quest-card ${this.activeQuestId === 'side-granary' ? 'selected' : ''}`;
    sideItem.innerHTML = `
      <div class="quest-seal-icon">${getSilverWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Granary Supply Cache</div>
        <div class="quest-card-chapter">Act I · Frontier Recovery</div>
        <div class="quest-card-status">${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? 'Secured' : 'In Progress'}</div>
      </div>
    `;
    sideItem.onclick = () => {
      this.activeQuestId = 'side-granary';
      this.renderQuestJournal();
    };

    // Quest Item 3: Side Quest 2 (Ancestral Relic)
    const relicItem = document.createElement('div');
    relicItem.className = `journal-quest-card ${this.activeQuestId === 'side-relic' ? 'selected' : ''}`;
    relicItem.innerHTML = `
      <div class="quest-seal-icon">${getSilverWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Ancestral Astral Relic</div>
        <div class="quest-card-chapter">Act I · Ancient Crypt</div>
        <div class="quest-card-status">Active Directive</div>
      </div>
    `;
    relicItem.onclick = () => {
      this.activeQuestId = 'side-relic';
      this.renderQuestJournal();
    };

    // Quest Item 4: Side Quest 3 (Elite Lieutenant)
    const lieutenantItem = document.createElement('div');
    lieutenantItem.className = `journal-quest-card ${this.activeQuestId === 'side-lieutenant' ? 'selected' : ''}`;
    lieutenantItem.innerHTML = `
      <div class="quest-seal-icon">${getSilverWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Slay Shaman Mor'drak</div>
        <div class="quest-card-chapter">Act I · Elite Bounty</div>
        <div class="quest-card-status">Active Directive</div>
      </div>
    `;
    lieutenantItem.onclick = () => {
      this.activeQuestId = 'side-lieutenant';
      this.renderQuestJournal();
    };

    // Quest Item 5: Act II Strategic Briefing
    const act2Item = document.createElement('div');
    act2Item.className = `journal-quest-card ${this.activeQuestId === 'act-2-dossier' ? 'selected' : ''}`;
    act2Item.innerHTML = `
      <div class="quest-seal-icon">${getGoldWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">The Desiccated Marches</div>
        <div class="quest-card-chapter">Act II · Imperial Dossier</div>
        <div class="quest-card-status">Strategic Campaign</div>
      </div>
    `;
    act2Item.onclick = () => {
      this.activeQuestId = 'act-2-dossier';
      this.renderQuestJournal();
    };

    // Quest Item 6: Act III Strategic Briefing
    const act3Item = document.createElement('div');
    act3Item.className = `journal-quest-card ${this.activeQuestId === 'act-3-dossier' ? 'selected' : ''}`;
    act3Item.innerHTML = `
      <div class="quest-seal-icon">${getGoldWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Sunless Deeps Catacombs</div>
        <div class="quest-card-chapter">Act III · Abyssal Dossier</div>
        <div class="quest-card-status">Strategic Campaign</div>
      </div>
    `;
    act3Item.onclick = () => {
      this.activeQuestId = 'act-3-dossier';
      this.renderQuestJournal();
    };

    // Quest Item 7: Act IV Strategic Briefing
    const act4Item = document.createElement('div');
    act4Item.className = `journal-quest-card ${this.activeQuestId === 'act-4-dossier' ? 'selected' : ''}`;
    act4Item.innerHTML = `
      <div class="quest-seal-icon">${getGoldWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Gates of Infernal Core</div>
        <div class="quest-card-chapter">Act IV · Final Reckoning</div>
        <div class="quest-card-status">Strategic Campaign</div>
      </div>
    `;
    act4Item.onclick = () => {
      this.activeQuestId = 'act-4-dossier';
      this.renderQuestJournal();
    };

    // Quest Item 8: Completed Prologue
    const completedItem = document.createElement('div');
    completedItem.className = `journal-quest-card ${this.activeQuestId === 'prologue-muster' ? 'selected' : ''}`;
    completedItem.innerHTML = `
      <div class="quest-seal-icon">${getCompletedWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Muster at Thornwick</div>
        <div class="quest-card-chapter">Prologue · Garrison Orders</div>
        <div class="quest-card-status">Completed ✔</div>
      </div>
    `;
    completedItem.onclick = () => {
      this.activeQuestId = 'prologue-muster';
      this.renderQuestJournal();
    };

    // Quest Item 9: Field Plaques & Regional Gazetteer
    const plaquesItem = document.createElement('div');
    plaquesItem.className = `journal-quest-card ${this.activeQuestId === 'field-plaques' ? 'selected' : ''}`;
    plaquesItem.innerHTML = `
      <div class="quest-seal-icon">${getSilverWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Field Plaques & Landmarks</div>
        <div class="quest-card-chapter">Provincial Gazetteer</div>
        <div class="quest-card-status">${this.plaques.length ? `${this.plaques.length} Monuments` : 'Archive'}</div>
      </div>
    `;
    plaquesItem.onclick = () => {
      this.activeQuestId = 'field-plaques';
      this.renderQuestJournal();
    };

    questList.append(mainItem, sideItem, relicItem, lieutenantItem, act2Item, act3Item, act4Item, completedItem, plaquesItem);
    leftPane.append(mainQuestsLabel, questList);

    // Right Pane: Detailed Quest Dossier
    const rightPane = document.createElement('div');
    rightPane.className = 'journal-dossier-pane';

    if (this.activeQuestId === 'main-scourge' || this.activeQuestId === 'generic-mission') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">${mainDossier.actTitle}</div>
          <h1 class="dossier-title">${mainDossier.title}</h1>
          <div class="dossier-location">📍 ${mainDossier.location}</div>
        </div>

        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>

        <div class="dossier-section-heading">BRIEFING & HISTORICAL RECORD</div>
        <p class="dossier-narrative">${mainDossier.narrative.replace(/\n\n/g, '</p><p class="dossier-narrative">')}</p>

        <div class="dossier-section-heading">OPERATIONAL DIRECTIVES</div>
        <div class="dossier-objectives-list" id="dossier-objectives"></div>

        <div class="dossier-section-heading">VICTORY SPOILS & BOUNTIES</div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>${mainDossier.rewards.gold} Gold</strong> Bounty</div>
          <div class="reward-pill xp-reward">⚡ <strong>${mainDossier.rewards.xp} XP</strong> Experience</div>
          <div class="reward-pill renown-reward">🛡️ <strong>${mainDossier.rewards.renown}</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>${mainDossier.rewards.item}</strong></div>
        </div>

        <div class="dossier-signature">
          <div class="signature-stamp">${getGoldWaxSealSvg()}</div>
          <div class="signature-text">${mainDossier.sealText}</div>
        </div>
      `;

      // Fill in interactive live objectives with checkboxes & counters
      const objContainer = rightPane.querySelector('#dossier-objectives');
      if (objContainer) {
        for (const obj of mainDossier.objectives) {
          const item = document.createElement('div');
          item.className = `dossier-obj-row ${obj.completed ? 'completed' : ''}`;
          const progressTag = obj.total > 1 ? `<span class="obj-counter">(${obj.current}/${obj.total})</span>` : '';
          const optTag = obj.optional ? '<span class="obj-optional">[Optional]</span> ' : '';
          const navAction = obj.targetX !== undefined && obj.targetY !== undefined && !obj.completed
            ? `<button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>`
            : '';
          item.innerHTML = `
            <span class="obj-checkbox">${obj.completed ? '✔' : '◻'}</span>
            <span class="obj-text">${optTag}${obj.text} ${progressTag}</span>
            <span class="obj-badge ${obj.completed ? 'done' : 'active'}">${obj.completed ? 'COMPLETED' : 'IN PROGRESS'}</span>
            ${navAction}
          `;
          if (obj.targetX !== undefined && obj.targetY !== undefined && !obj.completed) {
            const btn = item.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
            if (btn) {
              btn.onclick = (e) => {
                e.stopPropagation();
                this.closeJournal();
                this.host.navigateTo?.(obj.targetX!, obj.targetY!, obj.text);
              };
            }
          }
          objContainer.append(item);
        }
      }
    } else if (this.activeQuestId === 'side-granary') {
      const granaryDone = (this.lastSim?.cb.gold[0] ?? 0) >= 40;
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Side Mission · Frontier Recovery & Supply Security</div>
          <h1 class="dossier-title">Granary Supply Cache</h1>
          <div class="dossier-location">📍 Sunken Ford · Burned River Mill & Charred Granary Cellars</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">HISTORICAL INTELLIGENCE & MILITARY RECORD</div>
        <p class="dossier-narrative">Erected a century ago during the First Northern Truce, the Thornwick River Granary once stored winter rations for three frontier garrisons. During their sudden assault across the shallows, Chieftain Grok'tar's warbands put the timber mill to the torch, pillaging flour and salt pork into ironbound caches along the riverbank. Recovering these supplies is vital to preserve the garrison from midwinter famine.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> Gnoll war-raiders use the dense river smoke as concealment. Feral brutes armed with barbed cleavers lurk in the flooded root hollows. Approach behind raised pavises and deploy area spells to flush out ambushers.</p>
        <div class="dossier-section-heading">PRIMARY DIRECTIVE</div>
        <div class="dossier-objectives-list" id="side-dossier-objectives">
          <div class="dossier-obj-row ${granaryDone ? 'completed' : ''}">
            <span class="obj-checkbox">${granaryDone ? '✔' : '◻'}</span>
            <span class="obj-text">Recover Provisions & Recover Gold Cache from the Camp (Current: ${this.lastSim?.cb.gold[0] ?? 0} Gold)</span>
            <span class="obj-badge ${granaryDone ? 'done' : 'active'}">${granaryDone ? 'COMPLETED' : 'IN PROGRESS'}</span>
            ${!granaryDone ? '<button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>' : ''}
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+100 Bonus Gold</strong> Sovereigns</div>
          <div class="reward-pill xp-reward">⚡ <strong>+150 XP</strong> Veteran Drill</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+10 Thornwick Favor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Highland Rations & Silver Coin</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getSilverWaxSealSvg()}</div>
          <div class="signature-text">COMMISSIONED BY BORDER QUARTERMASTER</div>
        </div>
      `;
      if (!granaryDone) {
        const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            this.closeJournal();
            this.host.navigateTo?.(8, 28, 'Granary Supply Cache');
          };
        }
      }
    } else if (this.activeQuestId === 'side-relic') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act I · Sacred Archeology & Relic Recovery</div>
          <h1 class="dossier-title">Ancestral Astral Relic</h1>
          <div class="dossier-location">📍 Sunken Riverbed Crypt · Sarcophagus of the First Warden</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">HISTORICAL INTELLIGENCE & LORE CHRONICLE</div>
        <p class="dossier-narrative">High Arcanist Vaelen recounts that three centuries ago, during the Sundering of the First Shrines, an astral-infused talisman of celestial electrum was sealed within a submerged granite tomb beneath the riverbed. The gnoll shamans now excavate the shallows, seeking to desecrate the relic for their necrotic blood-pyres. You must breach the submerged crypt, eliminate the excavation guard, and reclaim the ancestral talisman.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> The sunken tomb is saturated with lingering astral radiation and guarded by entombed Hollow Knights who feel no pain. Their ancient runic blades bypass normal armor absorption; maintain distance and concentrate holy or frost magic.</p>
        <div class="dossier-section-heading">OPERATIONAL DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Infiltrate the Submerged Riverbed Crypt & Slay Tomb Wardens</span>
            <span class="obj-badge active">IN PROGRESS</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+220 Gold</strong> Sovereigns</div>
          <div class="reward-pill xp-reward">⚡ <strong>+350 XP</strong> Grimoire Lore</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+25 Astral Coven Favor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Guaranteed Unique Astral Ring or Amulet</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getSilverWaxSealSvg()}</div>
          <div class="signature-text">SANCTIONED BY HIGH ARCANIST VAELEN</div>
        </div>
      `;
      const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.closeJournal();
          this.host.navigateTo?.(30, 10, 'Submerged Riverbed Crypt');
        };
      }
    } else if (this.activeQuestId === 'side-lieutenant') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act I · Elite Bounty Contract & Decapitation Strike</div>
          <h1 class="dossier-title">Assassinate Blood-Shaman Mor'drak</h1>
          <div class="dossier-location">📍 Northern Ridge Bluff · Corrupted Blood Altar</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">TACTICAL BRIEFING & MILITARY DOSSIER</div>
        <p class="dossier-narrative">Ford-Scout Bren has confirmed that Chieftain Grok'tar's dark vizier, Shaman Mor'drak, has erected a blasphemous sacrificial altar upon the high northern bluffs. From this shrine of carved beast-bones, Mor'drak channels necrotic warding rituals that shield the river gnolls from mortal wounds. Slaying Mor'drak will shatter the enemy's supernatural resolve and throw their ranks into confusion.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> Mor'drak commands a fanatical cabal of blood-witches who cast lingering decay hexes and summon rabid fen-hounds. Keep formations dispersed to avoid chain hexes and focus missile fire upon the ritualists first.</p>
        <div class="dossier-section-heading">OPERATIONAL DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Assassinate Shaman Mor'drak & Sunder the Corrupted Blood Altar</span>
            <span class="obj-badge active">IN PROGRESS</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+350 Gold</strong> Royal Bounty</div>
          <div class="reward-pill xp-reward">⚡ <strong>+450 XP</strong> Tactical Renown</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+30 Thornwick Honor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Guaranteed Rare Tier II Blade or Staff</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getGoldWaxSealSvg()}</div>
          <div class="signature-text">ISSUED BY CAPTAIN MERRICK · HIGH KEEP</div>
        </div>
      `;
      const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.closeJournal();
          this.host.navigateTo?.(55, 18, "Shaman Mor'drak's Altar");
        };
      }
    } else if (this.activeQuestId === 'act-2-dossier') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act II · Imperial Campaign Strategic Dossier</div>
          <h1 class="dossier-title">The Desiccated Marches</h1>
          <div class="dossier-location">📍 Redmarsh Frontier, Salt Basin & Glass Waste Dunes</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">THEATRE OF WAR & CAMPAIGN CONTEXT</div>
        <p class="dossier-narrative">Beyond the receding waters of the frontier lies the Desiccated Marches—a brutal expanse where ancient inland seas boiled into barren salt flats and sand dunes under primordial cataclysms. Imperial trade caravans have been annihilated by burrowing dune scourges, and corrupted obelisks bleed dark elemental fire into the dust storms. Your army must advance along the ancient causeway, secure the water outposts, and force passage to the mountains.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> Extreme heat exhausts stamina; hostile dune scourges burrow beneath the sand and ambush from the rear. Equip piercing polearms and maintain vigilance on open flanks.</p>
        <div class="dossier-section-heading">PRIMARY DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Force the Redmarsh Crossing & Secure Forward Oasis Outposts</span>
            <span class="obj-badge active">CAMPAIGN GOAL</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+600 Gold</strong> Sovereigns</div>
          <div class="reward-pill xp-reward">⚡ <strong>+800 XP</strong> Desert Veteran</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+40 Desiccated March Favor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Tier III Set & Unique Relics</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getGoldWaxSealSvg()}</div>
          <div class="signature-text">IMPERIAL HIGH WAR OFFICE DISPATCH</div>
        </div>
      `;
      const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.closeJournal();
          this.host.navigateTo?.(42, 38, 'Redmarsh Frontier');
        };
      }
    } else if (this.activeQuestId === 'act-3-dossier') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act III · Subterranean Incursion Strategic Dossier</div>
          <h1 class="dossier-title">Catacombs of the Sunless Deeps</h1>
          <div class="dossier-location">📍 Sunless Abyss & Flooded Vaults beneath the Iron Coast</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">THEATRE OF WAR & ABYSSAL RECORD</div>
        <p class="dossier-narrative">Daylight perishes as your expedition marches into the abyssal fissures beneath the crashing tides of the Iron Coast. These submerged labyrinthine vaults, carved by long-dead dwarven artisans, are now overrun by blind chitinous horrors and undead legions bound in primeval runic chains. You must breach the flooded causeways, recover the ancient runestones, and uncover the subterranean route leading to the heart of the realm.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> Pitch darkness and treacherous flooded stone causeways. Chitinous broods scale the stalactites to drop directly upon the party's center. Keep torches lit and protect your arcanists.</p>
        <div class="dossier-section-heading">PRIMARY DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Sunder the Deep Runestone Chains & Slay the Brood Queen</span>
            <span class="obj-badge active">CAMPAIGN GOAL</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+1200 Gold</strong> Sovereigns</div>
          <div class="reward-pill xp-reward">⚡ <strong>+1600 XP</strong> Abyssal Conqueror</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+60 Iron Coast Standing</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Tier IV High Master Artifacts</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getGoldWaxSealSvg()}</div>
          <div class="signature-text">DECREE OF THE IRON COUNCIL</div>
        </div>
      `;
      const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.closeJournal();
          this.host.navigateTo?.(28, 44, 'Sunless Abyss');
        };
      }
    } else if (this.activeQuestId === 'act-4-dossier') {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act IV · Apex Campaign Final Reckoning Dossier</div>
          <h1 class="dossier-title">Gates of the Infernal Sanctuary</h1>
          <div class="dossier-location">📍 The Obsidian Caldera, Lava Chasm & Citadel of Ruin</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">FINAL CHRONICLE OF THORNVAEL</div>
        <p class="dossier-narrative">The earth trembles in agony as rivers of boiling slag split the volcanic highway. Before you stands the Infernal Citadel—a cyclopean bastion of meteoric iron and necrotic sorcery where the Arch-Warden binds the tortured leylines to extinguish the sun. Every step across the burning slag must be carved in blood; you stand at the apex of the war where every blade stroke writes the destiny of Thornvael.</p>
        <div class="dossier-section-heading">TACTICAL RECONNAISSANCE & HAZARD WARNINGS</div>
        <p class="dossier-narrative">⚠️ <strong>Field Hazard:</strong> Extreme volcanic heat, rivers of instant-death magma, and continuous artillery barrages from fortress mana-cannons. Only disciplined formation advance and master-tier wards will endure the storm.</p>
        <div class="dossier-section-heading">FINAL DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Breach the Infernal Citadel & Vanquish the Dread Sovereign</span>
            <span class="obj-badge active">FINAL RECKONING</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+3000 Gold</strong> Imperial Treasury</div>
          <div class="reward-pill xp-reward">⚡ <strong>+4000 XP</strong> Mythic Paragon</div>
          <div class="reward-pill renown-reward">🛡️ <strong>Sovereign of Thornvael</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Legendary Tier V Crown & Regalia</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getCompletedWaxSealSvg()}</div>
          <div class="signature-text">SOVEREIGN SEAL OF THE ALLIED REALMS</div>
        </div>
      `;
      const btn = rightPane.querySelector('.dossier-nav-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.closeJournal();
          this.host.navigateTo?.(50, 15, 'Infernal Citadel');
        };
      }
    } else if (this.activeQuestId === 'field-plaques') {
      const actNum: CampaignStage = mainDossier.actTitle.includes('IV')
        ? 4
        : mainDossier.actTitle.includes('III')
          ? 3
          : mainDossier.actTitle.includes('II')
            ? 2
            : 1;
      const entries = this.plaques.length ? getPlaquesByAct(this.plaques, actNum) : [];
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Act ${actNum} · Imperial Frontier Gazetteer</div>
          <h1 class="dossier-title">Field Plaques & Landmarks</h1>
          <div class="dossier-location">📍 Surveyed Markers Across the Province</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
      `;
      const list = document.createElement('div');
      list.className = 'journal-plaques-grid';
      if (!entries.length) {
        const note = document.createElement('p');
        note.className = 'dossier-narrative';
        note.textContent = 'Regional cartography entries are loading from the imperial ledger...';
        list.append(note);
      } else {
        for (const p of entries) {
          const card = document.createElement('article');
          card.className = 'journal-plaque-card';
          const reg = document.createElement('div');
          reg.className = 'journal-plaque-region';
          reg.textContent = p.region;
          const title = document.createElement('h3');
          title.className = 'journal-plaque-title';
          title.textContent = p.title;
          const body = document.createElement('p');
          body.className = 'journal-plaque-text';
          body.textContent = p.text;
          card.append(reg, title, body);
          list.append(card);
        }
      }
      rightPane.append(list);
    } else {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Historical Record · Chapter Prologue & Garrison Oath</div>
          <h1 class="dossier-title">Muster at Thornwick</h1>
          <div class="dossier-location">📍 Thornwick Fortress Garrison · Great Hall of Oaths</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">RECORDED ENTRY & GARRISON COMMISSION</div>
        <p class="dossier-narrative">In the torch-lit courtyard of Thornwick Fortress, amidst driving rain and tolling war bells, your company swore the iron covenant of the frontier. Warden Hale reviewed your soldiers, inspected weapons and harness, and issued the sovereign commission empowering your blades to cross the border and eliminate all hostile forces threatening the realm.</p>
        <div class="dossier-section-heading">COMMISSION RECORD</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row completed">
            <span class="obj-checkbox">✔</span>
            <span class="obj-text">Assemble company of twelve and accept Warden Hale's sovereign commission</span>
            <span class="obj-badge done">COMPLETED</span>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+150 Gold</strong> Frontier Stipend</div>
          <div class="reward-pill xp-reward">⚡ <strong>+200 XP</strong> Veteran Experience</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+15 Thornwick Favor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Frontier Commission Badge & Armory Writ</strong></div>
        </div>
        <div class="dossier-signature">
          <div class="signature-stamp">${getCompletedWaxSealSvg()}</div>
          <div class="signature-text">COMMISSION VERIFIED · WARDEN HALE</div>
        </div>
      `;
    }

    dualPane.append(leftPane, rightPane);
    journalFrame.append(header, dualPane);
    q.append(journalFrame);
  }

  /** After snapshot restore: do not replay old messages */
  resync(sim: Sim): void {
    this.cursor = sim.script?.st.msgs.length ?? 0;
    this.queue = [];
  }

  resultText(sim: Sim): string {
    const st = sim.script!.st;
    if (st.status === 1) {
      const ep = (this.content?.victory_epilogue ?? []).map((e) => `${speakerName(e.speaker)}: ${e.line}`).join('\n');
      return this.t('win', S.victoryBody) + (ep ? `\n\n${ep}` : '');
    }
    const lose = this.t(`fail.${st.cause}`, S.defeatBody);
    return this.content?.defeat_line ? `${lose}\n\n${this.content.defeat_line}` : lose;
  }
}

/** The list of missions and tools, opened from the bar */
export function showMissionMenu(): void {
  let el = document.getElementById('missions');
  if (!el) {
    el = document.createElement('div');
    el.id = 'missions';
    el.className = 'sheet';
    document.body.append(el);
  }
  const root = el;
  root.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = S.mission.menu;
  root.append(h);
  const isDebug = typeof location !== 'undefined' && location.search.includes('debug');
  const links: [string, string][] = [
    ...(isDebug ? [[S.mission.free, './?free=1'] as [string, string]] : []),
    [S.mission.ford, './?mission=ford'],
    [S.mission.market, './?mission=market'],
    ...(isDebug
      ? ([
          [S.mission.test, './?mission=test'],
          [S.mission.editor, './editor.html'],
        ] as [string, string][])
      : []),
  ];
  for (const [label, href] of links) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.className = 'menu-link';
    root.append(a);
  }
  const close = document.createElement('button');
  close.textContent = S.mission.close;
  close.onclick = () => (root.hidden = true);
  root.append(close);
  root.hidden = false;
}

const PAINTED_SPEAKERS = new Set<string>(["merc-alder-poacher", "merc-ash-battlemage", "merc-catacomb-bailiff", "merc-cistern-acolyte", "merc-drowned-arbiter", "merc-dune-houndmaster", "merc-greywood-chopper", "merc-harbor-arbalest", "merc-hedge-leech", "merc-ironcamp-halberdier", "merc-ironclad-turncoat", "merc-lantern-novice", "merc-oakhaven-marine", "merc-obsidian-sapper", "merc-parish-sexton", "merc-penitent-flagellant", "merc-quarry-sapper", "merc-redmarsh-slinger", "merc-salt-mercenary", "merc-slag-hound-sniper", "merc-storm-channeler", "merc-thornwick-levyman", "merc-tomb-notary", "merc-triage-surgeon", "npc-alder-ferryman", "npc-alkali-drover", "npc-ash-collector", "npc-ash-scout", "npc-ashbrook-watchman", "npc-bog-scavenger", "npc-border-peddler", "npc-bridge-tinker", "npc-cairn-pilgrim", "npc-cinder-apothecary", "npc-cistern-guard", "npc-cliff-falconer", "npc-dike-surveyor", "npc-disgraced-scribe", "npc-escaped-oarsman", "npc-fen-hermit", "npc-fen-peatcutter", "npc-ford-herbalist", "npc-ford-tollkeeper", "npc-foundry-stoker", "npc-greystone-sentry", "npc-greywood-sawyer", "npc-harbor-firewarden", "npc-harbor-pilot", "npc-leech-apothecary", "npc-lighthouse-keeper", "npc-mad-prophet", "npc-marsh-flagellant", "npc-miner-tomas", "npc-net-mender", "npc-oakhaven-surgeon", "npc-peat-cutter", "npc-ravenwatch-runner", "npc-relic-smuggler", "npc-riverlock-keeper", "npc-salt-corporal", "npc-salt-raker", "npc-siege-deserter", "npc-siege-sapper", "npc-threshold-penitent", "npc-warden-hale", "npc-wardstone-surveyor", "npc-willow-deserter", "npc-wreck-diver"]);

/** Painted portrait (Gemini-generated, see assets.json) with the vector portrait as an offline fallback. */
export function paintedPortrait(file: string, fallbackSvg: string): string {
  const fb = fallbackSvg.replace(/"/g, '&quot;').replace(/\s+/g, ' ');
  const ext = file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.webp') ? '' : '.jpg';
  const fileName = file.includes('.') ? file : `${file}${ext}`;
  return `<img class="portrait-img" src="${import.meta.env.BASE_URL}townart/${fileName}" alt="" onerror="this.outerHTML=this.dataset.fb" data-fb="${fb}">`;
}
