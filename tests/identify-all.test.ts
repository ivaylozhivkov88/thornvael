import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('shop identify button', () => {
  it('shop UI wires identify_all', () => {
    expect(readFileSync('src/townui.ts', 'utf8')).toContain("this.cmd('identify_all')");
  });
});
