import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHETYPES, buildHeroCreationScreen, findArchetypeIndex } from '../src/herocreation';

class MockElement {
  tagName: string;
  className = '';
  textContent = '';
  title = '';
  src = '';
  alt = '';
  tabIndex = -1;
  onclick: ((e?: unknown) => void) | null = null;
  onkeydown: ((e: { key: string; preventDefault: () => void }) => void) | null = null;
  style: Record<string, string> = {};
  children: MockElement[] = [];
  attributes: Record<string, string> = {};

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  append(...items: Array<MockElement | string>): void {
    for (const item of items) {
      if (typeof item === 'string') {
        const t = new MockElement('#text');
        t.textContent = item;
        this.children.push(t);
      } else {
        this.children.push(item);
      }
    }
  }

  replaceChildren(...items: Array<MockElement | string>): void {
    this.children = [];
    this.append(...items);
  }

  findAll(pred: (el: MockElement) => boolean): MockElement[] {
    const out: MockElement[] = [];
    if (pred(this)) out.push(this);
    for (const c of this.children) {
      out.push(...c.findAll(pred));
    }
    return out;
  }

  findByClass(cls: string): MockElement | undefined {
    return this.findAll((e) => e.className.split(/\s+/).includes(cls))[0];
  }
}

describe('Hero Creation Pillar & Giant Showcase Screen', () => {
  beforeEach(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
      addEventListener: () => undefined,
    };
  });

  it('maps Class (Warrior / Mage) and Gender (Male / Female) to the 4 distinct champions', () => {
    expect(ARCHETYPES[findArchetypeIndex(0, false)]).toMatchObject({
      name: 'Dain Ironclad',
      portraitFile: 'portrait-warrior-m.png',
      cls: 0,
      female: false,
    });
    expect(ARCHETYPES[findArchetypeIndex(0, true)]).toMatchObject({
      name: 'Selena Swiftblade',
      portraitFile: 'portrait-warrior-f.png',
      cls: 0,
      female: true,
    });
    expect(ARCHETYPES[findArchetypeIndex(1, false)]).toMatchObject({
      name: 'Valerius Pyremaster',
      portraitFile: 'portrait-mage-m.png',
      cls: 1,
      female: false,
    });
    expect(ARCHETYPES[findArchetypeIndex(1, true)]).toMatchObject({
      name: 'Morrigan Frostweaver',
      portraitFile: 'portrait-mage-f.png',
      cls: 1,
      female: true,
    });
  });

  it('renders a single giant showcase figure and switches champion on Class and Gender button clicks', () => {
    let startedWith: { name: string; diff: number } | null = null;
    const screen = buildHeroCreationScreen({
      base: '/',
      createCampfire: () => ({
        canvas: new MockElement('canvas') as unknown as HTMLElement,
        start: () => undefined,
        stop: () => undefined,
      }),
      onStart: (arch, diff) => {
        startedWith = { name: arch.name, diff };
      },
      onBack: () => undefined,
    }) as unknown as MockElement;

    const getFigures = () => screen.findAll((e) => e.className.includes('sh-champion-figure') && e.tagName === 'IMG');
    expect(getFigures()).toHaveLength(1);
    expect(getFigures()[0].src).toContain('portrait-warrior-m.png');
    expect(screen.findByClass('sh-dossier-name')?.textContent).toBe('Dain Ironclad');

    // Switch Gender to Female -> Selena Swiftblade (Warrior + Female)
    const femaleBtn = screen.findAll((e) => e.className.includes('sh-select-sex') && e.className.includes('female'))[0];
    expect(femaleBtn).toBeDefined();
    femaleBtn.onclick?.();

    expect(getFigures()).toHaveLength(1);
    expect(getFigures()[0].src).toContain('portrait-warrior-f.png');
    expect(screen.findByClass('sh-champion-name')?.textContent).toBe('Selena Swiftblade');
    expect(screen.findByClass('sh-dossier-name')?.textContent).toBe('Selena Swiftblade');

    // Switch Class to Mage (while Female is active) -> Morrigan Frostweaver (Mage + Female)
    const mageBtn = screen.findAll((e) => e.className.includes('sh-select-cls') && e.className.includes('mage'))[0];
    expect(mageBtn).toBeDefined();
    mageBtn.onclick?.();

    expect(getFigures()).toHaveLength(1);
    expect(getFigures()[0].src).toContain('portrait-mage-f.png');
    expect(screen.findByClass('sh-champion-name')?.textContent).toBe('Morrigan Frostweaver');
    expect(screen.findByClass('sh-dossier-name')?.textContent).toBe('Morrigan Frostweaver');

    // Switch Gender to Male (while Mage is active) -> Valerius Pyremaster (Mage + Male)
    const maleBtn = screen.findAll((e) => e.className.includes('sh-select-sex') && e.className.includes('male'))[0];
    expect(maleBtn).toBeDefined();
    maleBtn.onclick?.();

    expect(getFigures()).toHaveLength(1);
    expect(getFigures()[0].src).toContain('portrait-mage-m.png');
    expect(screen.findByClass('sh-champion-name')?.textContent).toBe('Valerius Pyremaster');
    expect(screen.findByClass('sh-dossier-name')?.textContent).toBe('Valerius Pyremaster');

    // Start campaign with selected hero
    const startBtn = screen.findByClass('sh-btn-start');
    startBtn?.onclick?.();
    expect(startedWith).toEqual({ name: 'Valerius Pyremaster', diff: 1 });
  });

  it('enforces giant figure dimensions and strict 100dvh viewport containment in style.css', () => {
    const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
    expect(styleCss).toMatch(/\.sh-champion-figure-wrap\s*\{[^}]*width:\s*clamp\(340px,\s*42vw,\s*680px\);/);
    expect(styleCss).toMatch(/\.sh-champion-figure-wrap\s*\{[^}]*height:\s*clamp\(420px,\s*74dvh,\s*820px\);/);
    expect(styleCss).toMatch(/\.sh-champion-figure\s*\{[^}]*height:\s*clamp\(380px,\s*72dvh,\s*780px\);/);
    expect(styleCss).toMatch(/#shell\s+\.sh-campfire-screen\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  });
});
