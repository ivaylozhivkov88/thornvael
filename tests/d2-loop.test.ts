import { describe, expect, it, vi } from 'vitest';
import { parseCampaign, townHubForAct, townNodeForAct, nextSessionSeed, newProgress } from '../src/campaign';
import { newRecord, saveAndExitRecord, type CampaignRecord } from '../src/flow';
import { Sim } from '../src/sim/sim';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { extractCarryover, type CarryoverState } from '../src/carryover';
import { applyDynamicSessionRespawn, hashString, D2R_BOSS_MODS } from '../src/sim/respawn';
import { ensureConnectedWorldExits, WaypointTravelModal } from '../src/connected-world';
import type { GameMap } from '../src/map';
import type { Scenario } from '../src/sim/bot';
import type { MapDoc } from '../src/mapdoc';

class MockElement {
  id = '';
  className = '';
  hidden = false;
  private _textContent = '';
  get textContent(): string {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => c.textContent).join(' ');
  }
  set textContent(v: string) {
    this._textContent = v;
  }
  innerHTML = '';
  disabled = false;
  children: MockElement[] = [];
  onclick: ((e?: unknown) => void) | null = null;

  append(...kids: (MockElement | string)[]) {
    kids.forEach((k) => {
      if (typeof k === 'string') {
        const textNode = new MockElement();
        textNode.textContent = k;
        this.children.push(textNode);
      } else {
        this.children.push(k);
      }
    });
  }

  replaceChildren(...kids: (MockElement | string)[]) {
    this.children = [];
    this.append(...kids);
  }

  click() {
    this.onclick?.();
  }

  querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    const walk = (el: MockElement) => {
      if (selector.startsWith('.') && el.className.split(' ').includes(selector.slice(1))) {
        res.push(el);
      }
      el.children.forEach(walk);
    };
    this.children.forEach(walk);
    return res;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const mockElements: Record<string, MockElement> = {};
const mockDoc = {
  getElementById: (id: string) => {
    if (!mockElements[id]) {
      const el = new MockElement();
      el.id = id;
      mockElements[id] = el;
    }
    return mockElements[id];
  },
  createElement: () => new MockElement(),
  body: new MockElement(),
};
(globalThis as any).document = mockDoc;

function mockMap(w = 32, h = 32): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h).fill(0),
    height: new Uint8Array(w * h).fill(1),
    blocked: new Uint8Array(w * h).fill(0),
    objects: [],
    light: new Uint8Array(w * h).fill(255),
  };
}

const CAMPAIGN_MOCK = parseCampaign({
  version: 1,
  chapter: 'all-acts',
  start: 'm01-blood-at-the-ford',
  nodes: [
    {
      id: 'm01-blood-at-the-ford',
      kind: 'mission',
      map: 'ford',
      title: 'Blood at the Ford',
      pos: [38, 20],
      unlocksOnVictory: ['town-thornwick', 'm02-whispers-in-the-fen'],
      briefing: 'Clear the ford',
      act: 1,
    },
    {
      id: 'town-thornwick',
      kind: 'town',
      map: 'market',
      title: 'Thornwick Market',
      pos: [14, 20],
      unlocksOnVictory: [],
      briefing: 'Town base',
      act: 1,
    },
    {
      id: 'm02-whispers-in-the-fen',
      kind: 'mission',
      map: 'fen',
      title: 'Whispers in the Fen',
      pos: [62, 20],
      unlocksOnVictory: ['m03-nightfall-at-ravenwatch'],
      briefing: 'Deep marsh',
      act: 1,
    },
    {
      id: 'm03-nightfall-at-ravenwatch',
      kind: 'mission',
      map: 'ravenwatch',
      title: 'Nightfall at Ravenwatch',
      pos: [86, 20],
      unlocksOnVictory: [],
      briefing: 'Ruined fort',
      act: 1,
    },
    {
      id: 'town-redmarsh',
      kind: 'town',
      map: 'market',
      title: 'Redmarsh Outpost',
      pos: [14, 11],
      unlocksOnVictory: [],
      briefing: 'Act 2 Town',
      act: 2,
    },
    {
      id: 'town-oakhaven',
      kind: 'town',
      map: 'market',
      title: 'Oakhaven Bastion',
      pos: [14, 11],
      unlocksOnVictory: [],
      briefing: 'Act 3 Town',
      act: 3,
    },
    {
      id: 'town-ironcamp',
      kind: 'town',
      map: 'market',
      title: 'Ironcamp Citadel',
      pos: [14, 20],
      unlocksOnVictory: [],
      briefing: 'Act 4 Town',
      act: 4,
    },
  ],
});

describe('D2R Game Loop & Connected World', () => {
  describe('Phase 1: D2R Save and Exit & Town Hub Spawning', () => {
    it('townHubForAct returns canonical Town Hub IDs for all 4 acts', () => {
      expect(townHubForAct(1)).toBe('town-thornwick');
      expect(townHubForAct(2)).toBe('town-redmarsh');
      expect(townHubForAct(3)).toBe('town-oakhaven');
      expect(townHubForAct(4)).toBe('town-ironcamp');
    });

    it('townNodeForAct finds the actual town node in campaign', () => {
      const t1 = townNodeForAct(CAMPAIGN_MOCK, 1);
      expect(t1.id).toBe('town-thornwick');
      expect(t1.kind).toBe('town');

      const t2 = townNodeForAct(CAMPAIGN_MOCK, 2);
      expect(t2.id).toBe('town-redmarsh');
      expect(t2.kind).toBe('town');
    });

    it('saveAndExitRecord saves carryover, sets node to Town Hub, rotates sessionSeed, and restores merc HP', () => {
      const rec = newRecord(CAMPAIGN_MOCK, { cls: 0, female: false }, 1);
      // Hero was fighting in wilderness mission m02
      rec.progress.node = 'm02-whispers-in-the-fen';
      rec.progress.sessionSeed = 1000;

      const mockCarry: CarryoverState = {
        hero: {
          id: 0,
          cls: 0,
          female: false,
          diff: 1,
          level: 3,
          xp: 1500,
          statPoints: 5,
          skillPoints: 2,
          attr: [20, 15, 10, 12],
          skill: [1, 1, 1],
          use: [0, 0, 0],
          hits: [0, 0, 0, 0],
          inv: [{ item: 1, n: 5 }],
          eq: [10, -1, -1, -1],
          known: 0b101,
        },
        mercs: [{ kind: Kind.Archer, hpPct: 35 }],
        gold: 850,
        shopSeed: 42,
        progress: rec.progress,
        slots: [0, 1, 4],
      };

      const saved = saveAndExitRecord(CAMPAIGN_MOCK, rec, mockCarry);

      // Hero always spawns in the Town Hub of the corresponding Act
      expect(saved.progress.node).toBe('town-thornwick');
      // Town node must be unlocked
      expect(saved.progress.unlocked).toContain('town-thornwick');
      // Town Hub must be in waypoints
      expect(saved.progress.waypoints).toContain('town-thornwick');
      // Session seed rotated for next game
      expect(saved.progress.sessionSeed).not.toBe(1000);
      expect(saved.progress.sessionSeed).toBeGreaterThan(0);
      // Carryover preserved with XP, level, inventory, and gold
      expect(saved.carry).not.toBeNull();
      expect(saved.carry?.hero.xp).toBe(1500);
      expect(saved.carry?.gold).toBe(850);
      // Mercenary HP restored to 100% for fresh town spawn
      expect(saved.carry?.mercs[0].hpPct).toBe(100);
      // Defeat/victory screen cleared
      expect(saved.last).toBeNull();
    });

    it('nextSessionSeed is deterministic and non-zero', () => {
      const s1 = nextSessionSeed(12345, 1);
      const s2 = nextSessionSeed(12345, 1);
      expect(s1).toBe(s2);
      expect(s1).toBeGreaterThan(0);

      const s3 = nextSessionSeed(12345, 2);
      expect(s3).not.toBe(s1);
    });
  });

  describe('Phase 2: Dynamic / Procedural Wilderness Monster Respawn', () => {
    it('applyDynamicSessionRespawn preserves team 0 hero and companions while spawning champions & elites', () => {
      const map = mockMap(40, 40);
      // 1 hero (team 0), 2 companions (team 0), 6 monsters (team 1) in 2 packs
      const teams = [0, 0, 0, 1, 1, 1, 1, 1, 1];
      const kinds = [Kind.Hero, Kind.Warrior, Kind.Archer, Kind.Gnoll, Kind.Imp, Kind.Imp, Kind.Gnoll, Kind.Imp, Kind.Imp];
      const sim = new Sim(map, 1, teams, { kinds, combat: true });

      createHero(sim, 0, 0, false, 1);

      const scenario: Scenario = {
        teams,
        kinds,
        tiles: [
          [5, 5],
          [4, 5],
          [5, 4],
          [15, 15],
          [16, 15],
          [15, 16],
          [25, 25],
          [26, 25],
          [25, 26],
        ],
        packs: [
          { ids: [3, 4, 5], x: 15.5, y: 15.5, hunting: false, calm: 0 },
          { ids: [6, 7, 8], x: 25.5, y: 25.5, hunting: false, calm: 0 },
        ],
      };

      for (let i = 0; i < teams.length; i++) {
        sim.place(i, scenario.tiles[i][0], scenario.tiles[i][1]);
      }

      const initialHeroHp = sim.cb.hp[0];
      const initialHeroX = sim.x[0];
      const initialHeroY = sim.y[0];

      const res = applyDynamicSessionRespawn(sim, scenario, 99999, 'm01-blood-at-the-ford', 1);

      // Hero untouched
      expect(sim.cb.hp[0]).toBe(initialHeroHp);
      expect(sim.x[0]).toBe(initialHeroX);
      expect(sim.y[0]).toBe(initialHeroY);

      // Champions and elites generated
      expect(res.championsCount + res.elitesCount).toBeGreaterThan(0);

      // Check that at least one enemy has Diablo II bossMods
      let hasBossMods = false;
      for (let i = 3; i < sim.count; i++) {
        const mods = sim.cb.bossMods[i];
        if (mods && mods.length > 0) {
          hasBossMods = true;
          // Valid D2R affixes
          for (const m of mods) {
            if (m !== 'champion') {
              expect(D2R_BOSS_MODS.includes(m as any)).toBe(true);
            }
          }
        }
      }
      expect(hasBossMods).toBe(true);
    });

    it('applyDynamicSessionRespawn is 100% deterministic for the same session seed', () => {
      const makeRun = (seed: number) => {
        const map = mockMap(32, 32);
        const teams = [0, 1, 1, 1];
        const kinds = [Kind.Hero, Kind.Gnoll, Kind.Imp, Kind.Imp];
        const sim = new Sim(map, 1, teams, { kinds, combat: true });
        createHero(sim, 0, 0, false, 1);
        const scenario: Scenario = {
          teams,
          kinds,
          tiles: [[2, 2], [10, 10], [11, 10], [10, 11]],
          packs: [{ ids: [1, 2, 3], x: 10.5, y: 10.5, hunting: false, calm: 0 }],
        };
        for (let i = 0; i < teams.length; i++) sim.place(i, scenario.tiles[i][0], scenario.tiles[i][1]);

        applyDynamicSessionRespawn(sim, scenario, seed, 'fen', 1);
        return {
          mods: [...sim.cb.bossMods[1]],
          family: sim.cb.family[1],
          tier: sim.cb.tier[1],
          x: sim.x[1],
          y: sim.y[1],
        };
      };

      const runA1 = makeRun(424242);
      const runA2 = makeRun(424242);
      expect(runA1).toEqual(runA2);

      const runB = makeRun(848484);
      // Different seed produces different mutations
      expect(runA1.x !== runB.x || runA1.y !== runB.y || runA1.mods[0] !== runB.mods[0]).toBe(true);
    });
  });

  describe('Phase 3: Connected World Exits & Waypoint Travel', () => {
    it('ensureConnectedWorldExits synthesizes gates and roads between connected zones', () => {
      const doc: MapDoc = {
        format: 'thornvael-map',
        version: 2,
        name: 'Thornwick Market',
        w: 32,
        h: 32,
        terrain: [32 * 32, 0],
        height: [32 * 32, 1],
        objects: [],
        units: [{ kind: Kind.Hero, team: 0, x: 5, y: 5 }],
        regions: [],
        players: ['You'],
        triggers: [],
        text: {},
      };

      // Town Hub exit to first wilderness mission
      const townExits = ensureConnectedWorldExits(doc, CAMPAIGN_MOCK, 'town-thornwick');
      expect(townExits.length).toBeGreaterThan(0);
      expect(townExits[0].kind).toBe('gate');
      expect(townExits[0].targetMap).toBe('ford');

      // Wilderness Mission exits (backward to town, forward to next mission)
      const wildDoc = { ...doc, name: 'Blood at the Ford' };
      const wildExits = ensureConnectedWorldExits(wildDoc, CAMPAIGN_MOCK, 'm01-blood-at-the-ford');
      expect(wildExits.length).toBeGreaterThanOrEqual(2);
      // Backward exit to Town
      expect(wildExits[0].targetMap).toBe('market');
      expect(wildExits[0].label).toContain('Thornwick');
      // Forward exit to Whispers in the Fen
      expect(wildExits[1].targetMap).toBe('fen');
    });

    it('WaypointTravelModal lists unlocked waypoints for the current Act and invokes travel callback', () => {
      const rec = newRecord(CAMPAIGN_MOCK, { cls: 0, female: false }, 1);
      rec.progress.waypoints = ['town-thornwick', 'm02-whispers-in-the-fen'];

      const modal = new WaypointTravelModal();
      const onTravel = vi.fn();
      const onClose = vi.fn();

      modal.open({
        campaign: CAMPAIGN_MOCK,
        rec,
        currentAct: 1,
        currentNodeId: 'town-thornwick',
        onTravel,
        onClose,
      });

      expect(modal.isOpen).toBe(true);
      const root = document.getElementById('waypoint-modal')!;
      expect(root.hidden).toBe(false);

      const buttons = root.querySelectorAll('.waypoint-btn');
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // Current node is disabled
      const currentBtn = root.querySelector('.current') as HTMLButtonElement;
      expect(currentBtn).not.toBeNull();
      expect(currentBtn.disabled).toBe(true);

      // Destination waypoint is clickable
      const destBtn = Array.from(buttons).find((b) => (b as HTMLElement).textContent?.includes('Whispers in the Fen')) as HTMLButtonElement;
      expect(destBtn).toBeDefined();
      expect(destBtn.disabled).toBe(false);

      destBtn.click();
      expect(onTravel).toHaveBeenCalled();
      expect(onTravel.mock.calls[0][0].id).toBe('m02-whispers-in-the-fen');
      expect(modal.isOpen).toBe(false);
    });
  });
});
