import {
  CLASS_NAMES,
  MAX_CHARACTERS,
  NAME_MAX,
  cleanName,
  newCharacter,
  type Character,
} from '../characters';
import {
  ARCHETYPES,
  buildHeroCreationScreen,
  findArchetypeIndex,
  type Archetype,
  type HeroCreationOptions,
} from '../herocreation';
import { S } from '../strings';
import { btn, el } from './dom';

export {
  ARCHETYPES,
  buildHeroCreationScreen,
  findArchetypeIndex,
  type Archetype,
  type HeroCreationOptions,
};

const T = S.shell;

export function formatCharacterClass(x: Character): string {
  return `${x.female ? 'Female ' : 'Male '}${CLASS_NAMES[x.cls] ?? 'Hero'}`;
}

export function buildCampfireHeroCreator(opts: HeroCreationOptions): HTMLElement {
  return buildHeroCreationScreen(opts);
}

export interface HeroSelectViewOptions {
  characters: readonly Character[];
  activeCharacter: Character | null;
  onSelect: (character: Character) => void;
  onDelete: (character: Character) => Promise<unknown> | void;
  onCreateNew: () => void;
  onExit: () => void;
}

/**
 * Renders the hero roster selection view (load existing hero, delete, or open campfire creation).
 */
export function renderHeroSelectView(opts: HeroSelectViewOptions): HTMLElement {
  const chars = opts.characters;
  let sel: Character | null = opts.activeCharacter ?? chars[0] ?? null;

  const col = el('div', 'sh-col');
  const list = el('div', 'sh-col');
  const info = el('p', 'sh-sub');

  const ok = btn('OK', () => {
    if (sel) opts.onSelect(sel);
  });

  const del = btn(
    'Delete Hero',
    () => {
      if (!sel) return;
      const victim = sel;
      if (
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm(`Delete ${victim.name} forever? Level, items and skills are lost.`)
      ) {
        return;
      }
      void opts.onDelete(victim);
    },
    'sh-small',
  );

  const refresh = (): void => {
    list.replaceChildren();
    for (const x of chars) {
      const row = btn(
        `${x.name}\nLevel ${x.level} ${formatCharacterClass(x)}`,
        () => {
          sel = x;
          refresh();
        },
        sel?.id === x.id ? 'sh-on' : '',
      );
      row.ondblclick = () => ok.click();
      list.append(row);
    }
    if (chars.length === 0) {
      list.append(el('p', 'sh-sub', 'No heroes yet. Create one.'));
    }
    ok.disabled = !sel;
    del.disabled = !sel;
    info.textContent = sel
      ? `${sel.name} — ${sel.played} game${sel.played === 1 ? '' : 's'} finished${sel.hero ? '' : ' · not yet played'}`
      : '';
  };

  refresh();
  const createBtn = btn('Create New Hero', opts.onCreateNew);
  createBtn.disabled = chars.length >= MAX_CHARACTERS;

  col.append(
    el('h1', '', 'Select Hero'),
    list,
    info,
    createBtn,
    del,
    ok,
    btn('Exit', opts.onExit, 'sh-small'),
  );
  return col;
}

export interface HeroCreateViewOptions {
  base?: string;
  onMountCampfire: (campfireScreen: HTMLElement) => void;
  onHeroCreated: (character: Character) => Promise<unknown> | void;
  onBack: () => void;
}

/**
 * Renders the hero naming prompt and launches the campfire champion showcase step.
 */
export function renderHeroCreateNameView(opts: HeroCreateViewOptions): {
  element: HTMLElement;
  focusInput: () => void;
} {
  const col = el('div', 'sh-col');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.placeholder = 'Hero name';
  input.className = 'sh-input';

  const proceedToCampfire = (): void => {
    const name = cleanName(input.value);
    const campfireScreen = buildCampfireHeroCreator({
      base: opts.base ?? import.meta.env.BASE_URL,
      onStart: async (arch, diff) => {
        const ch = newCharacter(name, arch.cls, arch.female, diff);
        await opts.onHeroCreated(ch);
      },
      onBack: opts.onBack,
    });
    opts.onMountCampfire(campfireScreen);
  };

  input.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      proceedToCampfire();
    }
  };

  col.append(
    el('h1', '', 'New Hero'),
    el('p', 'sh-sub', 'Name your hero.'),
    input,
    btn('Next', proceedToCampfire),
    btn(T.back, opts.onBack, 'sh-small'),
  );

  return {
    element: col,
    focusInput: () => input.focus?.(),
  };
}
