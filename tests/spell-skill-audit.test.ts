import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPELLS, Tk } from '../src/sim/spelldata';
import { getSkillTreeForClass } from '../src/skills/trees';
import type { SkillClass } from '../src/skills/types';

const PUBLIC_DIR = resolve(__dirname, '..', 'public');

const SCHOOL_ICON_MAP: Record<number, string> = {
  1: 'school/fire',
  2: 'school/frost',
  3: 'school/arcane',
  4: 'school/earth',
  5: 'school/shadow',
};

describe('Spell & Skill 5-Tier Balance Audit', () => {
  const spellIcons = JSON.parse(
    readFileSync(resolve(PUBLIC_DIR, 'spellicons', 'spellicons.json'), 'utf8'),
  ) as { frames: Record<string, unknown> };
  const spellTexts = JSON.parse(
    readFileSync(resolve(PUBLIC_DIR, 'data', 'content', 'spell-text.json'), 'utf8'),
  ) as { name: string; tooltip?: string; flavor?: string }[];
  const textByName = new Map(spellTexts.map((t) => [t.name, t]));

  it('gives every spell a valid effect handler, icon key, and description', () => {
    const validHandlers = new Set<number>([Tk.Foe, Tk.Ally, Tk.Ground, Tk.Multi, Tk.Self, Tk.Corpse]);
    for (const sp of SPELLS) {
      expect(validHandlers.has(sp.tk), `${sp.name} invalid tk=${sp.tk}`).toBe(true);
      const iconKey = SCHOOL_ICON_MAP[sp.school];
      expect(iconKey, `${sp.name} missing school icon mapping`).toBeDefined();
      expect(spellIcons.frames[iconKey], `${sp.name} missing icon frame ${iconKey}`).toBeDefined();

      const desc = textByName.get(sp.name);
      expect(desc, `${sp.name} missing spell-text entry`).toBeDefined();
      expect((desc!.tooltip ?? '').trim().length, `${sp.name} empty tooltip`).toBeGreaterThan(10);
      expect((desc!.flavor ?? '').trim().length, `${sp.name} empty flavor`).toBeGreaterThan(10);
    }
  });

  it('gives every class (Warrior, Mage, Archer, Necromancer) at least 5 class spells with valid mana/cooldown curves', () => {
    for (const clsMask of [1, 2, 4, 8]) {
      const clsSpells = SPELLS.filter((s) => s.cls === clsMask);
      expect(clsSpells.length, `cls=${clsMask} spell count`).toBeGreaterThanOrEqual(5);
      for (const sp of clsSpells) {
        expect(sp.cost).toBeGreaterThan(0);
        expect(sp.cd).toBeGreaterThan(0);
        expect(sp.cd).toBeLessThanOrEqual(255);
      }
    }
  });

  it('gives every class a coherent 5-tier skill tree (tiers 1..5)', () => {
    const classes: SkillClass[] = ['warrior', 'mage', 'archer', 'necromancer'];
    for (const cls of classes) {
      const tree = getSkillTreeForClass(cls);
      const tiers = new Set(tree.map((n) => n.tier));
      expect(tiers, `${cls} missing tiers`).toEqual(new Set([1, 2, 3, 4, 5]));
      const ids = new Set(tree.map((n) => n.id));
      for (const node of tree) {
        for (const req of node.requires) {
          expect(ids.has(req), `${cls}.${node.id} broken req ${req}`).toBe(true);
        }
      }
    }
  });
});
