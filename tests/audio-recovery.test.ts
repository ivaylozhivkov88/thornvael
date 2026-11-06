import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

class NodeMock {
  gain = { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect() { return this; }
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class ContextMock {
  static all: ContextMock[] = [];
  state = 'suspended';
  destination = new NodeMock();
  currentTime = 0;
  sources: NodeMock[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  constructor() { ContextMock.all.push(this); }
  createGain() { return new NodeMock(); }
  createBufferSource() { const n = new NodeMock(); this.sources.push(n); return n; }
  createBuffer() { return { duration: 0 }; }
  createMediaElementSource() { return new NodeMock(); }
}
class MediaMock {
  static all: MediaMock[] = [];
  paused = true;
  loop = false;
  preload = '';
  crossOrigin = '';
  volume = 1;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  constructor(public src: string) { MediaMock.all.push(this); }
}

let audio: typeof import('../src/audio');
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ContextMock.all = [];
  MediaMock.all = [];
  vi.stubGlobal('window', { AudioContext: ContextMock, setTimeout });
  vi.stubGlobal('Audio', MediaMock);
  vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })));
  audio = await import('../src/audio');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('audio public lifecycle recovery', () => {
  it('does not construct or play anything before the first unlock', async () => {
    audio.resumeAudio(); audio.suspendAudio(); audio.resumeAudio(); audio.play('hit');
    await settle();
    expect(ContextMock.all).toHaveLength(0);
    expect(MediaMock.all).toHaveLength(0);
    expect(audio.audioStats().state).toBe('locked');
  });

  it('preloads the workshop bow and shop entry cues from their own cache URLs', async () => {
    audio.unlock();
    await audio.whenLoaded();
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${import.meta.env.BASE_URL}audio/yew_release_01.m4a`);
    expect(urls).not.toContain(`${import.meta.env.BASE_URL}audio/bow.m4a`);
    expect(urls.filter(url => url === `${import.meta.env.BASE_URL}audio/ledger_latch_01.m4a`)).toHaveLength(1);
  });

  it('handles a rejected resume and retries on a later gesture without recreating', async () => {
    audio.unlock();
    await audio.whenLoaded(); await settle();
    const c = ContextMock.all[0];
    c.state = 'interrupted';
    c.resume.mockRejectedValueOnce(new Error('interrupted'));
    audio.resumeAudio(); await settle();
    expect(c.close).not.toHaveBeenCalled();
    audio.unlock(); await settle();
    expect(c.state).toBe('running');
    expect(ContextMock.all).toHaveLength(1);
  });

  it('coalesces pending resumes and stops a late foreground result after backgrounding', async () => {
    audio.unlock(); await settle();
    const c = ContextMock.all[0];
    const wait = deferred();
    c.state = 'interrupted';
    c.resume.mockImplementationOnce(async () => { await wait.promise; c.state = 'running'; });
    const calls = c.resume.mock.calls.length;
    audio.unlock(); audio.unlock(); audio.resumeAudio();
    expect(c.resume).toHaveBeenCalledTimes(calls + 1);
    audio.suspendAudio(); await settle();
    wait.resolve(); await settle();
    expect(c.state).toBe('suspended');
    expect(MediaMock.all.every(m => m.paused)).toBe(true);
    expect(c.sources.filter(s => s.loop && !s.stop.mock.calls.length)).toHaveLength(0);
  });

  it('waits for a pending suspend before foreground resume and handles suspend rejection', async () => {
    audio.unlock(); await settle();
    const c = ContextMock.all[0];
    const wait = deferred();
    c.suspend.mockImplementationOnce(async () => { await wait.promise; c.state = 'suspended'; });
    audio.suspendAudio(); audio.resumeAudio();
    wait.resolve(); await settle();
    expect(c.state).toBe('running');
    c.suspend.mockRejectedValueOnce(new Error('unavailable'));
    audio.suspendAudio(); await settle(); audio.resumeAudio(); await settle();
    expect(c.state).toBe('running');
  });

  it('does not auto-close an interrupted context whose resume resolves interrupted', async () => {
    audio.unlock(); await settle();
    const c = ContextMock.all[0];
    c.state = 'interrupted'; c.resume.mockResolvedValueOnce(undefined);
    audio.resumeAudio(); await settle();
    expect(c.state).toBe('interrupted');
    expect(c.close).not.toHaveBeenCalled();
    audio.unlock(); await settle();
    expect(c.state).toBe('running');
  });

  it('rebuilds a closed graph on gesture, preserving mute flags and discarding stale decodes', async () => {
    const fetchWait = deferred<{ arrayBuffer: () => Promise<ArrayBuffer> }>();
    vi.mocked(fetch).mockImplementationOnce(() => fetchWait.promise as unknown as Promise<Response>);
    audio.setSfx(false); audio.setAmbience(false); audio.unlock();
    await settle();
    const old = ContextMock.all[0];
    old.state = 'closed'; audio.resumeAudio();
    expect(ContextMock.all).toHaveLength(1);
    audio.unlock(); await audio.whenLoaded(); await settle();
    const current = ContextMock.all[1];
    fetchWait.resolve({ arrayBuffer: async () => new ArrayBuffer(8) }); await settle();
    // Twenty SFX per context, including shop entry. The old pending fetch never decodes.
    expect(old.decodeAudioData).toHaveBeenCalledTimes(19);
    expect(current.decodeAudioData).toHaveBeenCalledTimes(20);
    expect(audio.currentMusic()).toBe('off');
    audio.play('hit');
    expect(audio.audioStats().played).toBe(0);
    expect(current.sources.filter(s => s.loop)).toHaveLength(0);
    audio.setSfx(true); audio.play('hit');
    expect(audio.audioStats().played).toBe(1);
  });

  it('keeps only one live ambience after a background load and foreground recovery', async () => {
    audio.unlock(); await settle();
    const c = ContextMock.all[0];
    audio.suspendAudio(); await settle();
    // Force an in-flight ambience decode on a new context.
    c.state = 'closed'; audio.resumeAudio();
    const wait = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input) => String(input).includes('/ambience.')
      ? wait.promise : Promise.resolve({ arrayBuffer: async () => new ArrayBuffer(8) } as Response));
    audio.unlock(); await settle();
    for (let i = 0; i < 20; i++) audio.unlock();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/ambience.'))).toHaveLength(2);
    audio.suspendAudio(); await settle();
    wait.resolve({ arrayBuffer: async () => new ArrayBuffer(8) } as Response); await settle();
    const next = ContextMock.all[1];
    expect(next.sources.filter(s => s.loop)).toHaveLength(0);
    audio.resumeAudio(); await settle(); audio.unlock(); await settle();
    expect(next.sources.filter(s => s.loop && !s.stop.mock.calls.length)).toHaveLength(1);
  });

  it('ignores an old decode already in progress when the context is replaced', async () => {
    audio.unlock();
    const old = ContextMock.all[0];
    const wait = deferred<{ duration: number }>();
    old.decodeAudioData.mockImplementationOnce(() => wait.promise);
    await settle();
    old.state = 'closed'; audio.unlock(); await audio.whenLoaded(); await settle();
    wait.resolve({ duration: 123 }); await settle();
    audio.play('hit');
    const sources = ContextMock.all[1].sources;
    expect(sources[sources.length - 1].buffer).toEqual({ duration: 1 });
  });

  it('recreates streaming elements for wanted music, stops old ambience, and retains the voice cap', async () => {
    audio.setMusic(true, 'battle'); await settle();
    const old = ContextMock.all[0];
    const oldMusic = MediaMock.all.find(m => m.src.includes('music_battle'))!;
    const oldAmbience = old.sources.find(s => s.loop)!;
    old.state = 'closed'; audio.unlock(); await audio.whenLoaded(); await settle();
    expect(oldMusic.paused).toBe(true);
    expect(oldAmbience.stop).toHaveBeenCalledTimes(1);
    expect(audio.currentMusic()).toBe('battle');
    const music = MediaMock.all.filter(m => m.src.includes('music_battle'));
    expect(music).toHaveLength(2);
    expect(music[1].paused).toBe(false);
    for (let i = 0; i < 25; i++) audio.play('hit', i);
    expect(audio.audioStats().voices).toBeLessThanOrEqual(12);
    expect(audio.audioStats().stolen + audio.audioStats().rejected).toBeGreaterThan(0);
    expect(ContextMock.all[1].decodeAudioData).toHaveBeenCalledTimes(21); // 20 SFX plus ambience
  });

  it('retries rejected media on gesture and keeps streaming music muted after late play', async () => {
    audio.setMusic(true, 'battle'); await settle();
    const music = MediaMock.all.find(m => m.src.includes('music_battle'))!;
    const wait = deferred();
    music.play.mockImplementationOnce(async () => { await wait.promise; music.paused = false; });
    audio.unlock(); audio.setMusic(false);
    wait.resolve(); await settle();
    expect(music.paused).toBe(true);
    expect(audio.currentMusic()).toBe('off');
    const silent = MediaMock.all[0];
    silent.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audio.unlock(); await settle(); audio.unlock(); await settle();
    expect(silent.paused).toBe(false);
    expect(ContextMock.all[0].decodeAudioData).toHaveBeenCalledTimes(21); // 20 SFX plus ambience
    expect(MediaMock.all.filter(m => m.src.includes('music_'))).toHaveLength(1);
  });
});
