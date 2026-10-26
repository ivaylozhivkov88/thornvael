import { describe, expect, it } from 'vitest';
import { MAX_VOICES, MusicDirector, VoiceLimiter, cueFor, spatial } from '../src/audiologic';
import { GestureRecognizer, AIM_OFFSET, reticle } from '../src/input';
import { St } from '../src/sim/spelldata';

describe('voice limit', () => {
  it('never runs more voices than the limit and keeps important sounds', () => {
    const v = new VoiceLimiter();
    for (let i = 0; i < MAX_VOICES; i++) expect(v.request('death', 3, i * 100, 10000).action).toBe('play');
    expect(v.active).toBe(MAX_VOICES);
    expect(v.request('step1', 0, 5000, 100).action).toBe('skip'); // a footstep cannot cut a death
    expect(v.request('nomana', 5, 5000, 100).action).toBe('steal');
    expect(v.active).toBe(MAX_VOICES);
    expect(v.stolen).toBe(1);
  });

  it('rate-limits the same sound so a big battle does not machine-gun it', () => {
    const v = new VoiceLimiter();
    expect(v.request('hit', 1, 0, 100).action).toBe('play');
    expect(v.request('hit', 1, 10, 100).action).toBe('skip');
    expect(v.request('hit', 1, 60, 100).action).toBe('play');
  });

  it('frees finished voices', () => {
    const v = new VoiceLimiter(2);
    v.request('boom', 3, 0, 100);
    v.request('heal', 2, 0, 100);
    expect(v.request('buff', 2, 50, 100).action).not.toBe('play');
    expect(v.request('buff', 2, 200, 100).action).toBe('play');
  });
});

describe('sound cues and space', () => {
  it('maps combat events to sounds and keeps ended statuses and school hits silent', () => {
    expect(cueFor({ type: 0, v: 5, el: 0 })?.name).toBe('hit');
    expect(cueFor({ type: 0, v: 5, el: 1 })).toBeNull();
    expect(cueFor({ type: 9, v: 0, el: 1 })?.name).toBe('cast_fire');
    expect(cueFor({ type: 9, v: 0, el: 5 })?.name).toBe('cast_astral');
    expect(cueFor({ type: 8, v: St.Poison, el: 0 })?.name).toBe('curse');
    expect(cueFor({ type: 8, v: St.Bless, el: 0 })?.name).toBe('buff');
    expect(cueFor({ type: 8, v: St.Poison + 16, el: 0 })).toBeNull();
    expect(cueFor({ type: 12, v: 0, el: 0 })?.name).toBe('bow');
    expect(cueFor({ type: 99, v: 0, el: 0 })).toBeNull();
  });

  it('pans by screen position and fades with distance off screen', () => {
    expect(spatial(400, 300, 800, 600)).toEqual({ pan: 0, gain: 1 });
    expect(spatial(0, 300, 800, 600).pan).toBeLessThan(-0.7);
    expect(spatial(800, 300, 800, 600).pan).toBeGreaterThan(0.7);
    expect(spatial(1200, 300, 800, 600).gain).toBeCloseTo(0.625, 3);
    expect(spatial(1700, 300, 800, 600).gain).toBe(0);
  });

  it('switches to battle music at once and back only after six quiet seconds', () => {
    const m = new MusicDirector();
    expect(m.update(false, 0)).toBe('explore');
    expect(m.update(true, 1000)).toBe('battle');
    expect(m.update(false, 5000)).toBe('battle');
    expect(m.update(false, 8000)).toBe('explore');
  });
});

describe('touch aiming', () => {
  it('the reticle sits above the fingertip and the bottom edge cancels', () => {
    expect(reticle(300, 400, 600)).toEqual({ x: 300, y: 400 - AIM_OFFSET, cancel: false });
    expect(reticle(300, 20, 600).y).toBe(0);
    expect(reticle(300, 560, 600).cancel).toBe(true);
  });

  it('with a spell armed a finger aims and lifting casts; a second finger cancels', () => {
    let aim = true;
    const g = new GestureRecognizer({ boxMode: () => false, additive: () => false, aimMode: () => aim });
    expect(g.down(1, 100, 200, true)).toEqual([{ type: 'aim', phase: 'start', x: 100, y: 200 }]);
    expect(g.move(1, 120, 210)).toEqual([{ type: 'aim', phase: 'move', x: 120, y: 210 }]);
    expect(g.up(1)).toEqual([{ type: 'aim', phase: 'end', x: 120, y: 210 }]);
    expect(g.down(2, 100, 200, true)[0]).toMatchObject({ type: 'aim', phase: 'start' });
    expect(g.down(3, 300, 200, true)[0]).toMatchObject({ type: 'aim', phase: 'cancel' });
    g.up(3);
    g.up(2);
    aim = false;
    expect(g.down(4, 100, 200, true)).toEqual([]); // not armed: normal tap behaviour
    expect(g.up(4)[0]).toMatchObject({ type: 'tap' });
  });

  it('the mouse is not affected by aim mode', () => {
    const g = new GestureRecognizer({ boxMode: () => false, additive: () => false, aimMode: () => true });
    expect(g.down(1, 50, 50, false, 0)).toEqual([]);
    expect(g.up(1)[0]).toMatchObject({ type: 'click' });
  });
});
