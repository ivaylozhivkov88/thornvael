import { registerSW } from 'virtual:pwa-register';
import { audioState, blip, resumeAudio, setMusic, suspendAudio, unlock } from './audio';
import { ControlGroups, GROUP_COUNT } from './groups';
import { GestureRecognizer, pickUnit, unitsInBox, type Intent } from './input';
import { TILE, generateMap } from './map';
import { Minimap } from './minimap';
import { Renderer, type View } from './render';
import { Bot, setupCrowd, setupSquads } from './sim/bot';
import { DAY_TICKS, clockText } from './sim/daynight';
import { FP, Sim, TICKS_PER_SECOND, type Command } from './sim/sim';
import { S } from './strings';
import './style.css';

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const crowd = params.has('crowd'); // 300 units, all yours: the crowd-movement benchmark
const stress = params.has('stress');
const debug = params.has('debug') || stress || crowd;

// --- world ---
const map = generateMap(7);
const mine = crowd ? 300 : stress ? 24 : 12;
const total = crowd || stress ? 300 : 48;
const sim = new Sim(map, 1, [...Array(mine).fill(0), ...Array(total - mine).fill(1)], {
  dayOffset: params.get('time') === 'night' ? Math.floor(DAY_TICKS * 0.7) : 0,
});
if (crowd) setupCrowd(sim, 300);
else setupSquads(sim);
sim.updateFog();
const bot = new Bot(1, 12, 5);
const groups = new ControlGroups();
const SPEEDS = [1, 0.5, 0.25];
let speedIdx = 0;
const pending: Command[] = [];
const selected = new Set<number>();
const prevX = sim.x.slice();
const prevY = sim.y.slice();
const STEP_MS = 1000 / TICKS_PER_SECOND;

let userPause = false;
let pausedToast = false;
let hidden = document.hidden;
let acc = 0;
let boxMode = false;
let addMode = false;
let setMode = false;
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
  if (userPause && !pausedToast) {
    pausedToast = true;
    toast(S.queued);
  }
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
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit) {
    // Ctrl or Alt + number saves the group, Shift + number adds to it, a plain number recalls it
    // (twice quickly: centre the camera). Browsers keep Ctrl+number for tab switching, hence Alt too.
    e.preventDefault();
    groupKey(Number(digit[1]), e.ctrlKey || e.altKey ? 'set' : e.shiftKey ? 'add' : 'recall');
  } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
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
  pausedToast = false;
  $('btn-pause').classList.toggle('on', userPause);
}
function cycleSpeed(): void {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  $('btn-speed').textContent = S.speed[speedIdx];
  $('btn-speed').classList.toggle('on', speedIdx > 0);
}

// --- control groups ---
const groupButtons: HTMLButtonElement[] = [];
function refreshGroupButtons(): void {
  for (let n = 1; n <= GROUP_COUNT; n++) {
    const b = groupButtons[n - 1];
    const size = groups.size(n);
    b.replaceChildren(String(n));
    if (size > 0) {
      const small = document.createElement('small');
      small.textContent = String(size);
      b.append(small);
    }
    b.classList.toggle('has', size > 0);
  }
}
function centerOnGroup(ids: readonly number[]): void {
  if (ids.length === 0) return;
  let sx = 0;
  let sy = 0;
  for (const id of ids) {
    sx += sim.x[id];
    sy += sim.y[id];
  }
  renderer.centerOn(sx / ids.length / FP, sy / ids.length / FP);
}
/** One entry for keys and buttons: save, add to, or recall a group. */
function groupKey(n: number, how: 'set' | 'add' | 'recall'): void {
  if (how === 'recall') {
    const ids = groups.get(n);
    if (ids.length === 0) return;
    if (groups.press(n, performance.now()) === 'center') centerOnGroup(ids);
    else if (addMode) for (const id of ids) selected.add(id);
    else {
      selected.clear();
      for (const id of ids) selected.add(id);
    }
    return;
  }
  if (selected.size === 0) {
    toast(S.groupEmpty);
    return;
  }
  if (how === 'set') groups.set(n, selected);
  else groups.add(n, selected);
  refreshGroupButtons();
  toast(how === 'set' ? S.groupSet : S.groupAdded);
}
for (let n = 1; n <= GROUP_COUNT; n++) {
  const b = document.createElement('button');
  b.setAttribute('aria-label', `Group ${n}`);
  // On a phone: Set + number saves, Add + number adds to the group, a number alone recalls it.
  b.onclick = () => groupKey(n, setMode ? (addMode ? 'add' : 'set') : 'recall');
  groupButtons.push(b);
  $('groups').append(b);
}
refreshGroupButtons();
function toggle(id: string, on: boolean): void {
  $(id).classList.toggle('on', on);
  $(id).setAttribute('aria-pressed', String(on));
}
$('btn-box').onclick = () => toggle('btn-box', (boxMode = !boxMode));
$('btn-add').onclick = () => toggle('btn-add', (addMode = !addMode));
$('btn-set').onclick = () => toggle('btn-set', (setMode = !setMode));
$('btn-all').onclick = selectAll;
$('btn-pause').onclick = togglePause;
$('btn-speed').onclick = cycleSpeed;
$('btn-speed').textContent = S.speed[0];

// --- minimap: tap or drag to move the camera ---
const miniCanvas = $('minimap') as HTMLCanvasElement;
const minimap = new Minimap(miniCanvas, map);
let miniDown = false;
const miniJump = (e: PointerEvent): void => {
  const [tx, ty] = minimap.tileAt(e.clientX, e.clientY);
  renderer.centerOn(tx, ty);
};
miniCanvas.addEventListener('pointerdown', (e) => {
  unlock();
  miniDown = true;
  try {
    miniCanvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer ids (tests) cannot be captured
  }
  miniJump(e);
});
miniCanvas.addEventListener('pointermove', (e) => miniDown && miniJump(e));
miniCanvas.addEventListener('pointerup', () => (miniDown = false));
miniCanvas.addEventListener('pointercancel', () => (miniDown = false));
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
let lastMini = 0;
const dbg = $('debug');
dbg.hidden = !debug;
let persisted: boolean | string = '?';

function frame(): void {
  const now = performance.now();
  const dt = Math.min(250, now - lastNow);
  lastNow = now;
  if (!hidden && !userPause) {
    acc += dt * SPEEDS[speedIdx];
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
  } else if (hidden) pending.length = 0; // a user pause keeps orders queued for the resume
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
  if (now - lastMini >= 125) {
    lastMini = now;
    minimap.draw(sim, renderer.viewTiles(), selected);
    $('clock').textContent = clockText(sim.tick + sim.dayOffset);
  }
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
    dbg.textContent = `${fpsText}\nunits ${sim.count}, tick ${sim.tick}, hash ${sim.hash().toString(16)}\nzoom ${renderer.zoom}, light ${sim.daylight}, moving ${sim.moving.reduce((a, b) => a + b, 0)}, audio ${audioState()}, persisted ${persisted}`;
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
    groups,
    speed: () => SPEEDS[speedIdx],
    centerOn: (x: number, y: number) => renderer.centerOn(x, y),
    paused: () => hidden || userPause,
  };
});
