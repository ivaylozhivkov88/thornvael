import { describe, expect, it } from 'vitest';
import {
  FX_PRESETS,
  FxEngine,
  FxPool,
  RARITY_COLORS,
  SPELL_SCHOOL_PALETTES,
  createFxConfig,
  getDeathArchetype,
  getHitMaterialForFamily,
  getSpellSchoolPalette,
  resolveFootstepSurface,
} from '../src/fx';

describe('FxPool (zero-allocation & strict cap)', () => {
  it('reuses pre-allocated objects and evicts oldest on overflow', () => {
    let allocations = 0;
    const pool = new FxPool<{ id: number }>(
      4,
      () => {
        allocations++;
        return { id: -1 };
      },
      (item) => {
        item.id = -1;
      },
    );

    expect(allocations).toBe(4);

    const a = pool.acquire()!;
    a.id = 1;
    const b = pool.acquire()!;
    b.id = 2;
    const c = pool.acquire()!;
    c.id = 3;
    const d = pool.acquire()!;
    d.id = 4;

    expect(pool.activeCount).toBe(4);

    // Overflowing should evict `a` (oldest) and reuse its exact object reference
    const e = pool.acquire()!;
    expect(pool.activeCount).toBe(4);
    expect(e).toBe(a);
    expect(allocations).toBe(4);
  });

  it('enforces dynamic setCap by evicting oldest active items', () => {
    const pool = new FxPool<{ val: number }>(
      10,
      () => ({ val: 0 }),
      (item) => {
        item.val = 0;
      },
    );

    for (let i = 1; i <= 6; i++) {
      const item = pool.acquire()!;
      item.val = i;
    }
    expect(pool.activeCount).toBe(6);

    pool.setCap(3);
    expect(pool.activeCount).toBe(3);

    const remaining: number[] = [];
    pool.forEachActive((item) => remaining.push(item.val));
    expect(remaining.sort((x, y) => x - y)).toEqual([4, 5, 6]);
  });
});

describe('FX Config & Accessibility (low-end & reducedMotion)', () => {
  it('applies strict mobile caps in low quality mode', () => {
    const cfg = createFxConfig({ quality: 'low', reducedMotion: false });
    expect(cfg.maxParticles).toBe(FX_PRESETS.low.maxParticles);
    expect(cfg.maxDecals).toBe(FX_PRESETS.low.maxDecals);
    expect(cfg.maxBeams).toBe(FX_PRESETS.low.maxBeams);
    expect(cfg.footstepsEnabled).toBe(false);
  });

  it('disables shake, hit-stop, slow-mo, and footsteps when reducedMotion is true', () => {
    const cfg = createFxConfig({ quality: 'high', reducedMotion: true });
    expect(cfg.hitStopEnabled).toBe(false);
    expect(cfg.hitStopMaxFrames).toBe(0);
    expect(cfg.shakeEnabled).toBe(false);
    expect(cfg.slowMoEnabled).toBe(false);
    expect(cfg.footstepsEnabled).toBe(false);
    expect(cfg.maxParticles).toBeLessThanOrEqual(48);
  });
});

describe('A1 — HitFeedbackSystem', () => {
  it('triggers 2-4 frame hit-stop on heavy/crit hits and 0 when reducedMotion', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const critRes = engine.hitFeedback.onHit({
      x: 100,
      y: 100,
      damage: 40,
      maxHp: 100,
      isCrit: true,
      unitId: 7,
      family: 'briar-hound',
    });
    expect(critRes.hitStopFrames).toBeGreaterThanOrEqual(2);
    expect(critRes.hitStopFrames).toBeLessThanOrEqual(4);
    expect(engine.hitFeedback.stepHitStopFrame()).toBe(true);

    engine.setReducedMotion(true);
    const rmRes = engine.hitFeedback.onHit({
      x: 100,
      y: 100,
      damage: 80,
      maxHp: 100,
      isCrit: true,
      unitId: 7,
      family: 'briar-hound',
    });
    expect(rmRes.hitStopFrames).toBe(0);
    expect(engine.hitFeedback.getShake().trauma).toBe(0);
  });

  it('scales screen shake with damage, decays over time, and tracks white-flash timers', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    engine.hitFeedback.onHit({ x: 50, y: 50, damage: 50, maxHp: 100, unitId: 42 });

    const initialShake = engine.hitFeedback.getShake();
    expect(initialShake.trauma).toBeGreaterThan(0.2);
    expect(engine.hitFeedback.isFlashing(42)).toBe(true);
    expect(engine.hitFeedback.getFlashIntensity(42)).toBeGreaterThan(0.9);

    engine.update(16);
    const afterFrame = engine.hitFeedback.getShake();
    expect(Math.hypot(afterFrame.x, afterFrame.y)).toBeGreaterThan(0);

    engine.update(500);
    expect(engine.hitFeedback.getShake().trauma).toBeLessThan(initialShake.trauma);
    expect(engine.hitFeedback.isFlashing(42)).toBe(false);
  });

  it('emits distinct particle materials per enemy family and enforces particle cap', () => {
    expect(getHitMaterialForFamily('briar-hound')).toBe('blood');
    expect(getHitMaterialForFamily('hollow-knight')).toBe('bone');
    expect(getHitMaterialForFamily('cinderling')).toBe('ash');
    expect(getHitMaterialForFamily('basalt-brute')).toBe('spark');
    expect(getHitMaterialForFamily('dune-scarab')).toBe('ichor');
    expect(getHitMaterialForFamily('mire-wisp')).toBe('ectoplasm');

    const lowEngine = new FxEngine({ quality: 'low', reducedMotion: false });
    for (let i = 0; i < 40; i++) {
      lowEngine.hitFeedback.emitDirectionalBurst(10, 10, 1, 0, 'hollow-knight', 10);
    }
    expect(lowEngine.hitFeedback.particles.activeCount).toBeLessThanOrEqual(FX_PRESETS.low.maxParticles);
  });

  it('computes crit pop floater curve overshoot and flattens on reducedMotion', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const pop = engine.hitFeedback.evaluateFloaterCurve(0.18, true);
    const normal = engine.hitFeedback.evaluateFloaterCurve(0.18, false);
    expect(pop.scale).toBeGreaterThan(1.3);
    expect(normal.scale).toBe(1);

    engine.setReducedMotion(true);
    const rmPop = engine.hitFeedback.evaluateFloaterCurve(0.18, true);
    expect(rmPop.scale).toBe(1);
  });
});

describe('A2 — DeathFxSystem', () => {
  it('routes skeleton, beast, caster, and boss deaths to distinct archetypes', () => {
    expect(getDeathArchetype('hollow-knight')).toBe('skeleton');
    expect(getDeathArchetype('briar-hound')).toBe('beast');
    expect(getDeathArchetype('witch-doctor')).toBe('caster');
    expect(getDeathArchetype('morvessa')).toBe('boss');

    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    engine.deathFx.onUnitDeath(100, 100, 'hollow-knight');
    expect(engine.deathFx.bones.activeCount).toBeGreaterThan(0);

    engine.deathFx.onUnitDeath(120, 120, 'witch-doctor');
    expect(engine.deathFx.motes.activeCount).toBeGreaterThan(0);

    const boss = engine.deathFx.onUnitDeath(200, 200, 'ashkarath', true);
    expect(boss.bossResult?.slowMoActive).toBe(true);
    expect(boss.bossResult?.timeScale).toBeLessThan(1);
    expect(boss.bossResult?.fountain.length).toBeGreaterThan(0);
    expect(engine.hitFeedback.getShake().trauma).toBeGreaterThan(0.5);
  });

  it('caps corpse decals on low quality and fades them out over time', () => {
    const engine = new FxEngine({ quality: 'low', reducedMotion: false });
    for (let i = 0; i < 50; i++) {
      engine.deathFx.onUnitDeath(i * 10, 50, 'briar-hound');
    }
    expect(engine.deathFx.decals.activeCount).toBe(FX_PRESETS.low.maxDecals);

    // Advance past fadeAfterMs + fadeDurationMs (5000 + 2000)
    engine.update(7500);
    expect(engine.deathFx.decals.activeCount).toBe(0);
  });
});

describe('A3 — FootstepSystem', () => {
  it('emits surface-specific footsteps by stride distance and suppresses in low/reducedMotion', () => {
    expect(resolveFootstepSurface('desert')).toBe('sand');
    expect(resolveFootstepSurface('highlands')).toBe('snow');
    expect(resolveFootstepSurface('marsh')).toBe('marsh');
    expect(resolveFootstepSurface('volcanic')).toBe('volcanic');
    expect(resolveFootstepSurface('crypt')).toBe('crypt');

    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    expect(engine.footsteps.recordMove(1, 0, 0, 10, 0, 'desert')).toBe(false);
    expect(engine.footsteps.recordMove(1, 25, 0, 15, 0, 'desert')).toBe(true);
    expect(engine.footsteps.footsteps.activeCount).toBe(1);

    let kind = '';
    engine.footsteps.footsteps.forEachActive((f) => {
      kind = f.kind;
    });
    expect(kind).toBe('puff');

    engine.setQuality('low');
    expect(engine.footsteps.recordMove(1, 60, 0, 30, 0, 'volcanic')).toBe(false);
  });
});

describe('A4 — SpellVfxSystem', () => {
  it('provides distinct school palettes, additive glows, and transient ground light bursts', () => {
    const fire = getSpellSchoolPalette('fire');
    const frost = getSpellSchoolPalette('frost');
    const arcane = getSpellSchoolPalette('arcane');
    const shadow = getSpellSchoolPalette('shadow');
    const holy = getSpellSchoolPalette('holy');

    expect(fire.primary).toBe(SPELL_SCHOOL_PALETTES.fire.primary);
    expect(frost.primary).toBe(SPELL_SCHOOL_PALETTES.frost.primary);
    expect(arcane.primary).toBe(SPELL_SCHOOL_PALETTES.arcane.primary);
    expect(shadow.primary).toBe(SPELL_SCHOOL_PALETTES.shadow.primary);
    expect(holy.primary).toBe(SPELL_SCHOOL_PALETTES.holy.primary);
    expect(getSpellSchoolPalette(1).school).toBe('fire');
    expect(getSpellSchoolPalette(2).school).toBe('frost');

    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const glow = engine.spellVfx.createGlowDescriptor(100, 120, 'arcane', 32);
    expect(glow.blendMode).toBe('add');
    expect(glow.color).toBe(arcane.glow);

    const burst = engine.spellVfx.emitGroundLightBurst(100, 120, 'fire', 60, 250);
    expect(burst).not.toBeNull();
    engine.update(100);
    expect(burst!.currentRadius).toBeGreaterThan(burst!.startRadius);
    engine.update(200);
    expect(engine.spellVfx.lightBursts.activeCount).toBe(0);
  });
});

describe('A9 — CursorTargetSystem', () => {
  it('transitions cursor states, emits click ripples, and colors hover outlines by rarity', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });

    expect(engine.cursorTarget.updateHover({ kind: 'enemy', unitId: 5, enemyRank: 'boss' }).state).toBe('attack');
    expect(engine.cursorTarget.getHoverOutline()?.thickness).toBe(3);

    expect(engine.cursorTarget.updateHover({ kind: 'loot', lootId: 'b1', rarity: 'unique' }).state).toBe('pickup');
    expect(engine.cursorTarget.getHoverOutline()?.color).toBe(RARITY_COLORS.unique);

    expect(engine.cursorTarget.updateHover({ kind: 'npc', unitId: 9 }).state).toBe('talk');
    expect(engine.cursorTarget.updateHover({ kind: 'blocked' }).state).toBe('blocked');

    const ripple = engine.cursorTarget.emitClickRipple(200, 300, 'move');
    expect(ripple).not.toBeNull();
    expect(engine.cursorTarget.ripples.activeCount).toBe(1);
    engine.update(400);
    expect(engine.cursorTarget.ripples.activeCount).toBe(0);
  });
});

describe('A10 — LootDropSystem', () => {
  it('solves parabolic bounce arcs, spawns beams only for rare/set/unique, emits pings, and filters', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });

    const normalDrop = engine.lootDrop.spawnDrop('n1', 100, 100, 'normal');
    const uniqueDrop = engine.lootDrop.spawnDrop('u1', 120, 120, 'unique');

    expect(engine.lootDrop.beams.activeCount).toBe(1);
    const pings = engine.lootDrop.drainPingEvents();
    expect(pings.length).toBe(1);
    expect(pings[0].id).toBe('u1');
    expect(pings[0].rarity).toBe('unique');

    // Step simulation to verify parabolic rise, bounce, and eventual settle
    engine.update(50);
    expect(uniqueDrop.z).toBeGreaterThan(6);

    for (let i = 0; i < 60; i++) {
      engine.update(33);
    }
    expect(normalDrop.settled).toBe(true);
    expect(uniqueDrop.settled).toBe(true);
    expect(uniqueDrop.z).toBe(0);
    expect(uniqueDrop.bounceCount).toBeGreaterThanOrEqual(1);

    // Loot filter toggle
    expect(engine.lootDrop.getFilter()).toBe('all');
    expect(engine.lootDrop.isRarityVisible('normal')).toBe(true);
    engine.lootDrop.toggleFilter('rare+');
    expect(engine.lootDrop.isRarityVisible('normal')).toBe(false);
    expect(engine.lootDrop.isRarityVisible('magic')).toBe(false);
    expect(engine.lootDrop.isRarityVisible('rare')).toBe(true);
    expect(engine.lootDrop.isRarityVisible('unique')).toBe(true);
  });
});
