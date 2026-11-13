import type { Sim } from './sim/sim';
import type { HeroState } from './sim/hero';
import { getItemDef, Ik } from './sim/items';
import { SPELLS } from './sim/spelldata';
import { S } from './strings';

export const BELT_COOLDOWN_MS = 1200;

export interface BeltPotions {
  heal: { id: number; count: number };
  mana: { id: number; count: number };
  greater: { id: number; count: number };
  buff: { id: number; count: number };
}

export function getBeltPotions(hero: HeroState | null): BeltPotions {
  let healId = -1, healCount = 0;
  let manaId = -1, manaCount = 0;
  let greaterId = -1, greaterCount = 0;
  let buffId = -1, buffCount = 0;

  if (hero) {
    for (const s of hero.inv) {
      if (s.n <= 0) continue;
      const def = getItemDef(s.item);
      if (!def || def.kind !== Ik.Potion) continue;
      if (def.heal > 0) {
        if (def.heal > 60) {
          if (greaterId < 0) greaterId = s.item;
          greaterCount += s.n;
        } else {
          if (healId < 0) healId = s.item;
          healCount += s.n;
        }
      } else if (def.restore > 0) {
        if (def.restore > 50) {
          if (buffId < 0) buffId = s.item;
          buffCount += s.n;
        } else {
          if (manaId < 0) manaId = s.item;
          manaCount += s.n;
        }
      } else if (def.grow) {
        if (buffId < 0) buffId = s.item;
        buffCount += s.n;
      }
    }
  }
  if (healId < 0 && greaterId >= 0) {
    healId = greaterId;
    healCount = greaterCount;
  }
  if (greaterId < 0 && healId >= 0) {
    greaterId = healId;
    greaterCount = healCount;
  }
  if (manaId < 0 && buffId >= 0) {
    manaId = buffId;
    manaCount = buffCount;
  }
  return {
    heal: { id: healId, count: healCount },
    mana: { id: manaId, count: manaCount },
    greater: { id: greaterId, count: greaterCount },
    buff: { id: buffId, count: buffCount },
  };
}

export interface HudHost {
  getSim: () => Sim;
  isOutcome: () => boolean;
  toast: (msg: string) => void;
  useItemSlot: (id: number) => void;
  playSfx: (name: string, bus?: number) => void;
  addFloater: (text: string, x: number, y: number, color: number) => void;
  toggleHeroUi: () => void;
  openSpellbook: () => void;
  getCurSpell: () => number;
  getQuickSlots: () => readonly number[];
}

export class HudController {
  private readonly beltCooldowns = [0, 0, 0, 0, 0];

  constructor(private readonly host: HudHost) {}

  drinkBelt(slot: number): void {
    if (this.host.isOutcome()) return;
    const sim = this.host.getSim();
    if (!sim.hero) {
      this.host.toast(S.hero.noHero);
      return;
    }
    const now = performance.now();
    if (now < this.beltCooldowns[slot]) {
      this.host.toast('Potion on cooldown');
      return;
    }
    const belt = getBeltPotions(sim.hero);
    let targetId = -1;
    let label = '';
    if (slot === 1) {
      targetId = belt.heal.id;
      label = 'Healing Draught';
    } else if (slot === 2) {
      targetId = belt.mana.id;
      label = 'Mana Draught';
    } else if (slot === 3) {
      targetId = belt.greater.id >= 0 ? belt.greater.id : belt.heal.id;
      label = 'Greater Healing / Rejuvenation Draught';
    } else if (slot === 4) {
      targetId = belt.buff.id >= 0 ? belt.buff.id : belt.mana.id;
      label = 'Elixir / Mana Draught';
    }

    if (targetId < 0) {
      this.host.toast(`No ${label} available.`);
      return;
    }

    this.beltCooldowns[slot] = now + BELT_COOLDOWN_MS;
    this.host.useItemSlot(targetId);
    this.host.playSfx('potion_drink', 4);
    this.host.playSfx(slot === 1 || slot === 3 ? 'heal' : 'buff', 5);

    const k = 32 / 256;
    const hx = sim.x[sim.hero.id] * k;
    const hy = sim.y[sim.hero.id] * k - 28;
    if (slot === 1 || slot === 3) {
      this.host.addFloater('+HP', hx, hy, 0x33ff55);
    } else {
      this.host.addFloater('+MP', hx, hy, 0x44aaff);
    }

    const el = document.getElementById(`belt-slot-${slot}`);
    if (el) {
      el.classList.remove('pulse');
      el.classList.add('cooldown');
      setTimeout(() => el.classList.remove('cooldown'), BELT_COOLDOWN_MS);
      void el.offsetWidth;
      el.classList.add('pulse');
    }
  }

  update(heroHp: number, heroHpMax: number, heroMana: number, heroManaMax: number): void {
    const sim = this.host.getSim();

    // Health globe
    const hpPct = heroHpMax > 0 ? Math.max(0, Math.min(100, Math.round((heroHp / heroHpMax) * 100))) : 0;
    const liquidHp = document.getElementById('liquid-health');
    if (liquidHp) liquidHp.style.height = `${hpPct}%`;
    const globeHpText = document.getElementById('globe-health-text');
    if (globeHpText) globeHpText.textContent = `${heroHp} / ${heroHpMax}`;

    // Mana globe
    const manaPct = heroManaMax > 0 ? Math.max(0, Math.min(100, Math.round((heroMana / heroManaMax) * 100))) : 0;
    const liquidMana = document.getElementById('liquid-mana');
    if (liquidMana) liquidMana.style.height = `${manaPct}%`;
    const globeManaText = document.getElementById('globe-mana-text');
    if (globeManaText) globeManaText.textContent = `${heroMana} / ${heroManaMax}`;

    // Belt potion counts
    const belt = getBeltPotions(sim.hero);
    const c1 = document.getElementById('belt-count-1');
    if (c1) {
      c1.textContent = String(belt.heal.count);
      document.getElementById('belt-slot-1')?.classList.toggle('empty', belt.heal.count === 0);
    }
    const c2 = document.getElementById('belt-count-2');
    if (c2) {
      c2.textContent = String(belt.mana.count);
      document.getElementById('belt-slot-2')?.classList.toggle('empty', belt.mana.count === 0);
    }
    const c3 = document.getElementById('belt-count-3');
    if (c3) {
      c3.textContent = String(belt.greater.count);
      document.getElementById('belt-slot-3')?.classList.toggle('empty', belt.greater.count === 0);
    }
    const c4 = document.getElementById('belt-count-4');
    if (c4) {
      c4.textContent = String(belt.buff.count);
      document.getElementById('belt-slot-4')?.classList.toggle('empty', belt.buff.count === 0);
    }

    // RMB Spell icon & hotkey
    const curSpell = this.host.getCurSpell();
    const sp = SPELLS[curSpell];
    const rmbIcon = document.getElementById('icon-rmb');
    const rmbHotkey = document.getElementById('skill-hotkey-label');
    const slotRmb = document.getElementById('slot-rmb');
    if (rmbIcon && sp) {
      const schoolIcons = ['✨', '🔥', '💧', '⚡', '🌿', '💀'];
      rmbIcon.textContent = schoolIcons[sp.school] ?? '✨';
      const slots = this.host.getQuickSlots();
      const slotIdx = slots.indexOf(curSpell);
      if (rmbHotkey) rmbHotkey.textContent = slotIdx >= 0 ? `F${slotIdx + 4}` : `${sp.cost}M`;
      if (slotRmb) slotRmb.title = `${sp.name} [RMB]\nCost: ${sp.cost} MP`;
    }

    // Hero portrait & level
    if (sim.hero) {
      const heroImg = document.getElementById('hud-hero-img') as HTMLImageElement | null;
      if (heroImg) {
        const clsName = sim.hero.cls ? 'mage' : 'warrior';
        const gen = sim.hero.female ? 'f' : 'm';
        const src = `${import.meta.env.BASE_URL}townart/portrait-${clsName}-${gen}.png`;
        if (!heroImg.src.endsWith(src)) heroImg.src = src;
      }
      const heroLvl = document.getElementById('hud-hero-lvl');
      if (heroLvl) {
        const lvl = Math.max(1, sim.hero.skill.reduce((a, b) => a + b, 0) - 2);
        heroLvl.textContent = `Lvl ${lvl}`;
      }
      const heroName = document.getElementById('hud-hero-name');
      if (heroName) {
        heroName.textContent = sim.hero.cls ? 'Mage' : 'Warrior';
      }
    }

    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.textContent = `Gold: ${sim.cb.gold[0] ?? 0}  Foes: ${sim.cb.alive[1] ?? 0}`;
    }
  }

  initBindings(): void {
    for (let i = 1; i <= 4; i++) {
      const slot = document.getElementById(`belt-slot-${i}`);
      if (slot) slot.onclick = () => this.drinkBelt(i);
    }

    const decal = document.getElementById('hero-decal');
    if (decal) decal.onclick = () => this.host.toggleHeroUi();

    const btnSpells = document.getElementById('btn-spells-hud');
    if (btnSpells) btnSpells.onclick = () => this.host.openSpellbook();
  }
}
