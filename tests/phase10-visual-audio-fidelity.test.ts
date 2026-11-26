import { describe, expect, it, vi, } from 'vitest';
import {
  classifyHeroWeapon,
  getHeroWeaponVisual,
  FAMILY_VISUALS,
} from '../src/render';
import { CombatFeelSystem } from '../src/feel';
import { VfxSystem } from '../src/vfx';
import {
  playShieldBlock,
  playFleshHit,
  playGoldPickup,
  playMonsterDeath,
  playPotionGulp,
  setMusic,
  startDarkFantasyAtmosphere,
  stopDarkFantasyAtmosphere,
  isDarkFantasyAtmosphereActive,
} from '../src/audio';

describe('Phase 10: ARPG Visual & Audio Landscape', () => {
  describe('Hero Weapon Classification & Overlays', () => {
    it('classifies item definitions correctly for equipment visual reflections', () => {
      expect(classifyHeroWeapon({ name: 'Broadsword', kind: 0 } as any)).toBe('sword');
      expect(classifyHeroWeapon({ name: 'War Axe', kind: 0 } as any)).toBe('axe');
      expect(classifyHeroWeapon({ name: 'Oak Staff', kind: 0 } as any)).toBe('staff');
      expect(classifyHeroWeapon({ name: 'Longbow', kind: 0 } as any)).toBe('bow');
      expect(classifyHeroWeapon(undefined)).toBe('sword');
    });

    it('maintains backwards compatibility for getHeroWeaponVisual', () => {
      expect(getHeroWeaponVisual({ name: 'Staff of Sparks', kind: 0 } as any)).toBe('staff');
      expect(getHeroWeaponVisual({ name: 'Composite Bow', kind: 0 } as any)).toBe('bow');
      expect(getHeroWeaponVisual(undefined)).toBe('sword');
    });
  });

  describe('Monster Gothic Visual Identity & Family Ornaments', () => {
    it('defines distinct silhouettes and 3-layer color harmonies for key monster families', () => {
      const hollowKnight = FAMILY_VISUALS['hollow-knight'];
      expect(hollowKnight).toBeDefined();
      expect(hollowKnight.ornament).toBe('crown');
      expect(hollowKnight.tints.length).toBe(3);

      const gloomStag = FAMILY_VISUALS['gloom-stag'];
      expect(gloomStag).toBeDefined();
      expect(gloomStag.ornament).toBe('antlers');

      const sporeMatron = FAMILY_VISUALS['spore-matron'];
      expect(sporeMatron).toBeDefined();
      expect(sporeMatron.ornament).toBe('astral');

      const basaltBrute = FAMILY_VISUALS['basalt-brute'];
      expect(basaltBrute).toBeDefined();
      expect(basaltBrute.ornament).toBe('forge');
      expect(basaltBrute.scaleX).toBeGreaterThanOrEqual(1.5);
    });

    it('spawns visceral death gore and bone fragments upon unit demise', () => {
      const feel = new CombatFeelSystem(64, 64);
      expect((feel as any).boneFragments.length).toBe(0);

      // Normal monster death gore
      feel.spawnDeathGore(120, 160, false, false);
      expect((feel as any).boneFragments.length).toBeGreaterThan(0);
      expect((feel as any).splatters.length).toBeGreaterThan(0);

      // Champion/Super-unique death gore
      const beforeCount = (feel as any).boneFragments.length;
      feel.spawnDeathGore(200, 240, true, true);
      expect((feel as any).boneFragments.length).toBeGreaterThan(beforeCount);
    });
  });

  describe('Aura Rings & Spell VFX', () => {
    it('initializes and triggers advanced spell effects in VfxSystem', () => {
      const vfx = new VfxSystem();
      vfx.init();

      expect(() => vfx.triggerFireballImpact(150, 200)).not.toThrow();
      expect(() => vfx.triggerFrostNova(200, 200, 80)).not.toThrow();
      const mockSim = { count: 1, x: new Int32Array([100]), y: new Int32Array([100]), team: new Uint8Array([0]), cb: { hp: new Int32Array([100]) } } as any;
      expect(() => vfx.triggerChainLightning(mockSim, 100, 100)).not.toThrow();
    });

    it('renders runic auras with Holy Freeze, Fanaticism, and Conviction style effects', () => {
      const feel = new CombatFeelSystem(64, 64);
      const mockGraphics = {
        clear: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        ellipse: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        closePath: vi.fn().mockReturnThis(),
      };
      (feel as any).auraGraphics = mockGraphics;

      const mockSim = { count: 0, cb: { auras: [] } } as any;
      expect(() => feel.renderAuras(mockSim, performance.now(), 1)).not.toThrow();
    });
  });

  describe('Visceral Audio Synthesis & Dark Fantasy Soundscape', () => {
    it('provides synthesized visceral combat sound functions without throwing', () => {
      expect(typeof playShieldBlock).toBe('function');
      expect(typeof playFleshHit).toBe('function');
      expect(typeof playGoldPickup).toBe('function');
      expect(typeof playMonsterDeath).toBe('function');
      expect(typeof playPotionGulp).toBe('function');

      expect(() => playShieldBlock()).not.toThrow();
      expect(() => playFleshHit()).not.toThrow();
      expect(() => playGoldPickup()).not.toThrow();
      expect(() => playMonsterDeath()).not.toThrow();
      expect(() => playPotionGulp()).not.toThrow();
    });

    it('manages dark fantasy atmosphere synthesizer state', () => {
      const prevWin = (globalThis as { window?: unknown }).window;
      const prevAudioCtx = (globalThis as { AudioContext?: unknown }).AudioContext;
      const prevAudio = (globalThis as { Audio?: unknown }).Audio;
      const node = () => ({
        gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        frequency: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        Q: { value: 1 },
        type: 'sine',
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      });
      class MockAudioContext {
        state = 'running';
        currentTime = 0;
        destination = node();
        resume = vi.fn(async () => undefined);
        createGain = () => node();
        createBiquadFilter = () => node();
        createOscillator = () => node();
        createBufferSource = () => node();
        createBuffer = () => ({ duration: 0 });
      }
      class MockAudio {
        loop = false;
        preload = '';
        volume = 1;
        src = '';
        play = vi.fn(async () => undefined);
        pause = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      }
      if (!prevWin) {
        (globalThis as { window?: unknown }).window = { AudioContext: MockAudioContext };
      } else {
        (prevWin as { AudioContext?: unknown }).AudioContext = MockAudioContext;
      }
      (globalThis as { AudioContext?: unknown }).AudioContext = MockAudioContext;
      (globalThis as { Audio?: unknown }).Audio = MockAudio;
      try {
        setMusic(true);
        stopDarkFantasyAtmosphere();
        expect(isDarkFantasyAtmosphereActive()).toBe(false);
        startDarkFantasyAtmosphere();
        expect(isDarkFantasyAtmosphereActive()).toBe(true);
        stopDarkFantasyAtmosphere();
        expect(isDarkFantasyAtmosphereActive()).toBe(false);
      } finally {
        setMusic(false);
        (globalThis as { AudioContext?: unknown }).AudioContext = prevAudioCtx;
        (globalThis as { Audio?: unknown }).Audio = prevAudio;
        if (!prevWin) delete (globalThis as { window?: unknown }).window;
      }
    });
  });
});
