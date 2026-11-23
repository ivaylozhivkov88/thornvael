import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TavernRumor {
  id: string;
  act: 1 | 2;
  town: string;
  truthful: boolean;
  text: string;
}

interface LoadingTip {
  id: string;
  category: string;
  text: string;
}

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

describe('Tavern Rumors & Loading Tips Schema', () => {
  const rumors = JSON.parse(
    readFileSync(resolve(CONTENT_DIR, 'tavern-rumors.json'), 'utf8'),
  ) as TavernRumor[];
  const tips = JSON.parse(
    readFileSync(resolve(CONTENT_DIR, 'loading-tips.json'), 'utf8'),
  ) as LoadingTip[];

  it('contains exactly 60 unique tavern rumors covering Act 1 and Act 2 with false leads', () => {
    expect(rumors).toHaveLength(60);
    const ids = new Set(rumors.map((r) => r.id));
    expect(ids.size).toBe(60);

    const act1 = rumors.filter((r) => r.act === 1);
    const act2 = rumors.filter((r) => r.act === 2);
    expect(act1.length).toBeGreaterThanOrEqual(20);
    expect(act2.length).toBeGreaterThanOrEqual(20);

    const falseLeads = rumors.filter((r) => r.truthful === false);
    const trueLeads = rumors.filter((r) => r.truthful === true);
    expect(falseLeads.length).toBeGreaterThanOrEqual(10);
    expect(trueLeads.length).toBeGreaterThanOrEqual(30);

    for (const r of rumors) {
      expect(typeof r.town).toBe('string');
      expect(r.town.length).toBeGreaterThan(0);
      expect(typeof r.text).toBe('string');
      expect(r.text.trim().length).toBeGreaterThanOrEqual(20);
    }
  });

  it('contains exactly 40 unique short loading tips', () => {
    expect(tips).toHaveLength(40);
    const ids = new Set(tips.map((t) => t.id));
    expect(ids.size).toBe(40);

    for (const t of tips) {
      expect(typeof t.category).toBe('string');
      expect(t.category.length).toBeGreaterThan(0);
      expect(typeof t.text).toBe('string');
      expect(t.text.trim().length).toBeGreaterThanOrEqual(15);
      expect(t.text.trim().length).toBeLessThanOrEqual(140);
    }
  });
});
