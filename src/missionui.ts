import type { MapDoc } from './mapdoc';
import { Kind } from './sim/combat';
import type { Sim } from './sim/sim';
import { S } from './strings';
import { blip, play } from './audio';

/** Host callbacks: the game owns the pause flag. */
export interface MissionHost {
  pause(on: boolean): void;
}

const OBJ_MARK = ['', '◻', '✔', '✖'];

export interface QuestObjective {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly current: number;
  readonly total: number;
  readonly optional?: boolean;
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
    this.goals.title = 'Click to toggle Quest Objectives [Q / O]';
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
    if (this.isObjectivesCollapsed) {
      this.goals.className = 'gothic-hud-tracker collapsed';
      const completed = quest.objectives.filter((o) => o.completed).length;
      this.goals.textContent = `📜 Задачи [Q] (${completed}/${quest.objectives.length})`;
    } else {
      this.goals.className = 'gothic-hud-tracker expanded';
      const lines: string[] = [];
      lines.push(`📜 ${quest.title} ▴`);
      for (const obj of quest.objectives) {
        const mark = obj.completed ? '✔' : '◻';
        const progress = obj.total > 1 ? ` (${obj.current}/${obj.total})` : '';
        lines.push(`${mark} ${obj.text}${progress}`);
      }
      lines.push('\n[ Клик: Свий | Двоен клик: Дневник ]');
      this.goals.textContent = lines.join('\n');
    }
  }

  /** Evaluates live quest progress directly from the simulation state */
  private evaluateQuestDossier(sim: Sim | null): QuestDossier {
    const st = sim?.script?.st;
    const isFordMap = this.doc.name.toLowerCase().includes('ford') || this.doc.name.toLowerCase().includes('blood');

    if (isFordMap) {
      // Build objectives from doc.text if present, ensuring live tracking from st.sub
      const customObjs: QuestObjective[] = [];
      if (st) {
        for (let i = 0; this.doc.text[`obj.${i}`] !== undefined; i++) {
          const text = this.doc.text[`obj.${i}`];
          const isCompleted = st.sub[i] === 2;
          const isOptional = text.toLowerCase().includes('recover') || text.toLowerCase().includes('purify') || text.toLowerCase().includes('optional');
          customObjs.push({
            id: `obj-${i}`,
            text: isOptional && !text.toLowerCase().includes('optional') ? `Optional: ${text}` : text,
            completed: isCompleted,
            current: isCompleted ? 1 : 0,
            total: 1,
            optional: isOptional,
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
        },
        {
          id: 'obj-ambush',
          text: 'Clear the River Ambush',
          completed: st ? st.sub[1] === 2 : false,
          current: (st && st.sub[1] === 2) ? 4 : (st && (st.sv[0] ?? 0) >= 1 ? 2 : 0),
          total: 4,
        },
        {
          id: 'obj-ridge',
          text: 'Infiltrate the High Ridge',
          completed: st ? (st.sub[2] === 2 || (st.sub[3] ?? 0) === 2) : false,
          current: (st && (st.sub[2] === 2 || (st.sub[3] ?? 0) === 2)) ? 1 : 0,
          total: 1,
        },
        {
          id: 'obj-chief',
          text: "Slay Chieftain Grok'tar",
          completed: sim ? (sim.cb.hp[12] <= 0 || (st?.sub[3] ?? 0) === 2) : false,
          current: (sim && (sim.cb.hp[12] <= 0 || (st?.sub[3] ?? 0) === 2)) ? 1 : 0,
          total: 1,
        },
        {
          id: 'obj-granary',
          text: 'Optional: Recover Granary Supply Cache',
          completed: sim ? (sim.cb.gold[0] >= 40 || (st?.sub[4] ?? 0) === 2) : false,
          current: (sim && (sim.cb.gold[0] >= 40 || (st?.sub[4] ?? 0) === 2)) ? 1 : 0,
          total: 1,
          optional: true,
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
        genericObjs.push({
          id: `gen-obj-${i}`,
          text: this.doc.text[`obj.${i}`],
          completed: state === 2,
          current: state === 2 ? 1 : 0,
          total: 1,
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

    // Quest Item 2: Side Quest
    const sideItem = document.createElement('div');
    sideItem.className = `journal-quest-card ${this.activeQuestId === 'side-granary' ? 'selected' : ''}`;
    sideItem.innerHTML = `
      <div class="quest-seal-icon">${getSilverWaxSealSvg()}</div>
      <div class="quest-card-meta">
        <div class="quest-card-title">Granary Supply Cache</div>
        <div class="quest-card-chapter">Side Expedition · Optional</div>
        <div class="quest-card-status">${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? 'Secured' : 'In Progress'}</div>
      </div>
    `;
    sideItem.onclick = () => {
      this.activeQuestId = 'side-granary';
      this.renderQuestJournal();
    };

    // Quest Item 3: Completed Prologue
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

    questList.append(mainItem, sideItem, completedItem);
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
          item.innerHTML = `
            <span class="obj-checkbox">${obj.completed ? '✔' : '◻'}</span>
            <span class="obj-text">${optTag}${obj.text} ${progressTag}</span>
            <span class="obj-badge ${obj.completed ? 'done' : 'active'}">${obj.completed ? 'COMPLETED' : 'IN PROGRESS'}</span>
          `;
          objContainer.append(item);
        }
      }
    } else if (this.activeQuestId === 'side-granary') {
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
        <div class="dossier-objectives-list">
          <div class="dossier-obj-row ${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? 'completed' : ''}">
            <span class="obj-checkbox">${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? '✔' : '◻'}</span>
            <span class="obj-text">Gather Gold & Munitions from the Gnoll Encampment (Current: ${this.lastSim?.cb.gold[0] ?? 0} Gold)</span>
            <span class="obj-badge ${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? 'done' : 'active'}">${(this.lastSim?.cb.gold[0] ?? 0) >= 40 ? 'COMPLETED' : 'IN PROGRESS'}</span>
          </div>
        </div>
        <div class="dossier-rewards-grid">
          <div class="reward-pill gold-reward">💰 <strong>+100 Bonus Gold</strong></div>
          <div class="reward-pill xp-reward">⚡ <strong>+150 XP</strong></div>
        </div>
      `;
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
