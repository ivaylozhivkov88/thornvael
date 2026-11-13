import { describe, expect, it } from 'vitest';
import { CombatFeelSystem } from '../src/feel';

describe('CombatFeelSystem (Milestone 1)', () => {
  it('handles screen shake with trauma decay and quadratic intensity', () => {
    const feel = new CombatFeelSystem(32, 32);
    expect(feel.shakeX).toBe(0);
    expect(feel.shakeY).toBe(0);

    feel.addTrauma(0.5);
    feel.update(0.016, 1000, 0, 0, 1);
    expect(feel.shakeX).not.toBe(0);
    expect(feel.shakeY).not.toBe(0);

    // Over-trauma clamps to 1.0
    feel.addTrauma(2.0);
    feel.update(0.016, 1016, 0, 0, 1);

    // After enough decay, shake returns to 0
    feel.update(1.0, 2016, 0, 0, 1);
    feel.update(0.016, 2032, 0, 0, 1);
    expect(feel.shakeX).toBe(0);
    expect(feel.shakeY).toBe(0);
  });

  it('triggers and queries hit-stop micro-freeze duration', () => {
    const feel = new CombatFeelSystem(32, 32);
    expect(feel.isFrozen(1000)).toBe(false);

    feel.triggerHitStop(45, 1000);
    expect(feel.isFrozen(1020)).toBe(true);
    expect(feel.isFrozen(1040)).toBe(true);
    expect(feel.isFrozen(1055)).toBe(false);
  });

  it('spawns directional blood, sparks, slashes, and status bubbles', () => {
    const feel = new CombatFeelSystem(32, 32);

    feel.spawnBlood(100, 100, 1, 0, 5);
    feel.spawnSparks(100, 100, 0xffd700, 8);
    feel.spawnSlash(100, 100, Math.PI / 4, false);
    feel.spawnSlash(100, 100, Math.PI / 4, true); // crit cross-slash
    feel.spawnPoisonBubbles(100, 100, 3);
    feel.spawnBurnEmbers(100, 100, 3);

    expect(feel.slashGraphics.blendMode).toBe('add');
    expect(feel.auraGraphics.blendMode).toBe('add');

    // Update steps through particle lifecycles cleanly without throwing
    feel.update(0.05, 1050, 0, 0, 1);
    feel.update(0.5, 1550, 0, 0, 1);
  });

  it('adds styled damage floaters with crit popping', () => {
    const feel = new CombatFeelSystem(32, 32);
    feel.addDamageFloater('45!', 100, 100, 0xffd700, true, false, 1000);
    feel.addDamageFloater('-22', 100, 100, 0xff4444, false, true, 1000);

    feel.update(0.05, 1050, 0, 0, 1);
    expect(feel.isFrozen(1030)).toBe(true);
  });
});
