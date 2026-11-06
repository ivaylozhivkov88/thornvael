import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, readPreferences, writePreference } from '../src/preferences';

describe('player preferences across page navigation', () => {
  const store = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  };
  it('keeps first-run defaults and reads the existing quality key', () => {
    const disk = store();
    expect(readPreferences(disk)).toEqual(DEFAULT_PREFERENCES);
    disk.setItem('thornvael.quality', '0');
    expect(readPreferences(disk).quality).toBe(0);
  });
  it('keeps independent sound/music/quality choices after a new reader is created', () => {
    const disk = store();
    expect(writePreference('sound', false, disk)).toBe(true);
    writePreference('music', true, disk);
    writePreference('quality', 1, disk);
    expect(readPreferences(disk)).toEqual({ sound: false, music: true, quality: 1 });
  });
  it('rejects corrupt booleans and nonintegral/out-of-range quality without losing other valid choices', () => {
    for (const bad of ['NaN', '', '1.5', '-1', '3', 'Infinity']) {
      const disk = store();
      disk.setItem('thornvael.quality', bad);
      disk.setItem('thornvael.sound', 'yes');
      disk.setItem('thornvael.music', 'true');
      expect(readPreferences(disk)).toEqual({ sound: true, music: true, quality: 2 });
    }
    for (const quality of [NaN, 1.5, -1, 3, Infinity]) expect(writePreference('quality', quality, store())).toBe(false);
  });
  it('continues safely when reading or writing storage is denied', () => {
    const denied = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('full'); } };
    expect(readPreferences(denied)).toEqual(DEFAULT_PREFERENCES);
    expect(writePreference('sound', false, denied)).toBe(false);
  });
});
