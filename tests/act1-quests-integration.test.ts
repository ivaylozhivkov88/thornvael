import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';
import { grantSteppedQuestRewards } from '../src/sidequests-rewards';
import type { SteppedQuestDef } from '../src/sidequests';
import { SAVE_VERSION, migrateSave, type SaveFile } from '../src/save';
import { parseCampaign } from '../src/campaign';
import { afterMission, newRecord, nodeUrl } from '../src/flow';
import { loadDoc } from '../src/mapdoc';
import { missionFromName } from '../src/mission';
import { createMission } from '../src/mission-runtime';
import { createHero } from '../src/sim/hero';
import { Kind } from '../src/sim/combat';
import { Sim } from '../src/sim/sim';
import type { GameMap } from '../src/map';

interface RawQuest extends SteppedQuestDef {
  act?: number;
  town?: string;
  unlocks_after?: string;
}

function isAct1Quest(q: RawQuest): boolean {
  return (
    q.act === 1 ||
    q.town === 'town-thornwick' ||
    Boolean(q.unlocks_after && /^m(0[1-9]|10|11)\b/.test(q.unlocks_after)) ||
    /^sq-m(0[1-9]|10|11)\b/.test(q.id)
  );
}

describe('Act 1 SteppedQuestAdapter integration', () => {
  it('drives all 22 Act 1 quests to completion through adapter hooks and survives save migration', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', 'side-quests.json'), 'utf8'),
    ) as RawQuest[];
    const act1 = raw.filter(isAct1Quest);
    expect(act1.length).toBeGreaterThanOrEqual(6);

    const adapter = new SteppedQuestAdapter(act1);
    for (const q of act1) {
      for (const step of q.steps ?? []) {
        const t = step.trigger.type;
        const ref = step.trigger.ref;
        if (t === 'talk_npc') {
          adapter.onTalkNpc(ref);
        } else if (t === 'collect_item') {
          adapter.onCollectItem(ref, step.count ?? 1);
        } else if (t === 'kill_count') {
          adapter.onKillFamily(ref, step.count ?? 1);
        } else if (t === 'escort_safe') {
          adapter.onEscortSafe(ref);
        } else if (t === 'dialogue_choice') {
          adapter.onDialogueChoice(ref, 0);
        }
      }
      expect(adapter.isCompleted(q.id)).toBe(true);
    }

    const saved = adapter.save();
    const restored = new SteppedQuestAdapter(act1, saved);
    for (const q of act1) {
      expect(restored.isCompleted(q.id)).toBe(true);
    }

    const fakeSave: SaveFile = {
      format: 'thornvael-save',
      saveVersion: 5,
      gameVersion: 'test',
      createdAt: Date.now(),
      name: 'test',
      label: 'test',
      state: {
        doc: {} as SaveFile['state']['doc'],
        seed: 1,
        snap: {} as SaveFile['state']['snap'],
        ai: [],
        ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] },
        steppedQuests: saved,
      },
    };
    const migrated = migrateSave(fakeSave);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.state.steppedQuests).toEqual(saved);
  });

  it('loads all 22 Act 1 stepped quests across all 4 files and grants gold, XP, and unique item rewards', () => {
    const allDefs: RawQuest[] = [];
    for (const f of ['side-quests.json', 'side-quests-2.json', 'side-quests-3.json', 'side-quests-4.json']) {
      const chunk = JSON.parse(
        readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', f), 'utf8'),
      ) as RawQuest[];
      allDefs.push(...chunk);
    }
    const act1Defs = allDefs.filter((q) => q.act === 1);
    expect(act1Defs).toHaveLength(22);

    const w = 16;
    const h = 16;
    const map: GameMap = {
      w,
      h,
      terrain: new Uint8Array(w * h),
      height: new Uint8Array(w * h),
      blocked: new Uint8Array(w * h),
      objects: [],
      light: new Uint8Array(w * h).fill(200),
    };
    const sim = new Sim(map, 1, [0], { kinds: [Kind.Hero] });
    createHero(sim, 0, 0, false, 1);
    const startGold = sim.cb.gold[0] ?? 0;
    const startXp = sim.hero!.xp ?? 0;
    const startItems = sim.hero!.inv.filter((s) => s.item >= 0 && s.n > 0).length;

    const toasts: string[] = [];
    const adapter = new SteppedQuestAdapter(allDefs);
    adapter.setOnAdvance((res) => {
      grantSteppedQuestRewards(sim, res, (m) => toasts.push(m));
    });

    adapter.onTalkNpc('npc-garrick-captain');
    adapter.onKillFamily('briar-hound', 12);
    adapter.onCollectItem('Weighted Tariff Strongbox', 1);
    adapter.onDialogueChoice('npc-garrick-captain', 0);
    adapter.onTalkNpc('npc-garrick-captain');

    expect(adapter.isCompleted('sq01-tollhouse-audit')).toBe(true);
    expect(sim.cb.gold[0] ?? 0).toBeGreaterThanOrEqual(startGold + 250);
    expect(sim.hero!.xp ?? 0).toBeGreaterThan(startXp);
    expect(sim.hero!.inv.filter((s) => s.item >= 0 && s.n > 0).length).toBeGreaterThan(startItems);
    expect(toasts.some((t) => t.includes('Quest Reward'))).toBe(true);

    // Escort hook progresses sq03-broken-picket and sq28-broken-axle-on-alder-road
    expect(adapter.getPendingEscortTargets()).toContain('field-border-peddler');
    adapter.onEscortSafe('field-border-peddler');
    adapter.onKillFamily('quill-fiend', 10);
    expect(adapter.getPendingEscortTargets()).toContain('field-ravenwatch-runner');
    adapter.onEscortSafe('field-ravenwatch-runner');
    adapter.onTalkNpc('npc-garrick-captain');
    expect(adapter.isCompleted('sq03-broken-picket')).toBe(true);
    expect(adapter.isCompleted('sq28-broken-axle-on-alder-road')).toBe(true);
  });

  it('keeps Thornwick free of enemy units, routes town-thornwick to thornwick-market, prevents m01 skip, and places Morvessa in m11', () => {
    const act1World = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'worlds', 'act1-world.map.json'), 'utf8'),
    ) as { units: Array<{ team: number; x: number; y: number; family?: string; bossMods?: string[] }> };
    const enemiesInThornwick = act1World.units.filter((u) => u.team === 1 && u.x <= 55 && u.y <= 43);
    expect(enemiesInThornwick).toHaveLength(0);
    const act1Morvessa = act1World.units.find((u) => u.family === 'morvessa');
    expect(act1Morvessa).toBeDefined();
    expect(act1Morvessa?.bossMods?.length).toBeGreaterThanOrEqual(2);

    const m11Raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'missions', 'm11-ashbrook-retreat.map.json'), 'utf8'),
    ) as { units: Array<{ family?: string; bossMods?: string[] }> };
    const m11Morvessa = m11Raw.units.find((u) => u.family === 'morvessa');
    expect(m11Morvessa).toBeDefined();
    expect(m11Morvessa?.bossMods?.length).toBeGreaterThanOrEqual(2);

    const game = createMission(loadDoc(m11Raw), 77);
    expect(game.directors?.bosses.some((b) => b.encounter.bossId === 'morvessa')).toBe(true);

    const camp = parseCampaign(
      JSON.parse(readFileSync(resolve(__dirname, '..', 'public', 'data', 'campaign.json'), 'utf8')),
    );
    const townNode = camp.nodes.find((n) => n.id === 'town-thornwick')!;
    expect(nodeUrl(townNode)).toBe('./?mission=thornwick-market&campaign=town-thornwick');
    expect(missionFromName('thornwick-market').doc.name).toBe('Thornwick Market');

    const rec = newRecord(camp, { cls: 0, female: false }, 1);
    const wonM01 = afterMission(camp, rec, 'm01-blood-at-the-ford', true, null, { text: '', up: 1, size: 1, gold: 0 });
    expect(wonM01.progress.unlocked).toContain('town-thornwick');
    expect(wonM01.progress.unlocked).toContain('m02-whispers-in-the-fen');
    expect(wonM01.progress.unlocked).not.toContain('m12-redmarsh-border');
  });
});
