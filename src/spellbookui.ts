import { SPELLS, Tk } from './sim/spelldata';
import { teacherOf } from './sim/town';
import { getItemDef } from './sim/items';
import { scribeFee } from './sim/hero';
import type { Sim, Command } from './sim/sim';
import { S } from './strings';

export interface SpellbookUiOptions {
  sim: () => Sim;
  getSlots: () => readonly number[];
  setSlot: (slotIdx: number, spellId: number) => void;
  getActiveRmb: () => number | null;
  setActiveRmb: (spellId: number | null) => void;
  armSpell: (spellId: number) => void;
  queue: (cmd: Command) => void;
  toast: (msg: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface SpellMeta {
  readonly id: number;
  readonly name: string;
  readonly school: number; // 1: Fire, 2: Water, 3: Air, 4: Earth, 5: Astral
  readonly tier: 'I' | 'II' | 'III' | 'IV' | 'V';
  readonly tierLevel: number;
  readonly cost: number;
  readonly reach: number;
  readonly cd: number;
  readonly formula: string;
  readonly targetDesc: string;
  readonly lore: string;
  readonly scrollName: string;
  readonly mindReq: number;
  readonly scribeFee: number;
}

export interface SchoolInfo {
  readonly id: number;
  readonly name: string;
  readonly sphereName: string;
  readonly icon: string;
  readonly color: string;
  readonly glow: string;
  readonly tagLine: string;
  readonly quote: string;
}

export const SCHOOLS: readonly SchoolInfo[] = [
  {
    id: 1,
    name: 'Fire',
    sphereName: 'Pyromancy',
    icon: '🔥',
    color: '#e74c3c',
    glow: 'rgba(231, 76, 60, 0.75)',
    tagLine: 'Wrath of Cinders & Brimstone',
    quote: '"From ash we are summoned, and to incandescent fury we shall reduce all that opposes us."',
  },
  {
    id: 2,
    name: 'Water',
    sphereName: 'Cryomancy',
    icon: '❄️',
    color: '#3498db',
    glow: 'rgba(52, 152, 219, 0.75)',
    tagLine: 'Glacial Rime & Tides of Vitality',
    quote: '"Water gives life to the parched wanderer, yet freezeth the proudest warrior into silent marble."',
  },
  {
    id: 3,
    name: 'Air',
    sphereName: 'Aeromancy',
    icon: '⚡',
    color: '#f39c12',
    glow: 'rgba(243, 156, 18, 0.75)',
    tagLine: 'Heavenly Tempest & Shocking Static',
    quote: '"Swift as the summer gale, merciless as the lightning bolt that cleaveth the mountain peaks."',
  },
  {
    id: 4,
    name: 'Earth',
    sphereName: 'Geomancy',
    icon: '🌿',
    color: '#27ae60',
    glow: 'rgba(39, 174, 96, 0.75)',
    tagLine: 'Bedrock Transmutation & Choking Spores',
    quote: '"The bedrock endures all. Bones will break and blades shall shatter upon our enduring mantle."',
  },
  {
    id: 5,
    name: 'Astral',
    sphereName: 'Mysticism',
    icon: '✨',
    color: '#9b59b6',
    glow: 'rgba(155, 89, 182, 0.75)',
    tagLine: 'Esoteric Leylines & Soul Transcendence',
    quote: '"Beyond mortal flesh lies the woven fabric of souls, where time bendeth and spirits obey."',
  },
];

export const SPELL_DATABASE: Record<number, SpellMeta> = {
  // --- School 1: Fire ---
  0: {
    id: 0,
    name: 'Fire Bolt',
    school: 1,
    tier: 'I',
    tierLevel: 1,
    cost: 8,
    reach: 7,
    cd: 30,
    formula: '16 – 24 Fire Damage',
    targetDesc: 'Single Enemy',
    lore: 'A searing dart of concentrated elemental flame forged in the heart of cinder. Swift, lethal, and the foundational incantation of all aspiring pyromancers.',
    scrollName: 'Scroll of Fire Bolt',
    mindReq: 4,
    scribeFee: 45,
  },
  1: {
    id: 1,
    name: 'Fireball',
    school: 1,
    tier: 'II',
    tierLevel: 2,
    cost: 14,
    reach: 8,
    cd: 40,
    formula: '18 – 28 Fire Damage in 2.0-tile explosion',
    targetDesc: 'Ground Point / Area Blast',
    lore: 'An explosive sphere of rolling fire that detonates violently upon impact. Decimates closely packed ranks and scorches the soil to smoking slag.',
    scrollName: 'Scroll of Fireball',
    mindReq: 6,
    scribeFee: 60,
  },
  2: {
    id: 2,
    name: 'Flame Burst',
    school: 1,
    tier: 'II',
    tierLevel: 2,
    cost: 12,
    reach: 7,
    cd: 35,
    formula: '12 – 18 Fire Damage (Strikes up to 3 foes in 3.5 tiles)',
    targetDesc: 'Multi-Target Enemy',
    lore: 'A fan of ravenous sparks leaps from outstretched fingertips, seeking multiple adversaries to incinerate their vanguard in simultaneous flashes.',
    scrollName: 'Scroll of Flame Burst',
    mindReq: 5,
    scribeFee: 45,
  },
  3: {
    id: 3,
    name: 'Ignite',
    school: 1,
    tier: 'I',
    tierLevel: 1,
    cost: 8,
    reach: 6,
    cd: 30,
    formula: 'Burns target for 2 dmg/s over 6 seconds (12 Total Dmg)',
    targetDesc: 'Single Enemy',
    lore: 'Sets the victim’s garments and flesh ablaze with stubborn magical flames that refuse to be quenched, continuously eroding enemy vitality.',
    scrollName: 'Scroll of Ignite',
    mindReq: 4,
    scribeFee: 45,
  },
  25: {
    id: 25,
    name: 'Inferno',
    school: 1,
    tier: 'III',
    tierLevel: 3,
    cost: 20,
    reach: 7,
    cd: 45,
    formula: '22 – 34 Fire Damage (Strikes up to 5 foes in 4.0 tiles)',
    targetDesc: 'Multi-Target Enemy',
    lore: 'A tempest of roaring firestorms unleashed across enemy battle lines. Searing heat consumes armor and shield alike, leaving behind only smoldering ash.',
    scrollName: 'Scroll of Inferno',
    mindReq: 8,
    scribeFee: 60,
  },
  24: {
    id: 24,
    name: 'Meteor',
    school: 1,
    tier: 'V',
    tierLevel: 5,
    cost: 26,
    reach: 8,
    cd: 70,
    formula: '32 – 48 Fire Damage + Burn (4 dmg/s for 8s) in 3.0 tiles',
    targetDesc: 'Ground Point / Cataclysm Area',
    lore: 'Pulls a cataclysmic molten star from the astral depths. The earth shatters upon arrival, obliterating hostile troops and reducing battlements to cinder.',
    scrollName: 'Tome of Meteor',
    mindReq: 14,
    scribeFee: 75,
  },

  // --- School 2: Water ---
  4: {
    id: 4,
    name: 'Frost Bolt',
    school: 2,
    tier: 'I',
    tierLevel: 1,
    cost: 8,
    reach: 7,
    cd: 30,
    formula: '12 – 18 Cold Damage + Slows target for 8s',
    targetDesc: 'Single Enemy',
    lore: 'A razor-sharp lance of glacial rime that chills the enemy’s blood, turning muscle to brittle frost and drastically slowing their movement and attacks.',
    scrollName: 'Scroll of Frost Bolt',
    mindReq: 4,
    scribeFee: 45,
  },
  5: {
    id: 5,
    name: 'Ice Storm',
    school: 2,
    tier: 'II',
    tierLevel: 2,
    cost: 16,
    reach: 8,
    cd: 45,
    formula: '10 – 16 Cold Damage + Slows for 6s in 2.5-tile area',
    targetDesc: 'Ground Point / Area Blast',
    lore: 'Summons a localized deluge of jagged hailstones that lacerate armor while covering the earth in treacherous frost, encumbering all within.',
    scrollName: 'Tome of Ice Storm',
    mindReq: 9,
    scribeFee: 60,
  },
  6: {
    id: 6,
    name: 'Chain Frost',
    school: 2,
    tier: 'II',
    tierLevel: 2,
    cost: 14,
    reach: 7,
    cd: 40,
    formula: '9 – 14 Cold Damage + Slow for 4s (Bounces to 4 foes)',
    targetDesc: 'Multi-Target Enemy',
    lore: 'A bouncing orb of sub-zero frost that ricochets between adversaries, freezing armor joints and deadening combat reflexes.',
    scrollName: 'Scroll of Chain Frost',
    mindReq: 6,
    scribeFee: 60,
  },
  7: {
    id: 7,
    name: 'Healing',
    school: 2,
    tier: 'I',
    tierLevel: 1,
    cost: 10,
    reach: 7,
    cd: 30,
    formula: 'Restores 30 – 45 Hit Points to friendly target',
    targetDesc: 'Living Ally',
    lore: 'Channels the pure restorative waters of life, rapidly knitting torn flesh, mending fractures, and soothing trauma on the battlefield.',
    scrollName: 'Scroll of Healing',
    mindReq: 5,
    scribeFee: 45,
  },
  8: {
    id: 8,
    name: 'Healing Rain',
    school: 2,
    tier: 'III',
    tierLevel: 3,
    cost: 18,
    reach: 8,
    cd: 50,
    formula: 'Restores 14 – 22 Hit Points to all allies in 3.0 tiles',
    targetDesc: 'Ground Point / Area of Rejuvenation',
    lore: 'A miraculous mist falls over the chosen ground, rejuvenating weary companions and shielding wounded soldiers from death.',
    scrollName: 'Tome of Healing Rain',
    mindReq: 9,
    scribeFee: 60,
  },
  26: {
    id: 26,
    name: 'Blizzard',
    school: 2,
    tier: 'V',
    tierLevel: 5,
    cost: 24,
    reach: 8,
    cd: 65,
    formula: '20 – 30 Cold Damage + Severe Slow for 10s in 3.5 tiles',
    targetDesc: 'Ground Point / Arctic Vortex',
    lore: 'The ultimate expression of cryomancy. Conjures an Arctic gale of howling vortexes that freezes opposing battalions solid where they stand.',
    scrollName: 'Tome of Blizzard',
    mindReq: 13,
    scribeFee: 75,
  },

  // --- School 3: Air ---
  9: {
    id: 9,
    name: 'Lightning',
    school: 3,
    tier: 'I',
    tierLevel: 1,
    cost: 12,
    reach: 8,
    cd: 35,
    formula: '24 – 34 Shock Damage',
    targetDesc: 'Single Enemy',
    lore: 'A sudden, deafening bolt of atmospheric electricity that pierces armor instantaneously and leaves nothing to chance.',
    scrollName: 'Scroll of Lightning',
    mindReq: 5,
    scribeFee: 45,
  },
  10: {
    id: 10,
    name: 'Chain Lightning',
    school: 3,
    tier: 'II',
    tierLevel: 2,
    cost: 16,
    reach: 7,
    cd: 40,
    formula: '14 – 22 Shock Damage (Arcs across 4 enemies in 3.5 tiles)',
    targetDesc: 'Multi-Target Enemy',
    lore: 'Arcing lightning strikes the primary victim and branches violently into adjacent foes, frying iron plate and shields alike in blinding snaps.',
    scrollName: 'Tome of Chain Lightning',
    mindReq: 9,
    scribeFee: 60,
  },
  11: {
    id: 11,
    name: 'Haste',
    school: 3,
    tier: 'II',
    tierLevel: 2,
    cost: 12,
    reach: 7,
    cd: 30,
    formula: 'Increases Movement and Attack Speed for 25s',
    targetDesc: 'Living Ally',
    lore: 'Infuses the subject’s limbs with furious zephyrs, allowing them to sprint and strike with dizzying supernatural haste.',
    scrollName: 'Scroll of Haste',
    mindReq: 5,
    scribeFee: 45,
  },
  12: {
    id: 12,
    name: 'Gale',
    school: 3,
    tier: 'I',
    tierLevel: 1,
    cost: 12,
    reach: 8,
    cd: 40,
    formula: '8 – 12 Impact Damage + Slow for 5s in 3.0 tiles',
    targetDesc: 'Ground Point / Vortex Area',
    lore: 'A violent updraft of swirling wind buffets advancing lines, knocking missile trajectories off course and disorienting enemy marchers.',
    scrollName: 'Scroll of Gale',
    mindReq: 5,
    scribeFee: 45,
  },
  13: {
    id: 13,
    name: 'Wind Ward',
    school: 3,
    tier: 'I',
    tierLevel: 1,
    cost: 8,
    reach: 0,
    cd: 30,
    formula: 'Protective Air Barrier absorbing 35 Damage for 45s',
    targetDesc: 'Self (Caster)',
    lore: 'Forms a turbulent atmospheric sheath around the caster, deflecting incoming arrows, thrown javelins, and melee thrusts.',
    scrollName: 'Scroll of Wind Ward',
    mindReq: 4,
    scribeFee: 45,
  },
  27: {
    id: 27,
    name: 'Thunderstorm',
    school: 3,
    tier: 'V',
    tierLevel: 5,
    cost: 22,
    reach: 8,
    cd: 50,
    formula: '26 – 38 Shock Damage (Strikes 4 foes in 4.0 tiles)',
    targetDesc: 'Multi-Target Enemy',
    lore: 'Rips open the clouds, raining down a barrage of thunderous lightning strikes that vaporizes armored ranks in blinding flashes.',
    scrollName: 'Tome of Thunderstorm',
    mindReq: 12,
    scribeFee: 75,
  },

  // --- School 4: Earth ---
  14: {
    id: 14,
    name: 'Rock Throw',
    school: 4,
    tier: 'I',
    tierLevel: 1,
    cost: 9,
    reach: 7,
    cd: 32,
    formula: '18 – 26 Blunt Physical / Earth Damage',
    targetDesc: 'Single Enemy',
    lore: 'Hurls a boulder torn straight from foundation bedrock. Heavy, devastating, and pierces elemental spell wards without hindrance.',
    scrollName: 'Scroll of Rock Throw',
    mindReq: 4,
    scribeFee: 45,
  },
  16: {
    id: 16,
    name: 'Stone Skin',
    school: 4,
    tier: 'I',
    tierLevel: 1,
    cost: 10,
    reach: 7,
    cd: 30,
    formula: 'Absorbs 50 Damage for 45 seconds',
    targetDesc: 'Living Ally',
    lore: 'Transmutes flesh and garments into flexible granite, soaking heavy blows without restricting movement or balance.',
    scrollName: 'Scroll of Stone Skin',
    mindReq: 5,
    scribeFee: 45,
  },
  15: {
    id: 15,
    name: 'Stone Curse',
    school: 4,
    tier: 'II',
    tierLevel: 2,
    cost: 16,
    reach: 6,
    cd: 40,
    formula: 'Petrifies target into solid stone for 5s (Complete Stun)',
    targetDesc: 'Single Enemy',
    lore: 'An ancient petrification hex. Turns the victim’s limbs to inanimate gray marble, rendering them completely helpless.',
    scrollName: 'Tome of Stone Curse',
    mindReq: 9,
    scribeFee: 60,
  },
  17: {
    id: 17,
    name: 'Poison Cloud',
    school: 4,
    tier: 'II',
    tierLevel: 2,
    cost: 12,
    reach: 8,
    cd: 40,
    formula: 'Applies Poison Stacks for 12s in 2.5 tiles',
    targetDesc: 'Ground Point / Miasma Area',
    lore: 'Vomits forth noxious subterranean miasma that chokes breathing troops and rots organic matter relentlessly over time.',
    scrollName: 'Scroll of Poison Cloud',
    mindReq: 5,
    scribeFee: 45,
  },
  28: {
    id: 28,
    name: 'Iron Skin',
    school: 4,
    tier: 'III',
    tierLevel: 3,
    cost: 18,
    reach: 0,
    cd: 60,
    formula: 'Absorbs 100 Damage for 60 seconds',
    targetDesc: 'Self (Caster)',
    lore: 'Hardens the caster into living tempered black iron, repelling the fiercest monster fangs, broadheads, and greatsword blows.',
    scrollName: 'Scroll of Iron Skin',
    mindReq: 9,
    scribeFee: 60,
  },
  29: {
    id: 29,
    name: 'Acid Rain',
    school: 4,
    tier: 'III',
    tierLevel: 3,
    cost: 20,
    reach: 8,
    cd: 55,
    formula: '14 – 20 Acid Damage + Heavy Poison for 16s in 3.5 tiles',
    targetDesc: 'Ground Point / Acid Deluge',
    lore: 'Corrosive emerald bile falls from darkened skies, eating through steel breastplates and searing the flesh of whole legions.',
    scrollName: 'Scroll of Acid Rain',
    mindReq: 8,
    scribeFee: 60,
  },
  18: {
    id: 18,
    name: 'Quake',
    school: 4,
    tier: 'IV',
    tierLevel: 4,
    cost: 22,
    reach: 7,
    cd: 60,
    formula: '20 – 30 Shockwave Damage in 3.5 tiles',
    targetDesc: 'Ground Point / Seismic Shock',
    lore: 'Commands tectonic faultlines to buckle and rupture. Fractures the earth beneath hostile battlements, toppling heavy units to the ground.',
    scrollName: 'Tome of Quake',
    mindReq: 11,
    scribeFee: 75,
  },

  // --- School 5: Astral ---
  19: {
    id: 19,
    name: 'Blessing',
    school: 5,
    tier: 'I',
    tierLevel: 1,
    cost: 10,
    reach: 7,
    cd: 30,
    formula: 'Grants +25% Attack & Defence for 60s',
    targetDesc: 'Living Ally',
    lore: 'Invokes celestial providence upon a champion. Weapons strike true and courage remains steadfast against dark abominations.',
    scrollName: 'Scroll of Blessing',
    mindReq: 5,
    scribeFee: 45,
  },
  20: {
    id: 20,
    name: 'Weaken',
    school: 5,
    tier: 'I',
    tierLevel: 1,
    cost: 8,
    reach: 7,
    cd: 30,
    formula: 'Reduces Enemy Weapon Damage by -30% for 30s',
    targetDesc: 'Single Enemy',
    lore: 'Saps the vitality and sinew of the adversary, causing their weapons to feel impossibly heavy and their defensive guard to falter.',
    scrollName: 'Scroll of Weaken',
    mindReq: 4,
    scribeFee: 45,
  },
  23: {
    id: 23,
    name: 'Meditation',
    school: 5,
    tier: 'I',
    tierLevel: 1,
    cost: 0,
    reach: 0,
    cd: 250,
    formula: 'Restores 12 Mana Points instantly',
    targetDesc: 'Self (Caster)',
    lore: 'The sorcerer turns their gaze inward, attuning spirit to the ambient leylines to channel pure mana back into their reservoir.',
    scrollName: 'Scroll of Meditation',
    mindReq: 3,
    scribeFee: 30,
  },
  22: {
    id: 22,
    name: 'Corpse Burst',
    school: 5,
    tier: 'II',
    tierLevel: 2,
    cost: 14,
    reach: 7,
    cd: 50,
    formula: '18 – 26 Astral Explosion Damage in 2.5 tiles',
    targetDesc: 'Fallen Corpse',
    lore: 'Overcharges a fallen corpse with unstable necromantic pressure until it erupts in a gory blast of astral shrapnel.',
    scrollName: 'Scroll of Corpse Burst',
    mindReq: 6,
    scribeFee: 60,
  },
  30: {
    id: 30,
    name: 'Mana Burn',
    school: 5,
    tier: 'III',
    tierLevel: 3,
    cost: 15,
    reach: 7,
    cd: 40,
    formula: '25 – 40 Pure Astral Damage',
    targetDesc: 'Single Enemy',
    lore: 'Ignites the latent ether inside the victim’s soul, causing their own spiritual reserves to incinerate their internal organs.',
    scrollName: 'Scroll of Mana Burn',
    mindReq: 9,
    scribeFee: 60,
  },
  21: {
    id: 21,
    name: 'Resurrect',
    school: 5,
    tier: 'V',
    tierLevel: 5,
    cost: 30,
    reach: 6,
    cd: 75,
    formula: 'Restores fallen ally back to life',
    targetDesc: 'Fallen Ally Corpse',
    lore: 'Reaches across the veil of the Netherworld to drag an ally’s departing soul back into their mortal vessel.',
    scrollName: 'Tome of Resurrect',
    mindReq: 13,
    scribeFee: 75,
  },
  31: {
    id: 31,
    name: 'Time Warp',
    school: 5,
    tier: 'V',
    tierLevel: 5,
    cost: 25,
    reach: 0,
    cd: 80,
    formula: 'Supreme Temporal Acceleration for 40s',
    targetDesc: 'Self (Caster)',
    lore: 'Bends the very fabric of time around the archmage. To outside eyes, the caster flickers and acts with the swiftness of thought.',
    scrollName: 'Tome of Time Warp',
    mindReq: 15,
    scribeFee: 75,
  },
};

export class SpellbookUi {
  private readonly opt: SpellbookUiOptions;
  private root: HTMLElement;
  private selectedSchool = 1;
  private selectedSpellId = 0;
  private activePage: 'left' | 'right' = 'left';
  private slotAssign = -1;

  constructor(opt: SpellbookUiOptions) {
    this.opt = opt;
    let el = document.getElementById('spellbook-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spellbook-modal';
      el.className = 'spellbook-modal';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Gothic Spellbook');
      el.hidden = true;
      document.body.append(el);
    }
    this.root = el;
    this.buildSkeleton();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(options?: { assignSlot?: number; initialSpellId?: number; initialSchool?: number }): void {
    if (options?.assignSlot !== undefined) {
      this.slotAssign = options.assignSlot;
    }
    if (options?.initialSpellId !== undefined && SPELL_DATABASE[options.initialSpellId]) {
      this.selectedSpellId = options.initialSpellId;
      this.selectedSchool = SPELL_DATABASE[options.initialSpellId].school;
    } else if (options?.initialSchool !== undefined && options.initialSchool >= 1 && options.initialSchool <= 5) {
      this.selectedSchool = options.initialSchool;
      const first = this.getSchoolSpells(this.selectedSchool)[0];
      if (first) this.selectedSpellId = first.id;
    }

    this.root.hidden = false;
    this.opt.onOpen?.();
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.slotAssign = -1;
    this.opt.onClose?.();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private isSpellKnown(sid: number): boolean {
    const sim = this.opt.sim();
    const heroId = sim.hero?.id ?? 0;
    return ((sim.cb.known[heroId] >>> sid) & 1) === 1;
  }

  private getHeroMind(): number {
    const sim = this.opt.sim();
    if (!sim.hero) return 10;
    // totals(h)[Attr.Mind] = attr[Mind] + equipped bonuses
    return sim.hero.attr[2] ?? 10;
  }

  private getHeroGold(): number {
    return this.opt.sim().cb.gold[0] ?? 0;
  }

  private hasScrollInInventory(sid: number): number | null {
    const sim = this.opt.sim();
    if (!sim.hero) return null;
    const teacherId = teacherOf(sid);
    if (teacherId < 0) return null;
    const stack = sim.hero.inv.find((s) => s.item === teacherId && s.n > 0);
    return stack ? teacherId : null;
  }

  private getSchoolSpells(schoolId: number): SpellMeta[] {
    const spells = Object.values(SPELL_DATABASE).filter((s) => s.school === schoolId);
    return spells.sort((a, b) => a.tierLevel - b.tierLevel || a.cost - b.cost);
  }

  private buildSkeleton(): void {
    this.root.replaceChildren();

    const backdrop = document.createElement('div');
    backdrop.className = 'spellbook-backdrop';
    backdrop.onclick = () => this.close();

    const grimoire = document.createElement('div');
    grimoire.className = 'spellbook-grimoire';

    // Metal corner studs and clasps
    const claspL = document.createElement('div');
    claspL.className = 'grimoire-clasp left';
    const claspR = document.createElement('div');
    claspR.className = 'grimoire-clasp right';
    const ribbon = document.createElement('div');
    ribbon.className = 'grimoire-ribbon';

    // Top Header
    const header = document.createElement('div');
    header.className = 'grimoire-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'grimoire-title';
    titleBox.innerHTML = `
      <span class="grimoire-crest">🕮</span>
      <div class="grimoire-title-text">
        <span class="grimoire-heading">Grimoire of Thornvael</span>
        <span class="grimoire-subheading">Arcane Codex & Spell Trees of the 5 Magic Spheres</span>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'grimoire-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close Grimoire [S, Esc]';
    closeBtn.onclick = () => this.close();

    header.append(titleBox, closeBtn);

    // Mobile tabs switcher (for small screens)
    const mobTabs = document.createElement('div');
    mobTabs.className = 'grimoire-mobile-tabs';

    const tabIndex = document.createElement('button');
    tabIndex.className = 'mob-tab-btn active';
    tabIndex.dataset.page = 'left';
    tabIndex.textContent = '🕮 Spheres & Spells';
    tabIndex.onclick = () => {
      this.activePage = 'left';
      tabIndex.classList.add('active');
      tabDossier.classList.remove('active');
      this.updateMobileView();
    };

    const tabDossier = document.createElement('button');
    tabDossier.className = 'mob-tab-btn';
    tabDossier.dataset.page = 'right';
    tabDossier.textContent = '📜 Spell Dossier';
    tabDossier.onclick = () => {
      this.activePage = 'right';
      tabDossier.classList.add('active');
      tabIndex.classList.remove('active');
      this.updateMobileView();
    };

    mobTabs.append(tabIndex, tabDossier);

    // Two-page container
    const body = document.createElement('div');
    body.className = 'grimoire-body';

    const leftPage = document.createElement('div');
    leftPage.className = 'grimoire-page left-page';
    leftPage.id = 'grimoire-left-page';

    const spine = document.createElement('div');
    spine.className = 'grimoire-spine-divider';

    const rightPage = document.createElement('div');
    rightPage.className = 'grimoire-page right-page';
    rightPage.id = 'grimoire-right-page';

    body.append(leftPage, spine, rightPage);
    grimoire.append(claspL, claspR, ribbon, header, mobTabs, body);
    this.root.append(backdrop, grimoire);
  }

  private updateMobileView(): void {
    const left = this.root.querySelector('#grimoire-left-page');
    const right = this.root.querySelector('#grimoire-right-page');
    if (!left || !right) return;

    if (this.activePage === 'left') {
      left.classList.remove('mob-hidden');
      right.classList.add('mob-hidden');
    } else {
      left.classList.add('mob-hidden');
      right.classList.remove('mob-hidden');
    }
  }

  private render(): void {
    this.renderLeftPage();
    this.renderRightPage();
    this.updateMobileView();
  }

  private renderLeftPage(): void {
    const page = this.root.querySelector('#grimoire-left-page');
    if (!page) return;
    page.replaceChildren();

    // 1. Sphere Navigation Tabs (5 Schools)
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'sphere-tabs-container';

    SCHOOLS.forEach((sc) => {
      const tab = document.createElement('button');
      tab.className = `sphere-tab-btn ${this.selectedSchool === sc.id ? 'active' : ''}`;
      tab.style.setProperty('--school-color', sc.color);
      tab.style.setProperty('--school-glow', sc.glow);

      const count = this.getSchoolSpells(sc.id).length;
      const knownCount = this.getSchoolSpells(sc.id).filter((s) => this.isSpellKnown(s.id)).length;

      tab.innerHTML = `
        <span class="sphere-tab-icon">${sc.icon}</span>
        <div class="sphere-tab-meta">
          <span class="sphere-tab-name">${sc.sphereName}</span>
          <span class="sphere-tab-count">${knownCount}/${count} Mastered</span>
        </div>
      `;

      tab.onclick = () => {
        this.selectedSchool = sc.id;
        const schoolSpells = this.getSchoolSpells(sc.id);
        if (schoolSpells.length > 0 && !schoolSpells.some((s) => s.id === this.selectedSpellId)) {
          this.selectedSpellId = schoolSpells[0].id;
        }
        this.render();
      };

      tabsContainer.append(tab);
    });

    page.append(tabsContainer);

    // 2. School Intro Banner
    const currentSchool = SCHOOLS.find((s) => s.id === this.selectedSchool) ?? SCHOOLS[0];
    const introBanner = document.createElement('div');
    introBanner.className = 'sphere-intro-banner';
    introBanner.style.borderColor = currentSchool.color;

    const bannerHeader = document.createElement('div');
    bannerHeader.className = 'sphere-banner-header';

    const bannerIcon = document.createElement('span');
    bannerIcon.className = 'sphere-banner-icon';
    bannerIcon.textContent = currentSchool.icon;

    const bannerTextGroup = document.createElement('div');
    const bannerTitle = document.createElement('h3');
    bannerTitle.className = 'sphere-banner-title';
    bannerTitle.style.color = currentSchool.color;
    bannerTitle.textContent = `Sphere of ${currentSchool.sphereName} (${currentSchool.name})`;

    const bannerTag = document.createElement('div');
    bannerTag.className = 'sphere-banner-tag';
    bannerTag.textContent = currentSchool.tagLine;

    bannerTextGroup.append(bannerTitle, bannerTag);
    bannerHeader.append(bannerIcon, bannerTextGroup);

    const bannerQuote = document.createElement('p');
    bannerQuote.className = 'sphere-banner-quote';
    bannerQuote.textContent = currentSchool.quote;

    introBanner.append(bannerHeader, bannerQuote);
    page.append(introBanner);

    // 3. Spell Tree grouped by Tier
    const treeContainer = document.createElement('div');
    treeContainer.className = 'spell-tree-container';

    const schoolSpells = this.getSchoolSpells(this.selectedSchool);
    const tiers: Array<{ tierName: string; roman: string; level: number }> = [
      { tierName: 'Initiate Rites', roman: 'I', level: 1 },
      { tierName: 'Adept Arcana', roman: 'II', level: 2 },
      { tierName: 'Mage Invocations', roman: 'III', level: 3 },
      { tierName: 'Master Sorcery', roman: 'IV', level: 4 },
      { tierName: 'Archmage Cataclysms', roman: 'V', level: 5 },
    ];

    tiers.forEach((t) => {
      const inTier = schoolSpells.filter((s) => s.tierLevel === t.level);
      if (inTier.length === 0) return;

      const tierHeader = document.createElement('div');
      tierHeader.className = 'spell-tier-header';
      tierHeader.innerHTML = `
        <span class="tier-badge">Tier ${t.roman}</span>
        <span class="tier-label">${t.tierName}</span>
      `;
      treeContainer.append(tierHeader);

      const tierGrid = document.createElement('div');
      tierGrid.className = 'spell-tree-grid';

      inTier.forEach((sp) => {
        const isKnown = this.isSpellKnown(sp.id);
        const isSelected = this.selectedSpellId === sp.id;
        const activeRmb = this.opt.getActiveRmb() === sp.id;
        const boundSlots: number[] = [];
        this.opt.getSlots().forEach((sid, idx) => {
          if (sid === sp.id) boundSlots.push(idx);
        });

        const card = document.createElement('div');
        card.className = `spell-tree-node ${isKnown ? 'known' : 'locked'} ${isSelected ? 'selected' : ''}`;
        card.style.setProperty('--node-school-color', currentSchool.color);
        card.style.setProperty('--node-school-glow', currentSchool.glow);

        let statusBadge = isKnown ? `<span class="node-status-known">✦ Ready</span>` : `<span class="node-status-locked">🔒 Locked</span>`;

        let keyBadges = '';
        if (activeRmb) {
          keyBadges += `<span class="node-key-badge rmb" title="Active Right-Click Spell">RMB</span>`;
        }
        boundSlots.forEach((slotIdx) => {
          keyBadges += `<span class="node-key-badge fkey" title="Quickbar Slot F${slotIdx + 1}">F${slotIdx + 1}</span>`;
        });

        card.innerHTML = `
          <div class="node-icon-frame">
            <span class="node-rune">${currentSchool.icon}</span>
          </div>
          <div class="node-body">
            <div class="node-top-row">
              <span class="node-name">${sp.name}</span>
              <span class="node-cost">${sp.cost} MP</span>
            </div>
            <div class="node-sub-row">
              <span class="node-target">${sp.targetDesc}</span>
              ${statusBadge}
            </div>
            ${keyBadges ? `<div class="node-badges-row">${keyBadges}</div>` : ''}
          </div>
        `;

        card.onclick = () => {
          this.selectedSpellId = sp.id;
          if (this.slotAssign >= 0 && isKnown) {
            this.opt.setSlot(this.slotAssign, sp.id);
            this.opt.toast(`Assigned ${sp.name} to Quickbar [F${this.slotAssign + 1}]`);
            this.slotAssign = -1;
          }
          this.render();
          // On mobile, automatically show the dossier page
          if (window.innerWidth < 720) {
            this.activePage = 'right';
            const tabDossier = this.root.querySelector('.mob-tab-btn[data-page="right"]');
            const tabIndex = this.root.querySelector('.mob-tab-btn[data-page="left"]');
            tabDossier?.classList.add('active');
            tabIndex?.classList.remove('active');
            this.updateMobileView();
          }
        };

        tierGrid.append(card);
      });

      treeContainer.append(tierGrid);
    });

    page.append(treeContainer);

    // 4. Quickbar Slot Bindings strip
    const slots = this.opt.getSlots();
    const quickbarSection = document.createElement('div');
    quickbarSection.className = 'grimoire-quickbar-section';

    const qTitle = document.createElement('div');
    qTitle.className = 'quickbar-strip-title';
    qTitle.innerHTML = `
      <span>Quickbar Slots [F1 - F8]:</span>
      <small>${this.slotAssign >= 0 ? `👉 Click a known spell to bind to F${this.slotAssign + 1}` : 'Tap a slot to assign or clear'}</small>
    `;
    quickbarSection.append(qTitle);

    const qGrid = document.createElement('div');
    qGrid.className = 'quickbar-strip-grid';

    for (let i = 0; i < Math.min(8, slots.length); i++) {
      const sid = slots[i];
      const slotBtn = document.createElement('button');
      slotBtn.className = `quickbar-strip-btn ${this.slotAssign === i ? 'assigning' : ''} ${sid >= 0 ? 'filled' : 'empty'}`;

      let label = '-';
      if (sid >= 100) {
        label = getItemDef(sid - 100)?.name ?? 'Item';
      } else if (sid >= 0 && sid < SPELLS.length) {
        label = SPELLS[sid].name;
      }

      slotBtn.innerHTML = `
        <span class="slot-key">F${i + 1}</span>
        <span class="slot-val">${label}</span>
      `;

      slotBtn.onclick = () => {
        if (this.slotAssign === i) {
          this.slotAssign = -1;
        } else {
          this.slotAssign = i;
          // If a known spell is currently selected, prompt or assign directly
          const sp = SPELL_DATABASE[this.selectedSpellId];
          if (sp && this.isSpellKnown(sp.id)) {
            this.opt.setSlot(i, sp.id);
            this.opt.toast(`Assigned ${sp.name} to Quickbar [F${i + 1}]`);
            this.slotAssign = -1;
          }
        }
        this.render();
      };

      qGrid.append(slotBtn);
    }

    quickbarSection.append(qGrid);
    page.append(quickbarSection);
  }

  private renderRightPage(): void {
    const page = this.root.querySelector('#grimoire-right-page');
    if (!page) return;
    page.replaceChildren();

    const spell = SPELL_DATABASE[this.selectedSpellId] ?? SPELL_DATABASE[0];
    const school = SCHOOLS.find((s) => s.id === spell.school) ?? SCHOOLS[0];
    const isKnown = this.isSpellKnown(spell.id);
    const heroMind = this.getHeroMind();
    const heroGold = this.getHeroGold();
    const scrollInInventory = this.hasScrollInInventory(spell.id);
    const isActiveRmb = this.opt.getActiveRmb() === spell.id;

    // Dossier Header
    const dossierHeader = document.createElement('div');
    dossierHeader.className = 'dossier-header';
    dossierHeader.style.setProperty('--dossier-glow', school.glow);

    const crest = document.createElement('div');
    crest.className = `dossier-crest ${isKnown ? 'crest-known' : 'crest-locked'}`;
    crest.style.borderColor = school.color;
    crest.innerHTML = `<span class="crest-icon">${school.icon}</span>`;

    const titleGroup = document.createElement('div');
    titleGroup.className = 'dossier-title-group';

    const badgesRow = document.createElement('div');
    badgesRow.className = 'dossier-badges-row';
    badgesRow.innerHTML = `
      <span class="dossier-school-badge" style="background:${school.color}22; border-color:${school.color}; color:${school.color};">
        ${school.icon} ${school.sphereName}
      </span>
      <span class="dossier-tier-badge">Tier ${spell.tier}</span>
      <span class="dossier-req-badge ${heroMind >= spell.mindReq ? 'req-met' : 'req-unmet'}">
        Mind Req: ${spell.mindReq} ${heroMind >= spell.mindReq ? '✓' : `(You have ${heroMind})`}
      </span>
    `;

    const spellHeading = document.createElement('h2');
    spellHeading.className = 'dossier-spell-heading';
    spellHeading.textContent = spell.name;

    titleGroup.append(badgesRow, spellHeading);
    dossierHeader.append(crest, titleGroup);
    page.append(dossierHeader);

    // Specifications Grid
    const specsGrid = document.createElement('div');
    specsGrid.className = 'dossier-specs-grid';
    const cdSec = (spell.cd / 20).toFixed(1);
    specsGrid.innerHTML = `
      <div class="spec-card">
        <span class="spec-label">Mana Cost</span>
        <span class="spec-value mana-cost">🔷 ${spell.cost} MP</span>
      </div>
      <div class="spec-card">
        <span class="spec-label">Casting Range</span>
        <span class="spec-value">${spell.reach > 0 ? `${spell.reach} Tiles` : 'Self (0)'}</span>
      </div>
      <div class="spec-card">
        <span class="spec-label">Incantation Cooldown</span>
        <span class="spec-value">⏳ ${cdSec}s</span>
      </div>
      <div class="spec-card">
        <span class="spec-label">Targeting Mode</span>
        <span class="spec-value">${spell.targetDesc}</span>
      </div>
    `;
    page.append(specsGrid);

    // Combat Formula & Effect Card
    const effectCard = document.createElement('div');
    effectCard.className = 'dossier-effect-card';
    effectCard.innerHTML = `
      <div class="effect-card-title">✦ Arcane Formula & Combat Manifestation</div>
      <div class="effect-card-formula">${spell.formula}</div>
      <div class="effect-card-sub">School of ${school.sphereName} • Enhanced by Hero Mind (+3% power/pt) & Sorcery Skill</div>
    `;
    page.append(effectCard);

    // Gothic Lore Chronicle with Illuminated Drop-Cap
    const loreBox = document.createElement('div');
    loreBox.className = 'dossier-lore-box';

    const loreTitle = document.createElement('div');
    loreTitle.className = 'dossier-lore-title';
    loreTitle.textContent = 'Arcane Chronicle & Incantation Notes:';

    const loreText = document.createElement('div');
    loreText.className = 'dossier-lore-text';

    const firstLetter = spell.lore.charAt(0);
    const restOfLore = spell.lore.slice(1);

    loreText.innerHTML = `
      <span class="illuminated-initial" style="background:linear-gradient(135deg, ${school.color}, #1f120c);">${firstLetter}</span>
      <span>${restOfLore}</span>
    `;

    loreBox.append(loreTitle, loreText);
    page.append(loreBox);

    // Status Banner & Action Panel
    const actionPanel = document.createElement('div');
    actionPanel.className = 'dossier-action-panel';

    if (isKnown) {
      // KNOWN SPELL
      const knownBanner = document.createElement('div');
      knownBanner.className = 'dossier-status-banner known';
      knownBanner.innerHTML = `
        <span class="status-symbol">✦</span>
        <div class="status-text-block">
          <strong>Known & Inscribed in Memory</strong>
          <span>Ready to be cast or bound to fast hotkeys</span>
        </div>
      `;
      actionPanel.append(knownBanner);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'dossier-btn-group';

      // 1. Right Click Spell Button
      const rmbBtn = document.createElement('button');
      rmbBtn.className = `dossier-btn rmb-btn ${isActiveRmb ? 'active' : ''}`;
      rmbBtn.innerHTML = `⚡ ${isActiveRmb ? '✓ Active Right-Click Spell (Click to Unset)' : 'Set as Active Right-Click Spell'}`;
      rmbBtn.title = 'Allows you to cast this spell with mouse Right-Click in the world';
      rmbBtn.onclick = () => {
        if (isActiveRmb) {
          this.opt.setActiveRmb(null);
          this.opt.toast(`Right-Click Spell Cleared`);
        } else {
          this.opt.setActiveRmb(spell.id);
          this.opt.toast(`Set ${spell.name} as Active Right-Click Spell!`);
        }
        this.render();
      };

      // 2. Cast / Arm Now Button
      const castBtn = document.createElement('button');
      castBtn.className = 'dossier-btn cast-btn';
      castBtn.innerHTML = `✨ Cast / Arm Now`;
      castBtn.title = 'Close Spellbook and immediately arm this spell';
      castBtn.onclick = () => {
        this.close();
        this.opt.armSpell(spell.id);
      };

      btnGroup.append(rmbBtn, castBtn);
      actionPanel.append(btnGroup);

      // 3. Quickbar Assign Row [F1 - F8]
      const quickAssignRow = document.createElement('div');
      quickAssignRow.className = 'dossier-quick-assign-row';
      quickAssignRow.innerHTML = `<label>Assign to Quickbar Key:</label>`;

      const fkeyButtons = document.createElement('div');
      fkeyButtons.className = 'fkey-assign-buttons';

      for (let f = 0; f < 8; f++) {
        const fb = document.createElement('button');
        const isCurrent = this.opt.getSlots()[f] === spell.id;
        fb.className = `fkey-mini-btn ${isCurrent ? 'bound' : ''}`;
        fb.textContent = `F${f + 1}`;
        fb.title = `Bind ${spell.name} to slot F${f + 1}`;
        fb.onclick = () => {
          this.opt.setSlot(f, spell.id);
          this.opt.toast(`Assigned ${spell.name} to Quickbar [F${f + 1}]`);
          this.render();
        };
        fkeyButtons.append(fb);
      }

      quickAssignRow.append(fkeyButtons);
      actionPanel.append(quickAssignRow);
    } else {
      // LOCKED SPELL
      const lockedBox = document.createElement('div');
      lockedBox.className = 'dossier-locked-box';

      const waxSeal = document.createElement('div');
      waxSeal.className = 'wax-seal-badge';
      waxSeal.textContent = '🔒';

      const lockedInfo = document.createElement('div');
      lockedInfo.className = 'locked-info-content';
      lockedInfo.innerHTML = `
        <h4 class="locked-heading">Incantation Sealed: Unknown Spell</h4>
        <p class="locked-requirement">Requires Ancient Scroll: <strong>${spell.scrollName}</strong></p>
        <p class="locked-subtext">Acquire Spell Scroll from dungeon chests or the Town Arcanist.</p>
        <div class="locked-stats-row">
          <span>Scribing Fee: <strong>${spell.scribeFee} Gold</strong></span>
          <span>Attribute Requirement: <strong>Mind ${spell.mindReq}</strong></span>
        </div>
      `;

      lockedBox.append(waxSeal, lockedInfo);
      actionPanel.append(lockedBox);

      // Check if hero possesses the scroll in their backpack right now
      if (scrollInInventory !== null) {
        const canAfford = heroGold >= spell.scribeFee;
        const meetsMind = heroMind >= spell.mindReq;

        const scribeBox = document.createElement('div');
        scribeBox.className = 'dossier-scribe-box';
        scribeBox.innerHTML = `
          <div class="scribe-box-header">
            📜 <strong>You carry "${spell.scrollName}" in your pack!</strong>
          </div>
          <p class="scribe-box-desc">
            You can scribe this ancient scroll into your Grimoire for ${spell.scribeFee} gold.
            ${!canAfford ? `<span class="gold-warning">⚠️ Not enough gold! (You have ${heroGold}g)</span>` : ''}
            ${!meetsMind ? `<span class="mind-warning">⚠️ Mind too low! (Requires ${spell.mindReq}, you have ${heroMind})</span>` : ''}
          </p>
        `;

        const scribeBtn = document.createElement('button');
        scribeBtn.className = 'dossier-btn scribe-btn';
        scribeBtn.innerHTML = `📖 Scribe to Spellbook Now (${spell.scribeFee} Gold)`;
        scribeBtn.disabled = !canAfford || !meetsMind;
        scribeBtn.onclick = () => {
          this.opt.queue({ type: 'hero', op: 'use', item: scrollInInventory });
          this.opt.toast(`Scribing ${spell.scrollName} into your Spellbook...`);
          setTimeout(() => this.render(), 100);
        };

        scribeBox.append(scribeBtn);
        actionPanel.append(scribeBox);
      }
    }

    page.append(actionPanel);
  }
}
