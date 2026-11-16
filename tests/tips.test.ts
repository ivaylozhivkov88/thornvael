import { describe, expect, it } from 'vitest';
import { Tips } from '../src/tips';

function mem(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('first-time tips', () => {
  it('shows each tip once and persists', () => {
    const s = mem();
    const a = new Tips(s);
    expect(a.once('lowHp')).toBe(true);
    expect(a.once('lowHp')).toBe(false);
    expect(new Tips(s).once('lowHp')).toBe(false);
    expect(new Tips(s).once('firstLoot')).toBe(true);
  });
  it('survives broken or missing storage', () => {
    const s = mem();
    s.data.set('thornvael.tips', '{bad');
    expect(new Tips(s).once('firstSpell')).toBe(true);
    const t = new Tips({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } });
    expect(t.once('lowHp')).toBe(true);
    expect(new Tips(null).once('lowHp')).toBe(true);
  });
});
