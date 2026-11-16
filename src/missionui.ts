import type { MapDoc } from './mapdoc';
import { Kind } from './sim/combat';
import type { Sim } from './sim/sim';
import { S } from './strings';
import { blip, play } from './audio';

/** Host callbacks: the game owns the pause flag. */
export interface MissionHost {
  pause(on: boolean): void;
  navigateTo?(tx: number, ty: number, label: string): void;
}

const OBJ_MARK = ['', '◻', '✔', '✖'];

export interface QuestObjective {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly current: number;
  readonly total: number;
  readonly optional?: boolean;
  readonly targetX?: number;
  readonly targetY?: number;
}

export interface QuestReward {
  readonly gold: number;
  readonly xp: number;
  readonly renown: string;
  readonly item: string;
}

export interface QuestDossier {
  readonly id: string;
  readonly category: 'main' | 'side' | 'completed';
  readonly actTitle: string;
  readonly title: string;
  readonly location: string;
  readonly narrative: string;
  readonly objectives: readonly QuestObjective[];
  readonly rewards: QuestReward;
  readonly sealText: string;
}

/** SVG Vector Portraits for Gothic Characters */
export function getWardenHalePortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
  <defs>
    <radialGradient id="bg-scout" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#243328"/>
      <stop offset="100%" stop-color="#0c140e"/>
    </radialGradient>
  </defs>
  <rect width="120" height="120" fill="url(#bg-scout)"/>
  <path d="M 20 120 Q 35 80 60 76 Q 85 80 100 120 Z" fill="#1f2c22" stroke="#0e1711" stroke-width="2"/>
  <path d="M 34 50 C 30 20 90 20 86 50 C 86 66 78 76 60 78 C 42 76 34 66 34 50 Z" fill="#2d3d30" stroke="#131c15" stroke-width="2"/>
  <ellipse cx="50" cy="48" rx="3" ry="2" fill="#70c482"/>
  <ellipse cx="70" cy="48" rx="3" ry="2" fill="#70c482"/>
  <rect x="2" y="2" width="116" height="116" rx="4" fill="none" stroke="#5a7a60" stroke-width="2"/>
</svg>`;
}

export function getHighArcanistVaelenPortraitSvg(): string {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait-svg">
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

  private queue: { who: string; text: string }[] = [];
  private cursor = 0;
  private dialogueActive = false;
  private journalOpen = false;
  private activeQuestId = 'main-scourge';
  private lastSim: Sim | null = null;
  private typingTimer: number | null = null;
  private fullTypingText = '';
  private typingCallback: (() => void) | null = null;

  constructor(
    private readonly doc: MapDoc,
    private readonly host: MissionHost,
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
    if (lower.includes('hale') || lower.includes('warden')) {
      return {
        name: 'Warden Hale',
        rank: 'Captain of the Thornwick Border Guard',
        portraitSvg: paintedPortrait('npc-hale', getWardenHalePortraitSvg()),
      };
    }
    if (lower.includes('vaelen') || lower.includes('arcanist')) {
      return {
        name: 'High Arcanist Vaelen',
        rank: 'Archmage & Scholar of the Astral Veil',
        portraitSvg: getHighArcanistVaelenPortraitSvg(),
      };
    }
    if (lower.includes('bren') || lower.includes('ford-scout') || lower.includes('river scout')) {
      return {
        name: 'Ford-Scout Bren',
        rank: 'Frontier Scout & River Pathfinder',
        portraitSvg: getFordScoutBrenPortraitSvg(),
      };
    }
    if (lower.includes('merrick') || lower.includes('commander merrick')) {
      return {
        name: 'Captain Merrick',
        rank: 'Garrison Commander of the High Keep',
        portraitSvg: getCaptainMerrickPortraitSvg(),
      };
    }
    if (lower.includes('patron') || lower.includes('barkeep') || lower.includes('corin') || lower.includes('rumor')) {
      return {
        name: 'Master Corin',
        rank: 'Tavern Keeper & Frontier Chronicler',
        portraitSvg: getTavernPatronPortraitSvg(),
      };
    }
    if (lower.includes('grok') || lower.includes('chief') || lower.includes('gnoll')) {
      return {
        name: "Chieftain Grok'tar",
        rank: 'Warlord of the Riverfang Gnoll Pack',
        portraitSvg: paintedPortrait('npc-groktar', getChieftainGroktarPortraitSvg()),
      };
    }
    if (lower.includes('hero') || lower.includes('you')) {
      return {
        name: 'Company Commander',
        rank: 'Leader of the Thornwick Expeditionary Company',
        portraitSvg: paintedPortrait('npc-commander', getHeroPortraitSvg()),
      };
    }
    const named: Array<[string, string, string]> = [
      ['orlen', 'Orlen', 'Marsh Herbalist and Rot-Warden'],
      ['sabik', 'Sabik', 'Dune Scout of the Glass Wastes'],
      ['quillon', 'Quillon', 'Sage of the Drowned Coast'],
      ['aldren', 'Aldren', 'Veteran Knight of the Burnt Keep'],
      ['outpost scout', 'Outpost Scout', 'Frontier Ranger'],
    ];
    for (const [key, name, rank] of named) {
      if (lower.includes(key)) {
        return { name, rank, portraitSvg: paintedPortrait(`npc-${key.split(' ')[0] === 'outpost' ? 'scout' : key}`, getFallbackPortraitSvg()) };
      }
    }
    if (lower.includes('cache') || lower.includes('granary')) {
      return {
        name: 'Granary Cache',
        rank: 'Charred Frontier Supply Store',
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
      portraitSvg: getFallbackPortraitSvg(),
    };
  }

  /**
   * Character Portrait Dialogue Box (#gothic-dialogue):
   * Speaker portrait on left, gold filigree nameplate, typewriter typography with typing sound cue.
   */
  private showDialogue(who: string, text: string, buttonText: string, done: () => void): void {
    this.dialogueActive = true;
    this.host.pause(true);
    this.dialogueModal.hidden = false;
    this.dialogueModal.replaceChildren();

    const info = this.getSpeakerInfo(who);
    const frame = document.createElement('div');
    frame.className = 'gothic-dialogue-frame';

    // Left Column: Speaker Portrait
    const portraitCol = document.createElement('div');
    portraitCol.className = 'gothic-portrait-wrapper';
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
    bodyEl.textContent = '';

    const footer = document.createElement('div');
    footer.className = 'gothic-dialogue-footer';

    const queueCounter = document.createElement('span');
    queueCounter.className = 'dialogue-queue-count';
    queueCounter.textContent = this.queue.length ? `Next in Queue: +${this.queue.length}` : 'Directive Final';

    const contBtn = document.createElement('button');
    contBtn.className = 'gothic-continue-btn';
    contBtn.innerHTML = `${buttonText} <span class="btn-hotkey">[Space / Click]</span>`;

    footer.append(queueCounter, contBtn);
    contentCol.append(nameplate, bodyEl, footer);
    frame.append(portraitCol, contentCol);
    this.dialogueModal.append(frame);

    // Typewriter effect state
    if (this.typingTimer !== null) clearInterval(this.typingTimer);
    this.fullTypingText = text;
    let charIdx = 0;
    let isTyping = true;

    const finishTyping = () => {
      if (this.typingTimer !== null) {
        clearInterval(this.typingTimer);
        this.typingTimer = null;
      }
      bodyEl.textContent = this.fullTypingText;
      isTyping = false;
      contBtn.focus();
    };

    const advance = () => {
      if (isTyping) {
        finishTyping();
      } else {
        this.dialogueModal.hidden = true;
        this.dialogueActive = false;
        done();
      }
    };

    this.typingCallback = advance;
    contBtn.onclick = (e) => {
      e.stopPropagation();
      advance();
    };
    frame.onclick = () => advance();

    // Typewriter interval with audio cue
    this.typingTimer = window.setInterval(() => {
      if (charIdx < text.length) {
        bodyEl.textContent += text[charIdx];
        if (charIdx % 3 === 0 && text[charIdx] !== ' ') {
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
    const body = this.t('body', 'The raiders have crossed the border fords. Lead your company across the water and put an end to their chief.');
    this.showDialogue('Warden Hale', `${title}: ${body}`, S.mission.begin, () => {
      this.host.pause(false);
      begin();
      // Render initial objectives
      if (this.lastSim) this.update(this.lastSim);
    });
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
      });
    }

    // Display next dialogue in queue
    if (!this.dialogueActive && this.queue.length) {
      const m = this.queue.shift()!;
      this.showDialogue(m.who, m.text, this.queue.length ? S.mission.next : S.mission.go, () => {
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
        for (let i = 0; this.doc.text[`obj.${i}`] !== undefined; i++) {
          const text = this.doc.text[`obj.${i}`];
          const isCompleted = st.sub[i] === 2;
          const isOptional = text.toLowerCase().includes('recover') || text.toLowerCase().includes('purify') || text.toLowerCase().includes('optional');
          const coords = fordCoords[i] ?? [32, 32];
          customObjs.push({
            id: `obj-${i}`,
            text: isOptional && !text.toLowerCase().includes('optional') ? `Optional: ${text}` : text,
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

      const narrativeText = this.t('body') || `Warden Hale has sounded the muster bells at Thornwick. Following weeks of escalating border skirmishes, the highland gnoll packs have united under Chieftain Grok'tar. They have burned the river mills, slaughtered the frontier patrols, and severed the grain supply roads.\n\nYour orders from the garrison watch: march your company east, force a crossing through the Sunken Ford, break the river ambushes, storm the High Ridge redoubt, and execute Chieftain Grok'tar to secure the border.`;

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
      for (let i = 0; this.doc.text[`obj.${i}`] !== undefined; i++) {
        const state = st.sub[i] ?? 0;
        let gx = Math.round(this.doc.w / 2);
        let gy = Math.round(this.doc.h / 2);
        if (this.doc.regions && this.doc.regions[i]) {
          const reg = this.doc.regions[i];
          gx = Math.round((reg.x1 + reg.x2) / 2);
          gy = Math.round((reg.y1 + reg.y2) / 2);
        } else if (this.doc.units && this.doc.units.length > 0) {
          const u = this.doc.units[i % this.doc.units.length];
          gx = u.x;
          gy = u.y;
        }
        genericObjs.push({
          id: `gen-obj-${i}`,
          text: this.doc.text[`obj.${i}`],
          completed: state === 2,
          current: state === 2 ? 1 : 0,
          total: 1,
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

    questList.append(mainItem, sideItem, relicItem, lieutenantItem, act2Item, act3Item, act4Item, completedItem);
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
          <div class="dossier-act">Side Mission · Frontier Recovery</div>
          <h1 class="dossier-title">Granary Supply Cache</h1>
          <div class="dossier-location">📍 Sunken Ford · Burned Mill & Grain Store</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">TACTICAL BRIEFING</div>
        <p class="dossier-narrative">During their initial assault across the river, Grok'tar's vanguard looted the watermill and stored emergency grain rations in sacks along the riverbank and around their camp. Recovering these supplies guarantees provisions for Thornwick throughout the bitter autumn.</p>
        <div class="dossier-section-heading">OBJECTIVE</div>
        <div class="dossier-objectives-list" id="side-dossier-objectives">
          <div class="dossier-obj-row ${granaryDone ? 'completed' : ''}">
            <span class="obj-checkbox">${granaryDone ? '✔' : '◻'}</span>
            <span class="obj-text">Gather Gold & Munitions from the Gnoll Encampment (Current: ${this.lastSim?.cb.gold[0] ?? 0} Gold)</span>
            <span class="obj-badge ${granaryDone ? 'done' : 'active'}">${granaryDone ? 'COMPLETED' : 'IN PROGRESS'}</span>
            ${!granaryDone ? '<button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>' : ''}
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+100 Bonus Gold</strong></div>
          <div class="reward-pill xp-reward">⚡ <strong>+150 XP</strong></div>
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
          <div class="dossier-act">Act I · Sacred Archeology</div>
          <h1 class="dossier-title">Ancestral Astral Relic</h1>
          <div class="dossier-location">📍 Sunken Riverbed Crypt · Forgotten Sarcophagus</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">HISTORICAL INTELLIGENCE</div>
        <p class="dossier-narrative">High Arcanist Vaelen recounts that three centuries ago, the First Wardens sealed an astral-infused silver amulet within a submerged riverbed crypt. The gnoll war-shaman senses its hum and searches the shallows. Sunder his excavators and secure the talisman for the realm.</p>
        <div class="dossier-section-heading">OPERATIONAL DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Infiltrate the Submerged Riverbed Crypt & Slay Crypt Guardians</span>
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
          <div class="dossier-act">Act I · Elite Bounty Contract</div>
          <h1 class="dossier-title">Assassinate Blood-Shaman Mor'drak</h1>
          <div class="dossier-location">📍 Northern Ridge Bluff · Corrupted Blood Altar</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">TACTICAL BRIEFING</div>
        <p class="dossier-narrative">Ford-Scout Bren has confirmed that Chieftain Grok'tar's second-in-command, Shaman Mor'drak, has established a foul sacrificial pyre upon the northern bluffs. From this shrine, dark blood-curses empower the river vanguard. Execute the shaman to shatter enemy morale.</p>
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
          <div class="reward-pill xp-reward">⚡ <strong>+450 XP</strong> Experience</div>
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
          <div class="dossier-act">Act II · Imperial Campaign Dossier</div>
          <h1 class="dossier-title">The Desiccated Marches</h1>
          <div class="dossier-location">📍 Redmarsh Frontier & Glass Waste Dunes</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">CAMPAIGN RECORD & THEATRE OF WAR</div>
        <p class="dossier-narrative">Beyond the drying silt of Redmarsh lie the blinding salt dunes of the Glass Wastes. Imperial caravans have been ambushed by dune scourges, and ancient stone obelisks pulse with corrupted elemental fire. Advance your detachment across the desert highway and reclaim the lost outposts.</p>
        <div class="dossier-section-heading">PRIMARY DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Force the Redmarsh Crossing & Cleanse Dune Scourge Outposts</span>
            <span class="obj-badge active">CAMPAIGN GOAL</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+600 Gold</strong></div>
          <div class="reward-pill xp-reward">⚡ <strong>+800 XP</strong></div>
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
          <div class="dossier-act">Act III · Subterranean Incursion</div>
          <h1 class="dossier-title">Catacombs of the Sunless Deeps</h1>
          <div class="dossier-location">📍 Sunless Abyss · Beneath the Iron Coast</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">TACTICAL INTELLIGENCE</div>
        <p class="dossier-narrative">The sun dies behind you as your company enters the chasms under the Iron Coast. In these flooded labyrinths, primordial abominations guard ironclad vaults. Reclaim the dwarven runestones and breach the subterranean causeway to the core.</p>
        <div class="dossier-section-heading">PRIMARY DIRECTIVES</div>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row">
            <span class="obj-checkbox">◻</span>
            <span class="obj-text">Sunder the Deep Runestone Chains & Slay the Brood Mother</span>
            <span class="obj-badge active">CAMPAIGN GOAL</span>
            <button type="button" class="dossier-nav-btn"><span class="nav-compass">🧭</span> Navigate</button>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+1200 Gold</strong></div>
          <div class="reward-pill xp-reward">⚡ <strong>+1600 XP</strong></div>
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
          <div class="dossier-act">Act IV · Apex Campaign Dossier</div>
          <h1 class="dossier-title">Gates of the Infernal Sanctuary</h1>
          <div class="dossier-location">📍 The Obsidian Caldera · Citadel of Ruin</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">FINAL RECORD OF THORNVAEL</div>
        <p class="dossier-narrative">The earth shudders as rivers of magma breach the surface. The final stronghold of the shadow lords stands behind colossal iron gates. March through the burning highway, shatter the Arch-Warden's defenses, and decide the ultimate fate of this world.</p>
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
          <div class="reward-pill gold-reward">💰 <strong>+3000 Gold</strong> Imperial Vault</div>
          <div class="reward-pill xp-reward">⚡ <strong>+4000 XP</strong> Mythic Apex</div>
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
    } else {
      rightPane.innerHTML = `
        <div class="dossier-header">
          <div class="dossier-act">Historical Record · Chapter Prologue</div>
          <h1 class="dossier-title">Muster at Thornwick</h1>
          <div class="dossier-location">📍 Thornwick Fortress Garrison</div>
        </div>
        <div class="dossier-divider">✦ ─── ❖ ─── ✦</div>
        <div class="dossier-section-heading">RECORDED ENTRY</div>
        <p class="dossier-narrative">Your company mustered in the courtyard of Thornwick Fortress. Warden Hale inspected your troops, issued frontier equipment, and pledged garrison support for the campaign ahead.</p>
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row completed">
            <span class="obj-checkbox">✔</span>
            <span class="obj-text">Assemble company of twelve and accept Warden Hale's commission</span>
            <span class="obj-badge done">COMPLETED</span>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+150 Gold</strong> Stipend</div>
          <div class="reward-pill xp-reward">⚡ <strong>+200 XP</strong> Veteran Experience</div>
          <div class="reward-pill renown-reward">🛡️ <strong>+15 Thornwick Favor</strong></div>
          <div class="reward-pill item-reward">🎁 <strong>Frontier Commission Badge</strong></div>
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
    return st.status === 1 ? this.t('win', S.victoryBody) : this.t(`fail.${st.cause}`, S.defeatBody);
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
  const links: [string, string][] = [
    [S.mission.free, './?free=1'],
    [S.mission.ford, './?mission=ford'],
    [S.mission.market, './?mission=market'],
    [S.mission.test, './?mission=test'],
    [S.mission.editor, './editor.html'],
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

/** Painted portrait (Gemini-generated, see assets.json) with the vector portrait as an offline fallback. */
function paintedPortrait(file: string, fallbackSvg: string): string {
  const fb = fallbackSvg.replace(/"/g, '&quot;').replace(/\s+/g, ' ');
  return `<img class="portrait-img" src="${import.meta.env.BASE_URL}townart/${file}.jpg" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML=this.dataset.fb" data-fb="${fb}">`;
}
