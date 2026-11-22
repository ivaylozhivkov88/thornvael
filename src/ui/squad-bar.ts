import { DEFS, Kind } from '../sim/combat';
import type { Sim } from '../sim/sim';
import { St } from '../sim/spelldata';
import type { SquadStance } from '../sim/tactics';
import { S } from '../strings';

/** Maximum portrait cards rendered in the on-screen Squad Bar at once. */
export const MAX_SQUAD_MEMBERS = 8;

/** Time window (ms) for a second tap on the same portrait to focus the camera. */
export const SQUAD_DOUBLE_TAP_MS = 350;

/** Viewport breakpoints for automatic compact mobile layout. */
export const SQUAD_COMPACT_MAX_WIDTH = 900;
export const SQUAD_COMPACT_MAX_HEIGHT = 540;

export interface SquadStatusBadge {
  key: string;
  icon: string;
  label: string;
  kind: 'buff' | 'curse' | 'warn' | 'fallen';
}

export interface SquadMember {
  id: number;
  name: string;
  kind: number;
  cls?: number;
  female?: boolean;
  isHero: boolean;
  level: number;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  selected: boolean;
  alive: boolean;
  portraitUrl?: string;
  fallbackIcon: string;
  statusBadges: SquadStatusBadge[];
  veteranRank?: 0 | 1 | 2 | 3;
  chevron?: 'bronze' | 'silver' | 'gold';
  perkName?: string;
}

export interface SquadBarOptions {
  /** Called immediately on tap/click with the unit id and whether additive selection is active. */
  onSelect: (id: number, additive: boolean) => void;
  /** Called on double-tap/double-click of a member card to center the camera on that unit. */
  onFocus?: (id: number) => void;
  /** Optional dynamic check for mobile additive selection toggle mode. */
  isAdditive?: () => boolean;
  /** Optional clock provider (defaults to performance.now) for deterministic tests. */
  now?: () => number;
  /** Optional double-tap window override in ms. */
  doubleTapMs?: number;
  /** Initial collapsed state. */
  collapsed?: boolean;
  /** Optional callback when player selects Hold / Guard / Aggressive stance. */
  onStanceChange?: (stance: SquadStance) => void;
  /** Optional callback when player clicks Regroup. */
  onRegroup?: () => void;
  /** Initial stance (defaults to 'guard'). */
  initialStance?: SquadStance;
}

export interface ExtractSquadOptions {
  baseUrl?: string;
  maxMembers?: number;
  includeFallen?: boolean;
  getMercInfo?: (unitId: number) => { id: string; name: string } | null;
  getMercVeterancy?: (unitId: number) => {
    rank: 0 | 1 | 2 | 3;
    chevron?: 'bronze' | 'silver' | 'gold';
    perkName?: string;
  } | null;
}

interface CardRefs {
  root: HTMLButtonElement;
  img: HTMLImageElement;
  fallback: HTMLSpanElement;
  lvl: HTMLSpanElement;
  chevronBadge: HTMLSpanElement;
  badges: HTMLDivElement;
  name: HTMLDivElement;
  hpTrack: HTMLDivElement;
  hpFill: HTMLDivElement;
  manaTrack: HTMLDivElement;
  manaFill: HTMLDivElement;
  lastUrl: string;
  imgFailed: boolean;
}

const STATUS_DEFS: readonly { bit: number; key: string; icon: string; label: string; kind: 'buff' | 'curse' }[] = [
  { bit: St.Bless, key: 'bless', icon: '✨', label: 'Blessed', kind: 'buff' },
  { bit: St.Shield, key: 'shield', icon: '🛡️', label: 'Shielded', kind: 'buff' },
  { bit: St.Haste, key: 'haste', icon: '⚡', label: 'Hasted', kind: 'buff' },
  { bit: St.Poison, key: 'poison', icon: '☠️', label: 'Poisoned', kind: 'curse' },
  { bit: St.Burn, key: 'burn', icon: '🔥', label: 'Burning', kind: 'curse' },
  { bit: St.Slow, key: 'slow', icon: '❄️', label: 'Slowed', kind: 'curse' },
  { bit: St.Stone, key: 'stone', icon: '🪨', label: 'Petrified', kind: 'curse' },
  { bit: St.Weaken, key: 'weaken', icon: '💔', label: 'Weakened', kind: 'curse' },
];

const KIND_ICONS: Record<number, string> = {
  [Kind.Warrior]: '⚔️',
  [Kind.Archer]: '🏹',
  [Kind.Hero]: '🛡️',
  [Kind.Mage]: '🔮',
  [Kind.Gnoll]: '🐺',
  [Kind.Golem]: '🪨',
  [Kind.Imp]: '🔥',
};

function defaultBaseUrl(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL ?? './';
}

function clampPct(cur: number, max: number): number {
  if (max <= 0 || cur <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
}

/** Resolve portrait URL, display name fallback, and class icon for a party unit. */
export function resolveMemberPortrait(opts: {
  id: number;
  kind: number;
  isHero: boolean;
  cls?: number;
  female?: boolean;
  baseUrl?: string;
  mercInfo?: { id: string; name: string } | null;
}): { portraitUrl: string; fallbackIcon: string; defaultName: string } {
  const baseUrl = opts.baseUrl ?? defaultBaseUrl();
  if (opts.isHero) {
    const clsName = opts.cls ? 'mage' : 'warrior';
    const gen = opts.female ? 'f' : 'm';
    return {
      portraitUrl: `${baseUrl}townart/portrait-${clsName}-${gen}.png`,
      fallbackIcon: opts.cls ? '🔮' : '⚔️',
      defaultName: opts.cls ? 'Mage' : 'Warrior',
    };
  }

  if (opts.mercInfo?.id) {
    return {
      portraitUrl: `${baseUrl}townart/portraits/${opts.mercInfo.id}.jpg`,
      fallbackIcon: KIND_ICONS[opts.kind] ?? '🛡️',
      defaultName: opts.mercInfo.name || DEFS[opts.kind]?.name || S.kinds[opts.kind] || 'Ally',
    };
  }

  const fallbackName = DEFS[opts.kind]?.name ?? S.kinds[opts.kind] ?? 'Ally';
  if (opts.kind === Kind.Archer) {
    return { portraitUrl: `${baseUrl}townart/friend-archer.jpg`, fallbackIcon: '🏹', defaultName: fallbackName };
  }
  if (opts.kind === Kind.Mage) {
    return { portraitUrl: `${baseUrl}townart/portrait-mage-m.png`, fallbackIcon: '🔮', defaultName: fallbackName };
  }
  if (opts.kind === Kind.Warrior) {
    return { portraitUrl: `${baseUrl}townart/portrait-warrior-m.png`, fallbackIcon: '⚔️', defaultName: fallbackName };
  }
  if (opts.kind === Kind.Golem) {
    return { portraitUrl: `${baseUrl}townart/friend-golem.jpg`, fallbackIcon: '🪨', defaultName: fallbackName };
  }
  if (opts.kind === Kind.Imp) {
    return { portraitUrl: `${baseUrl}townart/friend-imp.jpg`, fallbackIcon: '🔥', defaultName: fallbackName };
  }
  return { portraitUrl: '', fallbackIcon: KIND_ICONS[opts.kind] ?? '🛡️', defaultName: fallbackName };
}

/** Build status badges for a unit from its CombatState status bitmask and vitality. */
export function buildStatusBadges(stMask: number, hp: number, hpMax: number): SquadStatusBadge[] {
  if (hp <= 0) {
    return [{ key: 'fallen', icon: '💀', label: 'Fallen', kind: 'fallen' }];
  }
  const badges: SquadStatusBadge[] = [];
  if (hpMax > 0 && hp / hpMax < 0.28) {
    badges.push({ key: 'low-hp', icon: '🩸', label: 'Critical HP', kind: 'warn' });
  }
  for (const def of STATUS_DEFS) {
    if ((stMask & (1 << def.bit)) !== 0) {
      badges.push({ key: def.key, icon: def.icon, label: def.label, kind: def.kind });
    }
    if (badges.length >= 2) break;
  }
  return badges;
}

/** Extract Hero + active party members / hired mercenaries from a Sim snapshot. */
export function extractSquadMembers(
  sim: Sim,
  selected: ReadonlySet<number>,
  opts: ExtractSquadOptions = {},
): { members: SquadMember[]; totalCount: number } {
  const maxMembers = Math.max(1, opts.maxMembers ?? MAX_SQUAD_MEMBERS);
  const baseUrl = opts.baseUrl ?? defaultBaseUrl();
  const heroId = sim.hero?.id ?? -1;
  const ids: number[] = [];

  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] !== 0 || sim.hidden[i]) continue;
    const isAlive = sim.cb.hp[i] > 0;
    if (!isAlive && !opts.includeFallen) continue;
    ids.push(i);
  }

  ids.sort((a, b) => {
    if (a === heroId) return -1;
    if (b === heroId) return 1;
    return a - b;
  });

  const totalCount = ids.length;
  const visibleIds = ids.slice(0, maxMembers);
  const members: SquadMember[] = visibleIds.map((id) => {
    const isHero = id === heroId && sim.hero !== null;
    const kind = sim.cb.kind[id] ?? 0;
    const hp = Math.max(0, sim.cb.hp[id] ?? 0);
    const hpMax = Math.max(1, sim.cb.hpMax[id] ?? 1);
    const mana = Math.max(0, sim.cb.mana[id] ?? 0);
    const manaMax = Math.max(0, sim.cb.manaMax[id] ?? 0);
    const mercInfo = isHero ? null : (opts.getMercInfo?.(id) ?? null);
    const resolved = resolveMemberPortrait({
      id,
      kind,
      isHero,
      cls: isHero ? sim.hero?.cls : undefined,
      female: isHero ? sim.hero?.female : undefined,
      baseUrl,
      mercInfo,
    });
    const level = isHero && sim.hero
      ? Math.max(1, sim.hero.level ?? sim.hero.skill.reduce((acc, v) => acc + v, 0) - 2)
      : Math.max(1, sim.cb.tier[id] || 1);
    const name = isHero ? (sim.hero?.name || resolved.defaultName) : resolved.defaultName;
    const vet = isHero ? null : (opts.getMercVeterancy?.(id) ?? null);

    return {
      id,
      name,
      kind,
      cls: isHero ? sim.hero?.cls : undefined,
      female: isHero ? sim.hero?.female : undefined,
      isHero,
      level,
      hp,
      hpMax,
      mana,
      manaMax,
      selected: selected.has(id),
      alive: hp > 0,
      portraitUrl: resolved.portraitUrl,
      fallbackIcon: resolved.fallbackIcon,
      statusBadges: buildStatusBadges(sim.cb.stMask[id] ?? 0, hp, hpMax),
      veteranRank: vet?.rank,
      chevron: vet?.chevron,
      perkName: vet?.perkName,
    };
  });

  return { members, totalCount };
}

/**
 * On-screen party & mercenary selection strip.
 * Single tap selects a unit; double tap pans the camera to focus on it.
 */
export class SquadBar {
  readonly el: HTMLElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly toggleText: HTMLSpanElement;
  private readonly listEl: HTMLDivElement;
  private readonly overflowEl: HTMLDivElement;
  private readonly tacticsEl: HTMLDivElement | null = null;
  private readonly stanceBtns = new Map<SquadStance, HTMLButtonElement>();
  private readonly cards = new Map<number, CardRefs>();
  private readonly now: () => number;
  private readonly doubleTapMs: number;
  private readonly onResizeBound: () => void;

  private collapsed: boolean;
  private currentStance: SquadStance;
  private compact = false;
  private mobileLandscape = false;
  private lastTapId = -1;
  private lastTapAt = -1e9;
  private lastStructureKey = '';
  private currentMembers: SquadMember[] = [];

  constructor(host: HTMLElement, private readonly opts: SquadBarOptions) {
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.doubleTapMs = opts.doubleTapMs ?? SQUAD_DOUBLE_TAP_MS;
    this.collapsed = Boolean(opts.collapsed);
    this.currentStance = opts.initialStance ?? 'guard';

    this.el = document.createElement('aside');
    this.el.id = 'squad-bar';
    this.el.className = 'squad-bar';
    this.el.setAttribute('aria-label', 'Party Squad Bar');
    this.el.hidden = true;

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.className = 'squad-bar-toggle';
    this.toggleBtn.setAttribute('aria-expanded', String(!this.collapsed));
    this.toggleBtn.setAttribute('aria-label', 'Toggle Squad Bar');

    this.toggleText = document.createElement('span');
    this.toggleText.className = 'squad-bar-toggle-label';
    this.toggleText.textContent = 'Squad (0) ▾';
    this.toggleBtn.append(this.toggleText);
    this.toggleBtn.onclick = () => this.toggleCollapsed();

    this.listEl = document.createElement('div');
    this.listEl.className = 'squad-bar-list';
    this.listEl.setAttribute('role', 'list');

    this.overflowEl = document.createElement('div');
    this.overflowEl.className = 'squad-bar-overflow';
    this.overflowEl.hidden = true;

    if (opts.onStanceChange || opts.onRegroup) {
      const tacticsEl = document.createElement('div');
      tacticsEl.className = 'squad-tactics-bar';
      tacticsEl.setAttribute('role', 'toolbar');
      tacticsEl.setAttribute('aria-label', 'Squad Stances and Regroup');

      if (opts.onStanceChange) {
        const stances: readonly { id: SquadStance; label: string; title: string }[] = [
          { id: 'hold', label: 'Hold', title: 'Hold Ground [H]' },
          { id: 'guard', label: 'Guard', title: 'Guard Position [G]' },
          { id: 'aggressive', label: 'Aggro', title: 'Aggressive Pursuit' },
        ];
        for (const st of stances) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'squad-tactic-btn';
          btn.dataset.stance = st.id;
          btn.textContent = st.label;
          btn.title = st.title;
          btn.setAttribute('aria-label', st.title);
          btn.setAttribute('aria-pressed', String(this.currentStance === st.id));
          if (this.currentStance === st.id) btn.classList.add('is-active');
          btn.onclick = () => {
            this.setStance(st.id);
            this.opts.onStanceChange?.(st.id);
          };
          this.stanceBtns.set(st.id, btn);
          tacticsEl.append(btn);
        }
      }

      if (opts.onRegroup) {
        const regBtn = document.createElement('button');
        regBtn.type = 'button';
        regBtn.className = 'squad-tactic-btn squad-regroup-btn';
        regBtn.textContent = '🛡 Regroup';
        regBtn.title = 'Regroup into Formation [Shift+R]';
        regBtn.setAttribute('aria-label', 'Regroup Squad Formation [Shift+R]');
        regBtn.onclick = () => this.opts.onRegroup?.();
        tacticsEl.append(regBtn);
      }

      this.tacticsEl = tacticsEl;
      this.el.append(this.toggleBtn, this.listEl, this.overflowEl, tacticsEl);
    } else {
      this.el.append(this.toggleBtn, this.listEl, this.overflowEl);
    }
    this.applyCollapsedState();
    host.append(this.el);

    this.onResizeBound = () => {
      if (typeof window !== 'undefined') {
        this.updateResponsiveLayout(window.innerWidth, window.innerHeight);
      }
    };
    if (typeof window !== 'undefined') {
      this.updateResponsiveLayout(window.innerWidth, window.innerHeight);
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('resize', this.onResizeBound);
      }
    }
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  get isCompact(): boolean {
    return this.compact;
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.applyCollapsedState();
  }

  setStance(stance: SquadStance): void {
    this.currentStance = stance;
    for (const [id, btn] of this.stanceBtns) {
      const active = id === stance;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  toggleCollapsed(): boolean {
    this.setCollapsed(!this.collapsed);
    return this.collapsed;
  }

  setCompact(compact: boolean, mobileLandscape = this.mobileLandscape): void {
    this.compact = compact;
    this.mobileLandscape = mobileLandscape;
    this.el.classList.toggle('is-compact', compact);
    this.el.classList.toggle('is-mobile-landscape', mobileLandscape);
  }

  /** Apply responsive layout classes from viewport dimensions (1080p, 720p, mobile landscape). */
  updateResponsiveLayout(width: number, height: number): boolean {
    const compact = width <= SQUAD_COMPACT_MAX_WIDTH || height <= SQUAD_COMPACT_MAX_HEIGHT;
    const mobileLandscape = height <= SQUAD_COMPACT_MAX_HEIGHT && width > height;
    this.setCompact(compact, mobileLandscape);
    return compact;
  }

  /** Update rendered party cards in-place without destroying unchanged DOM nodes. */
  update(members: readonly SquadMember[], totalCount = members.length): void {
    this.currentMembers = members.slice();
    this.el.hidden = members.length === 0;
    this.el.dataset.count = String(members.length);
    this.toggleText.textContent = `Squad (${totalCount}) ${this.collapsed ? '▸' : '▾'}`;

    const overflow = Math.max(0, totalCount - members.length);
    this.overflowEl.hidden = overflow === 0 || this.collapsed;
    if (overflow > 0) this.overflowEl.textContent = `+${overflow} more`;
    this.el.classList.toggle('has-overflow', overflow > 0);

    if (members.length === 0) {
      this.cards.clear();
      this.listEl.replaceChildren();
      this.lastStructureKey = '';
      return;
    }

    const structureKey = members.map((m) => m.id).join(',');
    if (structureKey !== this.lastStructureKey) {
      this.lastStructureKey = structureKey;
      const nextCards = new Map<number, CardRefs>();
      const nodes: HTMLButtonElement[] = [];
      for (const m of members) {
        const card = this.cards.get(m.id) ?? this.createCard(m.id);
        nextCards.set(m.id, card);
        nodes.push(card.root);
      }
      this.cards.clear();
      for (const [id, card] of nextCards) this.cards.set(id, card);
      this.listEl.replaceChildren(...nodes);
    }

    for (const m of members) {
      const card = this.cards.get(m.id);
      if (card) this.syncCard(card, m);
    }
  }

  /** Returns the unit id under the screen point (used for spell drop targeting), or -1. */
  unitAt(clientX: number, clientY: number): number {
    if (typeof document.elementFromPoint !== 'function') return -1;
    const target = document.elementFromPoint(clientX, clientY);
    const btn = target instanceof Element ? target.closest<HTMLElement>('[data-unit-id]') : null;
    if (!btn || !this.el.contains(btn)) return -1;
    const id = Number(btn.dataset.unitId);
    return Number.isFinite(id) ? id : -1;
  }

  destroy(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.onResizeBound);
    }
    this.cards.clear();
    if (typeof this.el.remove === 'function') {
      this.el.remove();
    } else if (this.el.parentElement) {
      this.el.parentElement.removeChild?.(this.el);
    }
  }

  private applyCollapsedState(): void {
    this.el.classList.toggle('is-collapsed', this.collapsed);
    this.toggleBtn.setAttribute('aria-expanded', String(!this.collapsed));
    this.listEl.hidden = this.collapsed;
    if (this.tacticsEl) this.tacticsEl.hidden = this.collapsed;
    const count = this.currentMembers.length;
    this.toggleText.textContent = `Squad (${count}) ${this.collapsed ? '▸' : '▾'}`;
    if (this.collapsed) this.overflowEl.hidden = true;
  }

  private createCard(id: number): CardRefs {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'squad-member';
    root.dataset.unitId = String(id);
    root.setAttribute('role', 'listitem');

    const portraitWrap = document.createElement('div');
    portraitWrap.className = 'squad-portrait-wrap';

    const img = document.createElement('img');
    img.className = 'squad-portrait-img';
    img.alt = '';
    img.draggable = false;

    const fallback = document.createElement('span');
    fallback.className = 'squad-fallback-icon';
    fallback.setAttribute('aria-hidden', 'true');

    const lvl = document.createElement('span');
    lvl.className = 'squad-level-badge';

    const chevronBadge = document.createElement('span');
    chevronBadge.className = 'squad-chevron-badge';
    chevronBadge.hidden = true;

    const badges = document.createElement('div');
    badges.className = 'squad-status-badges';

    portraitWrap.append(img, fallback, lvl, chevronBadge, badges);

    const meta = document.createElement('div');
    meta.className = 'squad-member-meta';

    const name = document.createElement('div');
    name.className = 'squad-member-name';

    const hpTrack = document.createElement('div');
    hpTrack.className = 'squad-bar-track squad-hp-track';
    hpTrack.setAttribute('role', 'progressbar');
    const hpFill = document.createElement('div');
    hpFill.className = 'squad-bar-fill squad-hp-fill';
    hpTrack.append(hpFill);

    const manaTrack = document.createElement('div');
    manaTrack.className = 'squad-bar-track squad-mana-track';
    manaTrack.setAttribute('role', 'progressbar');
    const manaFill = document.createElement('div');
    manaFill.className = 'squad-bar-fill squad-mana-fill';
    manaTrack.append(manaFill);

    meta.append(name, hpTrack, manaTrack);
    root.append(portraitWrap, meta);

    const refs: CardRefs = {
      root,
      img,
      fallback,
      lvl,
      chevronBadge,
      badges,
      name,
      hpTrack,
      hpFill,
      manaTrack,
      manaFill,
      lastUrl: '',
      imgFailed: false,
    };

    img.addEventListener?.('error', () => {
      refs.imgFailed = true;
      img.hidden = true;
      fallback.hidden = false;
    });
    img.addEventListener?.('load', () => {
      refs.imgFailed = false;
      img.hidden = false;
      fallback.hidden = true;
    });

    root.onclick = (e?: Event) => this.handleMemberTap(id, e as MouseEvent | PointerEvent | undefined);
    return refs;
  }

  private syncCard(card: CardRefs, m: SquadMember): void {
    const hpPct = clampPct(m.hp, m.hpMax);
    const manaPct = m.manaMax > 0 ? clampPct(m.mana, m.manaMax) : 0;
    const isLowHp = m.alive && hpPct > 0 && hpPct < 28;

    card.root.classList.toggle('is-hero', m.isHero);
    card.root.classList.toggle('is-selected', m.selected);
    card.root.classList.toggle('is-dead', !m.alive);
    card.root.classList.toggle('is-low-hp', isLowHp);
    card.root.setAttribute('aria-pressed', String(m.selected));
    card.root.setAttribute(
      'aria-label',
      `${m.name}, Level ${m.level}, HP ${m.hp}/${m.hpMax}${m.manaMax > 0 ? `, Mana ${m.mana}/${m.manaMax}` : ''}`,
    );

    card.name.textContent = m.name;
    card.lvl.textContent = `Lv ${m.level}`;
    card.fallback.textContent = m.fallbackIcon;

    if (m.chevron) {
      card.chevronBadge.hidden = false;
      card.chevronBadge.className = `squad-chevron-badge is-${m.chevron}`;
      card.chevronBadge.textContent = m.chevron === 'gold' ? '★' : m.chevron === 'silver' ? '▲▲' : '▲';
      card.chevronBadge.title = `Rank ${m.veteranRank ?? 1}: ${m.perkName ?? 'Veteran'}`;
      card.chevronBadge.setAttribute('aria-label', `Rank ${m.veteranRank ?? 1}: ${m.perkName ?? 'Veteran'}`);
    } else {
      card.chevronBadge.hidden = true;
      card.chevronBadge.className = 'squad-chevron-badge';
    }

    const url = m.portraitUrl ?? '';
    if (url !== card.lastUrl) {
      card.lastUrl = url;
      card.imgFailed = !url;
      if (url) {
        card.img.src = url;
        card.img.alt = m.name;
        card.img.hidden = false;
        card.fallback.hidden = true;
      } else {
        card.img.hidden = true;
        card.fallback.hidden = false;
      }
    }

    card.hpFill.style.width = `${hpPct}%`;
    card.hpTrack.setAttribute('aria-valuenow', String(m.hp));
    card.hpTrack.setAttribute('aria-valuemax', String(m.hpMax));

    card.manaTrack.classList.toggle('is-empty', m.manaMax <= 0);
    card.manaFill.style.width = `${manaPct}%`;
    card.manaTrack.setAttribute('aria-valuenow', String(m.mana));
    card.manaTrack.setAttribute('aria-valuemax', String(m.manaMax));

    const badgeKey = m.statusBadges.map((b) => b.key).join(',');
    if (card.badges.dataset.key !== badgeKey) {
      card.badges.dataset.key = badgeKey;
      card.badges.replaceChildren(
        ...m.statusBadges.map((b) => {
          const chip = document.createElement('span');
          chip.className = `squad-status-chip is-${b.kind}`;
          chip.textContent = b.icon;
          chip.title = b.label;
          chip.setAttribute('aria-label', b.label);
          return chip;
        }),
      );
    }
  }

  private handleMemberTap(id: number, e?: MouseEvent | PointerEvent): void {
    const now = this.now();
    const additive = Boolean(e?.shiftKey || e?.ctrlKey || e?.metaKey || this.opts.isAdditive?.());
    const isDoubleTap = this.lastTapId === id && now - this.lastTapAt <= this.doubleTapMs;

    if (isDoubleTap) {
      this.lastTapId = -1;
      this.lastTapAt = -1e9;
      const member = this.currentMembers.find((m) => m.id === id);
      if (member && !member.selected) {
        this.opts.onSelect(id, additive);
      }
      this.opts.onFocus?.(id);
      return;
    }

    this.lastTapId = id;
    this.lastTapAt = now;
    this.opts.onSelect(id, additive);
  }
}
