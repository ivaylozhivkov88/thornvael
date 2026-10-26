import { registerSW } from 'virtual:pwa-register';
import { audioState, blip, resumeAudio, setMusic, suspendAudio, unlock } from './audio';
import { GestureRecognizer, pickUnit, unitsInBox, type Intent } from './input';
import { TILE, generateMap } from './map';
import { Renderer, type View } from './render';
import { Bot, setupSquads } from './sim/bot';
import { FP, Sim, TICKS_PER_SECOND, type Command } from './sim/sim';
import { S } from './strings';
import './style.css';

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const stress = params.has('stress');
const debug = params.has('debug') || stress;

// --- world ---
const map = generateMap(7);
const mine = stress ? 24 : 12;
const total = stress ? 300 : 48;
const sim = new Sim(map, 1, [...Array(mine).fill(0), ...Array(total - mine).fill(1)]);
setupSquads(sim);
const bot = new Bot(1, 12, 5);
const pending: Command[] = [];
const selected = new Set<number>();
const prevX = sim.x.slice();
const prevY = sim.y.slice();
const STEP_MS = 1000 / TICKS_PER_SECOND;

let userPause = false;
let hidden = document.hidden;
let acc = 0;
let boxMode = false;
let addMode = false;
let boxDrag: View['box'] = null;
let ping: { x: number; y: number; t: number } | null = null;

const renderer = new Renderer($('game') as HTMLCanvasElement, map);

// --- intents ---
const rec = new GestureRecognizer({ boxMode: () => boxMode, additive: () => addMode });
const pos = (i: number): [number, number] | null => (sim.team[i] === 0 ? renderer.unitScreen(i) : null);

function order(sx: number, sy: number): void {
  if (selected.size === 0) return;
  const [x, y] = renderer.toTile(sx, sy);
  pending.push({ type: 'move', ids: [...selected].sort((a, b) => a - b), x, y });
  ping = { x, y, t: performance.now() };
  blip();
}

function select(ids: number[], additive: boolean): void {
  if (!additive) selected.clear();
  for (const id of ids) {
    if (additive && ids.length === 1 && selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
}

function handle(intents: Intent[]): void {
  for (const it of intents) {
    switch (it.type) {
      case 'click':
      case 'tap': {
        const hit = pickUnit(sim.count, pos, it.x, it.y, 24); // 48 px target
        if (hit >= 0) select([hit], it.additive);
        else if (it.type === 'tap') order(it.x, it.y);
        else if (!it.additive) selected.clear();
        break;
      }
      case 'move-to':
        order(it.x, it.y);
        break;
      case 'box-preview':
        boxDrag = it.x0 === it.x1 && it.y0 === it.y1 ? null : { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 };
        break;
      case 'box':
        select(unitsInBox(sim.count, pos, it), it.additive);
        break;
      case 'pan':
        renderer.pan(it.dx, it.dy);
        break;
      case 'zoom':
        renderer.zoomBy(it.dir, it.x, it.y);
        break;
    }
  }
}

const canvas = $('game') as HTMLCanvasElement;
const local = (e: PointerEvent | WheelEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer ids (tests) cannot be captured
  }
  const [x, y] = local(e);
  handle(rec.down(e.pointerId, x, y, e.pointerType !== 'mouse', e.button, e.shiftKey));
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = local(e);
  handle(rec.move(e.pointerId, x, y));
});
canvas.addEventListener('pointerup', (e) => handle(rec.up(e.pointerId)));
canvas.addEventListener('pointercancel', () => {
  rec.cancel();
  boxDrag = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    handle(rec.wheel(e.deltaY, x, y));
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
  if (e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAll();
  } else if (e.key === 'Escape') selected.clear();
  else if (e.key === ' ') togglePause();
  else keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// --- toolbar ---
function selectAll(): void {
  selected.clear();
  for (let i = 0; i < sim.count; i++) if (sim.team[i] === 0) selected.add(i);
}
function togglePause(): void {
  userPause = !userPause;
  $('btn-pause').classList.toggle('on', userPause);
}
function toggle(id: string, on: boolean): void {
  $(id).classList.toggle('on', on);
  $(id).setAttribute('aria-pressed', String(on));
}
$('btn-box').onclick = () => toggle('btn-box', (boxMode = !boxMode));
$('btn-add').onclick = () => toggle('btn-add', (addMode = !addMode));
$('btn-all').onclick = selectAll;
$('btn-pause').onclick = togglePause;
$('btn-sound').onclick = blip;
let musicOn = false;
$('btn-music').onclick = () => {
  musicOn = !musicOn;
  setMusic(musicOn);
  toggle('btn-music', musicOn);
};
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) suspendAudio();
  else {
    resumeAudio();
    acc = 0;
    lastNow = performance.now();
  }
});

// --- loop ---
let lastNow = performance.now();
let frames = 0;
let worst = 0;
let sumMs = 0;
let fpsText = '';
let lastReport = lastNow;
const dbg = $('debug');
dbg.hidden = !debug;
let persisted: boolean | string = '?';

function frame(): void {
  const now = performance.now();
  const dt = Math.min(250, now - lastNow);
  lastNow = now;
  if (!hidden && !userPause) {
    acc += dt;
    let n = 0;
    while (acc >= STEP_MS && n < 5) {
      prevX.set(sim.x);
      prevY.set(sim.y);
      const cmds = bot.commands(sim);
      cmds.push(...pending.splice(0));
      sim.step(cmds);
      acc -= STEP_MS;
      n++;
    }
    if (n === 5) acc = 0;
  } else pending.length = 0;
  const speed = 10;
  const dx = (keys.has('arrowleft') || keys.has('a') ? 1 : 0) - (keys.has('arrowright') || keys.has('d') ? 1 : 0);
  const dy = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
  if (dx || dy) renderer.pan(dx * speed, dy * speed);
  const age = ping ? (now - ping.t) / 600 : 2;
  if (age >= 1) ping = null;
  const t0 = performance.now();
  renderer.draw(sim, prevX, prevY, hidden || userPause ? 1 : acc / STEP_MS, {
    selected,
    box: boxDrag,
    ping: ping ? { x: ping.x, y: ping.y, age } : null,
  });
  const cost = performance.now() - t0;
  frames++;
  sumMs += cost;
  worst = Math.max(worst, dt);
  if (debug && now - lastReport >= 1000) {
    const secs = (now - lastReport) / 1000;
    fpsText = `${(frames / secs).toFixed(0)} fps, draw ${(sumMs / frames).toFixed(2)} ms, worst frame ${worst.toFixed(0)} ms`;
    frames = 0;
    sumMs = 0;
    worst = 0;
    lastReport = now;
  }
  if (debug) {
    dbg.textContent = `${fpsText}\nunits ${sim.count}, tick ${sim.tick}, hash ${sim.hash().toString(16)}\nzoom ${renderer.zoom}, audio ${audioState()}, persisted ${persisted}`;
  }
  requestAnimationFrame(frame);
}

// --- overlays ---
function toast(msg: string, action?: { label: string; run: () => void }): void {
  const t = $('toast');
  t.textContent = msg + ' ';
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = action.run;
    t.append(b);
  }
  t.hidden = false;
  if (!action) setTimeout(() => (t.hidden = true), 3000);
}
function openPanel(title: string, body: string): void {
  $('panel-title').textContent = title;
  $('panel-body').textContent = body;
  $('panel').hidden = false;
}
$('panel-close').onclick = () => {
  $('panel').hidden = true;
};
$('btn-credits').onclick = () => openPanel(S.credits, S.creditsBody);

const nav = navigator as Navigator & { standalone?: boolean };
const isIos = /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
let deferred: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as Event & { prompt: () => Promise<void> };
});
if (standalone) $('btn-install').hidden = true;
$('btn-install').onclick = () => {
  if (deferred) void deferred.prompt();
  else openPanel(S.installTitle, isIos ? S.installIos : S.installOther);
};

const updateSW = registerSW({
  onOfflineReady: () => toast(S.offlineReady),
  onNeedRefresh: () => toast(S.updateReady, { label: S.updateApply, run: () => void updateSW(true) }),
});
void nav.storage?.persist?.().then(
  (ok) => void nav.storage?.estimate?.().then((q) => (persisted = `${ok} (${Math.round((q.usage ?? 0) / 1024)} KB of ${Math.round((q.quota ?? 0) / 1048576)} MB)`)),
  () => (persisted = 'error'),
);

document.title = S.title;
$('hint').textContent = S.hint;
for (const [id, text] of Object.entries(S.buttons)) $(id).textContent = text;

void renderer.init(sim).then(() => {
  lastNow = performance.now();
  requestAnimationFrame(frame);
  // Test and debug hook: deterministic access for the Playwright smoke test and the device bench.
  (window as unknown as { __game: unknown }).__game = {
    sim,
    selected: () => [...selected],
    unitScreen: (i: number) => renderer.unitScreen(i),
    tile: (x: number, y: number) => [Math.round(x * TILE * renderer.zoom - renderer.camX), Math.round(y * TILE * renderer.zoom - renderer.camY)],
    posTiles: (i: number) => [sim.x[i] / FP, sim.y[i] / FP],
    zoom: () => renderer.zoom,
    paused: () => hidden || userPause,
  };
});
