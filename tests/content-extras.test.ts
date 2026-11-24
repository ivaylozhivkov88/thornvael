import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTRA_CONTENT_KEYS } from '../src/content-extras';

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

describe('Supplementary Content Packs (A9)', () => {
  it('verifies all 15 extra content JSON packs parse cleanly and are non-empty', () => {
    expect(EXTRA_CONTENT_KEYS).toHaveLength(15);
    for (const key of EXTRA_CONTENT_KEYS) {
      const data = JSON.parse(readFileSync(resolve(CONTENT_DIR, `${key}.json`), 'utf8')) as unknown;
      expect(data).toBeDefined();
      if (Array.isArray(data)) {
        expect(data.length).toBeGreaterThan(0);
      } else {
        expect(Object.keys(data as Record<string, unknown>).length).toBeGreaterThan(0);
      }
    }
  });
});
