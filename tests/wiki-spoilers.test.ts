import { beforeAll, describe, expect, it } from 'vitest';
import { computeSpoilerProgress, isGateSpoiled } from '../src/wiki/spoilers';
import { parseHash } from '../src/wiki/router';
import { searchEntries } from '../src/wiki/SearchBar';
import { loadWikiIndex, WIKI_INDEX } from '../src/wiki/dataLoader';

beforeAll(async () => {
  await loadWikiIndex();
});

describe('wiki spoiler protection', () => {
  const acts = { m01: 1, m05: 1, m12: 2, m24: 3, m36: 4 };

  it('shows everything when no save exists in IndexedDB', () => {
    const prog = computeSpoilerProgress(null, null, null, null, acts);
    expect(prog.hasSave).toBe(false);
    expect(isGateSpoiled({ a: 4 }, true, prog, acts)).toBe(false);
    expect(isGateSpoiled({ m: 'm36' }, true, prog, acts)).toBe(false);
  });

  it('gates higher acts and unreached missions when Hide spoilers is ON', () => {
    const chars = { v: 1, list: [{ id: 'c1', name: 'Dain', cls: 0, level: 2, played: 0 }] };
    const camp = { progress: { unlocked: ['m01-blood-at-the-ford'], completed: [], node: 'm01-blood-at-the-ford' } };
    const prog = computeSpoilerProgress(chars, camp, null, 'c1', acts);
    expect(prog.hasSave).toBe(true);
    expect(prog.maxAct).toBe(1);
    expect(prog.heroLabel).toContain('Dain');

    expect(isGateSpoiled({ m: 'm01' }, true, prog, acts)).toBe(false);
    expect(isGateSpoiled({ a: 1 }, true, prog, acts)).toBe(false);
    expect(isGateSpoiled({ m: 'm05' }, true, prog, acts)).toBe(true);
    expect(isGateSpoiled({ a: 2 }, true, prog, acts)).toBe(true);
    expect(isGateSpoiled({ a: 4 }, true, prog, acts)).toBe(true);

    // Toggling Hide spoilers OFF shows everything
    expect(isGateSpoiled({ a: 4 }, false, prog, acts)).toBe(false);
    expect(isGateSpoiled({ m: 'm05' }, false, prog, acts)).toBe(false);
  });
});

describe('wiki hash router & search', () => {
  it('parses category, article, search, and home hash routes', () => {
    expect(parseHash('')).toEqual({ kind: 'home' });
    expect(parseHash('#/home')).toEqual({ kind: 'home' });
    expect(parseHash('#/bestiary')).toEqual({ kind: 'category', cat: 'bestiary', entryType: 'bestiary' });
    expect(parseHash('#/bestiary/gnoll')).toEqual({ kind: 'article', entryType: 'bestiary', id: 'gnoll' });
    expect(parseHash('#/search?q=hollow')).toEqual({ kind: 'search', query: 'hollow' });
  });

  it('finds matching entries for creature and item queries', () => {
    const skel = searchEntries(WIKI_INDEX.entries, 'skeleton');
    expect(skel.length).toBeGreaterThan(0);
    const hollow = searchEntries(WIKI_INDEX.entries, 'hollow');
    expect(hollow.some((e) => e.id === 'hollow-knight')).toBe(true);
  });
});
