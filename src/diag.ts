import { audioState, blip, unlock } from './audio';

/** `?diag=1` self-test panel for real phones. Loaded on demand, so it costs nothing when the flag is absent. */

export interface LiveStats {
  fps: number;
  drawMs: number;
  stepMs: number;
  worstMs: number;
}

type Row = [string, string];

const rows = new Map<string, Row>();
const samples: LiveStats[] = [];

function setRow(key: string, value: string): void {
  rows.set(key, [key, value]);
}

function gameCanvas(): HTMLCanvasElement | null {
  for (const cv of document.querySelectorAll('canvas')) {
    if (cv.getContext('webgl2') || cv.getContext('webgl')) return cv;
  }
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function once(target: EventTarget, type: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean): void => {
      target.removeEventListener(type, on);
      resolve(ok);
    };
    const on = (): void => done(true);
    target.addEventListener(type, on);
    setTimeout(() => done(false), ms);
  });
}

async function webglTest(): Promise<string> {
  const cv = gameCanvas();
  const gl = cv && ((cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext | null);
  const ext = gl?.getExtension('WEBGL_lose_context');
  if (!cv || !gl || !ext) return 'unsupported (no WEBGL_lose_context)';
  const lost = once(cv, 'webglcontextlost', 2000);
  ext.loseContext();
  if (!(await lost)) return 'FAIL: no lost event';
  const back = once(cv, 'webglcontextrestored', 4000);
  ext.restoreContext();
  if (!(await back)) return 'FAIL: not restored';
  await wait(500);
  return gl.isContextLost() ? 'FAIL: still lost' : 'ok: lost and restored';
}

async function storageTest(): Promise<void> {
  const st = navigator.storage;
  try {
    setRow('persisted', String(await st?.persisted?.()));
    const q = await st?.estimate?.();
    setRow('storage', q ? `${Math.round((q.usage ?? 0) / 1024)} KB of ${Math.round((q.quota ?? 0) / 1048576)} MB` : 'n/a');
  } catch (e) {
    setRow('storage', `error ${String(e)}`);
  }
}

function envRows(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  setRow('agent', navigator.userAgent);
  setRow('screen', `${innerWidth}x${innerHeight} @${devicePixelRatio} dpr`);
  setRow('standalone', String(nav.standalone === true || matchMedia('(display-mode: standalone)').matches));
  setRow('serviceWorker', navigator.serviceWorker?.controller ? 'controlling' : 'none');
  setRow('online', String(navigator.onLine));
}

function averages(): Row[] {
  if (!samples.length) return [['perf', 'waiting for samples']];
  const n = samples.length;
  const avg = (f: (s: LiveStats) => number): number => samples.reduce((a, s) => a + f(s), 0) / n;
  const minFps = Math.min(...samples.map((s) => s.fps));
  return [
    ['fps avg/min', `${avg((s) => s.fps).toFixed(0)} / ${minFps.toFixed(0)}`],
    ['draw ms', avg((s) => s.drawMs).toFixed(2)],
    ['sim ms/step', avg((s) => s.stepMs).toFixed(2)],
    ['worst frame ms', Math.max(...samples.map((s) => s.worstMs)).toFixed(0)],
    ['samples', String(n)],
  ];
}

function report(): Record<string, string> {
  const out: Record<string, string> = { time: new Date().toISOString(), audio: audioState() };
  for (const [k, v] of rows.values()) out[k] = v;
  for (const [k, v] of averages()) out[k] = v;
  return out;
}

async function copyJson(): Promise<boolean> {
  const text = JSON.stringify(report(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function startDiag(parent: HTMLElement, stats: () => LiveStats): void {
  const el = document.createElement('div');
  el.id = 'diag';
  const pre = document.createElement('pre');
  const bar = document.createElement('div');
  const button = (label: string, fn: (b: HTMLButtonElement) => void | Promise<void>): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => void fn(b));
    bar.append(b);
  };
  button('Audio test', () => {
    unlock();
    blip();
    setRow('audio test', `played, state ${audioState()}`);
  });
  button('WebGL loss test', async (b) => {
    b.disabled = true;
    setRow('webgl', 'running');
    setRow('webgl', await webglTest());
    b.disabled = false;
  });
  button('Persist', async () => {
    setRow('persist()', String(await navigator.storage?.persist?.()));
    await storageTest();
  });
  button('Copy JSON', async (b) => {
    b.textContent = (await copyJson()) ? 'Copied' : 'Copy failed';
    setTimeout(() => {
      b.textContent = 'Copy JSON';
    }, 1500);
  });
  button('Hide', () => {
    el.hidden = true;
  });
  el.append(bar, pre);
  parent.append(el);
  envRows();
  void storageTest();
  setInterval(() => {
    const s = stats();
    if (s.fps > 0) samples.push(s);
    if (samples.length > 300) samples.shift();
    envRows();
    setRow('audio', audioState());
    const lines = [...rows.values(), ...averages()].map(([k, v]) => `${k}: ${v}`);
    pre.textContent = lines.join('\n');
  }, 1000);
}
