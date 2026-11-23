import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  HUB_EVOLUTION,
  getHubEvolutionStage,
  isCanonicalHubId,
  missionMatches,
  normalizeHubId,
} from '../src/data/hub-evolution';
import {
  HUB_EVOLUTION as STORY_HUB_EVOLUTION,
  getCurrentHubStage,
  getHubEvolutionStage as storyGetHubEvolutionStage,
} from '../src/story-complete';
import {
  HUB_EVOLUTION as TOWN_HUB_EVOLUTION,
  getHubEvolutionStage as townGetHubEvolutionStage,
} from '../src/town';
import { ModalManager, openBriefingModal } from '../src/shell/modals';
import type { CampaignNode } from '../src/campaign';

function createFakeDom() {
  class FakeElement {
    tagName: string;
    className = '';
    textContent = '';
    tabIndex = 0;
    hidden = false;
    disabled = false;
    type = '';
    children: FakeElement[] = [];
    parentNode: FakeElement | null = null;
    attributes = new Map<string, string>();
    dataset: Record<string, string> = {};
    listeners = new Map<string, Array<(e: unknown) => void>>();
    onclick: (() => void) | null = null;
    private styleProps = new Map<string, string>();
    style = {
      setProperty: (k: string, v: string) => {
        this.styleProps.set(k, v);
      },
      getPropertyValue: (k: string) => this.styleProps.get(k) ?? '',
    };
    classList = {
      add: (...cls: string[]) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const c of cls) set.add(c);
        this.className = [...set].join(' ');
      },
      contains: (c: string) => this.className.split(/\s+/).includes(c),
    };

    constructor(tag: string) {
      this.tagName = tag.toUpperCase();
    }

    append(...nodes: Array<FakeElement | { nodeType: number; textContent: string }>): void {
      for (const n of nodes) {
        if (n instanceof FakeElement) {
          n.parentNode = this;
          this.children.push(n);
        } else {
          const span = new FakeElement('span');
          span.textContent = n.textContent ?? '';
          this.children.push(span);
        }
      }
    }

    setAttribute(k: string, v: string): void {
      this.attributes.set(k, v);
    }

    getAttribute(k: string): string | null {
      return this.attributes.get(k) ?? null;
    }

    addEventListener(ev: string, fn: (e: unknown) => void): void {
      const list = this.listeners.get(ev) ?? [];
      list.push(fn);
      this.listeners.set(ev, list);
    }

    removeEventListener(ev: string, fn: (e: unknown) => void): void {
      const list = this.listeners.get(ev) ?? [];
      this.listeners.set(
        ev,
        list.filter((f) => f !== fn),
      );
    }

    querySelectorAll(): FakeElement[] {
      const out: FakeElement[] = [];
      const walk = (node: FakeElement) => {
        for (const c of node.children) {
          if (c.tagName === 'BUTTON') out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }

    focus(): void {}
    remove(): void {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      }
    }
    contains(): boolean {
      return true;
    }
    get isConnected(): boolean {
      return true;
    }
  }

  const fakeDoc = {
    activeElement: null,
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => ({ nodeType: 3, textContent: text }),
  };

  return { FakeElement, fakeDoc };
}

describe('Living Hub Evolution (Acts I–IV)', () => {
  it('re-exports HUB_EVOLUTION and getHubEvolutionStage cleanly from story-complete.ts and town.ts and stays synced with hub-evolution.json', () => {
    expect(STORY_HUB_EVOLUTION).toBe(HUB_EVOLUTION);
    expect(TOWN_HUB_EVOLUTION).toBe(HUB_EVOLUTION);
    expect(storyGetHubEvolutionStage).toBe(getHubEvolutionStage);
    expect(townGetHubEvolutionStage).toBe(getHubEvolutionStage);

    const jsonStages = JSON.parse(
      readFileSync(new URL('../public/data/content/hub-evolution.json', import.meta.url), 'utf8'),
    );
    expect(jsonStages).toEqual(HUB_EVOLUTION);

    for (const stage of HUB_EVOLUTION) {
      expect(stage.id).toBeTruthy();
      expect([1, 2, 3, 4]).toContain(stage.act);
      expect(stage.hubId).toBeTruthy();
      expect(stage.hubName).toBeTruthy();
      expect(stage.milestone).toBeTruthy();
      expect(Array.isArray(stage.requiredMissions)).toBe(true);
      expect(stage.townDescription.length).toBeGreaterThan(20);
      expect(stage.ambientNote.length).toBeGreaterThan(10);
      expect(stage.visualFilter.length).toBeGreaterThan(5);
      expect(stage.particles.length).toBeGreaterThan(2);
    }
  });

  it('transitions Act I (Thornwick Market) through START -> m01 -> m04 -> m06 -> m07 -> m11', () => {
    expect(getHubEvolutionStage('town-thornwick', []).milestone).toBe('START');
    expect(getHubEvolutionStage('town-thornwick', ['m01-blood-at-the-ford']).milestone).toBe('m01');
    expect(getHubEvolutionStage('town-thornwick', ['m01', 'm04']).milestone).toBe('m04');
    expect(
      getHubEvolutionStage('town-thornwick', ['m01-blood-at-the-ford', 'm04-the-sunken-sanctum']).unlockedMercenary,
    ).toBe('Defrocked Lantern-Scribe');

    const m06 = getHubEvolutionStage('town-thornwick', ['m01', 'm04', 'm06-greywood-supply']);
    expect(m06.milestone).toBe('m06');
    expect(m06.townDescription).toContain('freshly baked bread');

    expect(getHubEvolutionStage('town-thornwick', ['m07-split-vanguard']).milestone).toBe('m07');

    const m11 = getHubEvolutionStage('town-thornwick', ['m01', 'm06', 'm11-ashbrook-retreat']);
    expect(m11.milestone).toBe('m11');
    expect(m11.particles).toBe('ash_light');
    expect(m11.townDescription).toContain('gray ash');
  });

  it('transitions Act II (Redmarsh Outpost) through START -> m13 -> m16 -> m17 -> m20 -> m23', () => {
    const start = getHubEvolutionStage('town-redmarsh', []);
    expect(start.milestone).toBe('START');
    expect(start.particles).toBe('alkali_storm');

    expect(getHubEvolutionStage('town-redmarsh', ['m13-twin-passes']).milestone).toBe('m13');

    const m16 = getHubEvolutionStage('town-redmarsh', ['m13', 'm16-wardstone-rupture']);
    expect(m16.milestone).toBe('m16');
    expect(m16.particles).toBe('clear_heat');
    expect(m16.unlockedMercenary).toBe('Third-Dynasty Tomb Notary');

    const m17 = getHubEvolutionStage('town-redmarsh', ['m16', 'm17-mire-convoy']);
    expect(m17.milestone).toBe('m17');
    expect(m17.particles).toBe('clear_heat');

    const m20 = getHubEvolutionStage('town-redmarsh', ['m16', 'm17', 'm20-deep-quarry']);
    expect(m20.milestone).toBe('m20');
    expect(m20.unlockedMercenary).toBe('Deep Quarry Sapper');

    const m23 = getHubEvolutionStage('town-redmarsh', ['m16', 'm20', 'm23-fork-of-spears']);
    expect(m23.milestone).toBe('m23');
    expect(m23.particles).toBe('ash_light');
    expect(m23.townDescription).toContain('dry cisterns');
  });

  it('transitions Act III (Oakhaven & Harborwatch) through START -> m27 -> m29 -> m30 -> m32 -> m35', () => {
    const start = getHubEvolutionStage('town-oakhaven', []);
    expect(start.milestone).toBe('START');
    expect(start.hubName).toBe('Oakhaven Frontier');
    expect(start.particles).toBe('sea_spray');

    const m27 = getHubEvolutionStage('town-oakhaven', ['m27-field-infirmary']);
    expect(m27.milestone).toBe('m27');
    expect(m27.townDescription).toContain('Sera');

    const m29 = getHubEvolutionStage('town-oakhaven', ['m27', 'm29-hourglass-rescue']);
    expect(m29.milestone).toBe('m29');
    expect(m29.hubName).toBe('Harborwatch War-Docks');

    const m30 = getHubEvolutionStage('town-oakhaven', ['m29', 'm30-starved-bastion']);
    expect(m30.milestone).toBe('m30');
    expect(m30.hubName).toBe('Harborwatch War-Docks');
    expect(m30.unlockedMercenary).toBe('Oakhaven Boarding Marine');

    const m32 = getHubEvolutionStage('town-oakhaven', ['m30', 'm32-elder-juggernaut']);
    expect(m32.milestone).toBe('m32');
    expect(m32.particles).toBe('ash_light');

    const m35 = getHubEvolutionStage('town-oakhaven', ['m32', 'm35-burning-harbor']);
    expect(m35.milestone).toBe('m35');
    expect(m35.particles).toBe('embers');
    expect(m35.townDescription).toContain('empty');
  });

  it('transitions Act IV (Highcrest Citadel) through START -> m37 -> m39 -> m42 -> m45 / m46', () => {
    const start = getHubEvolutionStage('town-ironcamp', []);
    expect(start.milestone).toBe('START');
    expect(start.hubName).toBe('Highcrest Citadel');
    expect(start.particles).toBe('cinder_snow');
    expect(start.unlockedMercenary).toBe('Ironcamp Halberdier');

    expect(getHubEvolutionStage('town-ironcamp', ['m37-shattered-beacons']).milestone).toBe('m37');
    expect(getHubEvolutionStage('town-ironcamp', ['m37', 'm39-flight-of-malrik']).milestone).toBe('m39');

    const m42 = getHubEvolutionStage('town-ironcamp', ['m39', 'm42-outer-rampart']);
    expect(m42.milestone).toBe('m42');
    expect(m42.particles).toBe('embers');
    expect(m42.unlockedMercenary).toBe('Caldera Siege-Engineer');

    const m45 = getHubEvolutionStage('town-ironcamp', ['m42', 'm45-crown-of-order']);
    expect(m45.milestone).toBe('m45');
    expect(m45.particles).toBe('clear_heat');

    const m46 = getHubEvolutionStage('town-ironcamp', ['m42', 'm46-ember-reckoning']);
    expect(m46.milestone).toBe('m46');
    expect(m46.particles).toBe('embers');
  });

  it('maintains backward compatibility for short hub IDs, legacy MQ/SQ mission IDs, getCurrentHubStage, and boundary matching', () => {
    // Short & display hub aliases
    expect(normalizeHubId('thornwick')).toBe('town-thornwick');
    expect(normalizeHubId('redmarsh')).toBe('town-redmarsh');
    expect(normalizeHubId('oakhaven')).toBe('town-oakhaven');
    expect(normalizeHubId('harborwatch')).toBe('town-oakhaven');
    expect(normalizeHubId('highcrest')).toBe('town-ironcamp');
    expect(isCanonicalHubId('town-ironcamp')).toBe(true);
    expect(isCanonicalHubId('Hearthspire')).toBe(false);

    // Prefix boundary: m1 must NOT match m10
    expect(missionMatches('m10-undervault-links', 'm1')).toBe(false);
    expect(missionMatches('m01-blood-at-the-ford', 'm01')).toBe(true);

    // Legacy MQ/SQ aliases
    expect(getHubEvolutionStage('thornwick', ['MQ1-02']).milestone).toBe('m04');
    expect(getHubEvolutionStage('thornwick', ['MQ1-04']).milestone).toBe('m11');
    expect(getHubEvolutionStage('redmarsh', ['MQ2-03']).milestone).toBe('m16');
    expect(getHubEvolutionStage('redmarsh', ['MQ2-04']).milestone).toBe('m20');
    expect(getHubEvolutionStage('harborwatch', ['m30']).milestone).toBe('m30');
    expect(getHubEvolutionStage('highcrest', ['m42']).milestone).toBe('m42');

    // Legacy getCurrentHubStage helper
    expect(getCurrentHubStage(1, ['MQ1-04'])?.milestone).toBe('m11');
    expect(getCurrentHubStage(2, ['MQ2-03'])?.milestone).toBe('m16');
    expect(getCurrentHubStage(3, ['m30'])?.milestone).toBe('m30');
    expect(getCurrentHubStage(4, ['m42'])?.milestone).toBe('m42');
  });

  it('wires dynamic hub evolution into openBriefingModal for town nodes and into townui/main', () => {
    const { FakeElement, fakeDoc } = createFakeDom();
    const prevDoc = (globalThis as Record<string, unknown>).document;
    (globalThis as Record<string, unknown>).document = fakeDoc;

    try {
      const root = new FakeElement('div');
      const modals = new ModalManager();
      const townNode: CampaignNode = {
        id: 'town-oakhaven',
        act: 3,
        kind: 'town',
        map: 'market',
        title: 'Oakhaven Bastion',
        pos: [15, 20],
        unlocksOnVictory: [],
        briefing: 'Static fallback briefing',
      };

      const handle = openBriefingModal(modals, root as unknown as HTMLElement, {
        node: townNode,
        record: {
          v: 1,
          hero: { cls: 0, female: false },
          progress: {
            difficulty: 1,
            unlocked: ['town-oakhaven'],
            completed: ['m30-starved-bastion'],
            node: 'town-oakhaven',
            townVisits: 0,
          },
          carry: null,
          last: null,
        },
        onEnter: vi.fn(),
        onWaypointTravel: vi.fn(),
      });

      const box = handle.box as unknown as InstanceType<typeof FakeElement>;
      expect(box.dataset.hubStage).toBe('harborwatch-m30');
      expect(box.dataset.hubParticles).toBe('embers');
      expect(box.style.getPropertyValue('--hub-visual-filter')).toBe('contrast(1.10) sepia(0.15)');

      const collectText = (node: InstanceType<typeof FakeElement>): string =>
        [node.textContent, ...node.children.map(collectText)].filter(Boolean).join('\n');
      const serialized = collectText(box);
      expect(serialized).toContain('Harborwatch War-Docks');
      expect(serialized).toContain('Great Evacuation caravels');
      expect(serialized).toContain('Oakhaven Boarding Marine');
      expect(serialized).not.toContain('Static fallback briefing');
      handle.close();
    } finally {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }

    const townUiSrc = readFileSync(new URL('../src/townui.ts', import.meta.url), 'utf8');
    const mainSrc = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(townUiSrc).toContain('getHubEvolutionStage');
    expect(townUiSrc).toContain('town-hub-evolution');
    expect(mainSrc).toContain('getHubEvolutionStage');
    expect(mainSrc).toContain('visualFilter');
  });
});
