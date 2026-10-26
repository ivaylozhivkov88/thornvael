import { registerSW } from 'virtual:pwa-register';
import { audioState, blip, resumeAudio, setMusic, suspendAudio, unlock } from './audio';
import { ControlGroups, GROUP_COUNT } from './groups';
import { GestureRecognizer, pickUnit, unitsInBox, type Intent } from './input';
import { TILE, generateMap } from './map';
import { Minimap } from './minimap';
import { QUALITY_NAMES, Renderer, type View } from './render';
import { Bot, MonsterAi, battleScenario, fightScenario, placeScenario, setupCrowd, setupSquads, type Scenario } from './sim/bot';
import { DEFS, Kind, SPELL, nearestSack } from './sim/combat';
import { DAY_TICKS, clockText } from './sim/daynight';
import { FP, Sim, TICKS_PER_SECOND, type Command, type OrderName } from './sim/sim';
import { S } from './strings';
import './style.css';

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const crowd = params.has('crowd'); // 300 units, all yours, no combat: the crowd-movement benchmark
const stress = params.has('stress');
const battle = params.has('battle'); // 150 against 150, both sides swarm: the combat benchmark
const debug = params.has('debug') || stress || crowd || battle;

// --- world ---
const map = generateMap(7);
const dayOffset = params.get('time') === 'night' ? Math.floor(DAY_TICKS * 0.7) : 0;
let scenario: Scenario | null = null;
let sim: Sim;
if (crowd || stress) {
  const mine = crowd ? 300 : 24;
  sim = new Sim(map, 1, [...Array(mine).fill(0), ...Array(300 - mine).fill(1)], { dayOffset });
  if (crowd) setupCrowd(sim, 300);
  else setupSquads(sim);
} else {
  scenario = battle ? battleScenario(map) : fightScenario(map);
  sim = new Sim(map, 1, scenario.teams, { dayOffset, kinds: scenario.kinds, combat: true, hpMul: battle ? 8 : 1 });
  placeScenario(sim, scenario);
}
sim.cb.recordFx = true;
sim.updateFog();
const combatMode = scenario !== null;
const ai = scenario && !battle ? new MonsterAi(scenario.packs) : null;
const bot = combatMode ? null : new Bot(1, 12, 5);
const groups = new ControlGroups();
const SPEEDS = [1, 0.5, 0.25];
let speedIdx = 0;
const pending: Command[] = [];
const selected = new Set<number>();
const prevX = sim.x.slice();
const prevY = sim.y.slice();
const STEP_MS = 1000 / TICKS_PER_SECOND;
const heroTeamSize = sim.team.reduce((n, t) => n + (t === 0 ? 1 : 0), 0);

let userPause = false;
let pausedToast = false;
let hidden = document.hidden;
let acc = 0;
let boxMode = false;
let addMode = false;
let setMode = false;
let looseMode = false; // orders ignore formations
let forceState = 0; // 0 off, 1 forced move, 2 forced attack (touch toggle; Alt and Ctrl do the same on desktop)
let armed: ArmKind | null = null;
let outcome: 'win' | 'lose' | null = null;
let boxDrag: View['box'] = null;
let ping: { x: number; y: number; t: number } | null = null;
let hover: View['hover'] = null;
const mods = { alt: false, ctrl: false };

type ArmKind = 'move' | 'attack' | 'guard' | 'defend' | 'cast' | 'pickup';

const renderer = new Renderer($('game') as HTMLCanvasElement, map);
try {
  const q = Number(localStorage.getItem('thornvael.quality'));
  if (q >= 0 && q <= 2 && localStorage.getItem('thornvael.quality') !== null) renderer.quality = q;
} catch {
  // storage may be blocked; keep the default
}

// --- helpers ---
const alive = (i: number): boolean => sim.cb.hp[i] > 0;
const posMine = (i: number): [number, number] | null => (sim.team[i] === 0 && alive(i) ? renderer.unitScreen(i) : null);
const posEnemy = (i: number): [number, number] | null => (sim.team[i] !== 0 && alive(i) ? renderer.unitScreen(i) : null);
const posAny = (i: number): [number, number] | null => (alive(i) ? renderer.unitScreen(i) : null);
const PICK = 24; // screen pixels, so a touch target is 48 px
const selectedIds = (): number[] => [...selected].filter((i) => alive(i) && sim.team[i] === 0).sort((a, b) => a - b);
const forced = (): number => (mods.alt ? 1 : mods.ctrl ? 2 : forceState);

// --- intents ---
const rec = new GestureRecognizer({ boxMode: () => boxMode, additive: () => addMode });

function notePing(sx: number, sy: number): void {
  const [x, y] = renderer.toTile(sx, sy);
  ping = { x, y, t: performance.now() };
  blip();
}

function queue(cmd: Command): void {
  pending.push(cmd);
  if (userPause && !pausedToast) {
    pausedToast = true;
    toast(S.queued);
  }
}

/** Issue an order from a point on the screen. Returns false when the target is not valid for the order. */
function execute(kind: ArmKind, sx: number, sy: number): boolean {
  const ids = selectedIds();
  if (ids.length === 0) return false;
  const [x, y] = renderer.toTile(sx, sy);
  const enemy = pickUnit(sim.count, posEnemy, sx, sy, PICK);
  switch (kind) {
    case 'move':
      queue({ type: 'move', ids, x, y, loose: looseMode });
      break;
    case 'attack': {
      const t = forced() === 2 ? pickUnit(sim.count, posAny, sx, sy, PICK) : enemy;
      queue(t >= 0 ? { type: 'order', order: 'attack', ids, target: t } : { type: 'order', order: 'attack', ids, x, y });
      break;
    }
    case 'guard':
      queue({ type: 'order', order: 'guard', ids, x, y });
      break;
    case 'defend': {
      const w = pickUnit(sim.count, posMine, sx, sy, PICK);
      if (w < 0) return false;
      queue({ type: 'order', order: 'defend', ids, target: w });
      break;
    }
    case 'cast': {
      if (!ids.some((i) => DEFS[sim.cb.kind[i]].caster)) {
        toast(S.noCaster);
        return false;
      }
      if (enemy < 0) return false;
      queue({ type: 'order', order: 'cast', ids, target: enemy });
      break;
    }
    case 'pickup':
      if (nearestSack(sim, Math.round(x * FP), Math.round(y * FP), 2 * FP) < 0) return false;
      queue({ type: 'order', order: 'pickup', ids, x, y });
      break;
  }
  notePing(sx, sy);
  return true;
}

/** The order a plain click or tap means: forced move, forced attack, attack when an enemy is under the pointer, else move. */
function smart(sx: number, sy: number): void {
  if (selectedIds().length === 0) return;
  const f = forced();
  const enemy = pickUnit(sim.count, posEnemy, sx, sy, PICK);
  execute(f === 1 ? 'move' : f === 2 || enemy >= 0 ? 'attack' : 'move', sx, sy);
}

function arm(kind: ArmKind | null): void {
  armed = kind;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#cmds button')) b.classList.toggle('on', b.dataset.ord === kind);
  const banner = $('armed');
  banner.hidden = kind === null;
  if (kind) banner.textContent = S.armed[kind];
  canvas.style.cursor = kind ? 'crosshair' : '';
}

function select(ids: number[], additive: boolean): void {
  if (!additive) selected.clear();
  for (const id of ids) {
    if (additive && ids.length === 1 && selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
}

let holdShown = false;

function handle(intents: Intent[]): void {
  for (const it of intents) {
    switch (it.type) {
      case 'click':
      case 'tap': {
        if (holdShown) break; // a press-and-hold only shows info
        if (armed) {
          if (execute(armed, it.x, it.y)) arm(null);
          else toast(S.invalidTarget);
          break;
        }
        const hit = pickUnit(sim.count, posMine, it.x, it.y, PICK);
        if (hit >= 0 && !(forced() === 2 && it.type === 'tap')) select([hit], it.additive);
        else if (it.type === 'tap') smart(it.x, it.y);
        else if (!it.additive) selected.clear();
        break;
      }
      case 'move-to':
        if (armed) arm(null);
        else smart(it.x, it.y);
        break;
      case 'box-preview':
        boxDrag = it.x0 === it.x1 && it.y0 === it.y1 ? null : { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 };
        break;
      case 'box':
        select(unitsInBox(sim.count, posMine, it), it.additive);
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

// --- tooltips: mouse hover and touch press-and-hold show the same info ---
const tipEl = $('tip');
let tipTimer = 0;
let tipHide = 0;
function showTip(text: string, x: number, y: number): void {
  tipEl.textContent = text;
  tipEl.hidden = false;
  tipEl.style.left = `${Math.max(4, Math.min(window.innerWidth - 270, x - 120))}px`;
  tipEl.style.top = `${Math.max(4, y - 70)}px`;
}
function hideTip(): void {
  tipEl.hidden = true;
  clearTimeout(tipHide);
}
function unitInfo(i: number): string {
  const d = DEFS[sim.cb.kind[i]];
  const cb = sim.cb;
  const r = d.res.map((v, n) => `${S.elements[n + 1]} ${v}%`).join(', ');
  const side = sim.team[i] === 0 ? S.yours : S.enemy;
  const mana = d.mana > 0 ? `, ${S.mana} ${cb.mana[i]}/${d.mana}` : '';
  return `${S.kinds[cb.kind[i]]} (${side}): ${S.hp} ${cb.hp[i]}/${cb.hpMax[i]}${mana}\n${S.hit} ${d.acc}, ${S.defence} ${d.def}, ${S.absorb} ${d.absorb}\n${S.resist}: ${r}`;
}
function unitAt(x: number, y: number, r: number): number {
  return pickUnit(sim.count, posAny, x, y, r);
}

const canvas = $('game') as HTMLCanvasElement;
const local = (e: PointerEvent | WheelEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
let downAt: [number, number] | null = null;
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer ids (tests) cannot be captured
  }
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  const [x, y] = local(e);
  holdShown = false;
  hideTip();
  if (e.pointerType !== 'mouse') {
    downAt = [x, y];
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (!downAt) return;
      const i = unitAt(downAt[0], downAt[1], 28);
      if (i < 0) return;
      holdShown = true;
      showTip(unitInfo(i), downAt[0], downAt[1]);
      tipHide = window.setTimeout(hideTip, 2500);
    }, 450);
  }
  handle(rec.down(e.pointerId, x, y, e.pointerType !== 'mouse', e.button, e.shiftKey));
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = local(e);
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  if (downAt && Math.hypot(x - downAt[0], y - downAt[1]) > 10) {
    downAt = null;
    clearTimeout(tipTimer);
  }
  if (e.pointerType === 'mouse') updateHover(x, y);
  handle(rec.move(e.pointerId, x, y));
});
canvas.addEventListener('pointerup', (e) => {
  downAt = null;
  clearTimeout(tipTimer);
  handle(rec.up(e.pointerId));
  if (holdShown) {
    clearTimeout(tipHide);
    tipHide = window.setTimeout(hideTip, 1500);
  }
});
canvas.addEventListener('pointercancel', () => {
  rec.cancel();
  boxDrag = null;
  downAt = null;
  clearTimeout(tipTimer);
});
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') {
    hover = null;
    hideTip();
  }
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

/** Mouse hover: show the cursor for the order that a click would give, and the unit info. */
function updateHover(x: number, y: number): void {
  const enemy = pickUnit(sim.count, posEnemy, x, y, PICK);
  const mine = pickUnit(sim.count, posMine, x, y, PICK);
  const haveSel = selectedIds().length > 0;
  let ok = false;
  let cursor = '';
  if (armed) {
    if (armed === 'cast') ok = enemy >= 0;
    else if (armed === 'defend') ok = mine >= 0;
    else if (armed === 'pickup') {
      const [tx, ty] = renderer.toTile(x, y);
      ok = nearestSack(sim, Math.round(tx * FP), Math.round(ty * FP), 2 * FP) >= 0;
    } else ok = true;
    cursor = ok ? 'crosshair' : 'not-allowed';
  } else if (enemy >= 0 && haveSel && forced() !== 1) {
    ok = true;
    cursor = 'crosshair';
  } else if (mine >= 0) cursor = 'pointer';
  canvas.style.cursor = cursor;
  const shown = enemy >= 0 ? enemy : mine;
  hover = enemy >= 0 && (armed === null || armed === 'attack' || armed === 'cast') ? { id: enemy, ok } : null;
  if (shown >= 0) showTip(unitInfo(shown), x + 120, y + 100);
  else hideTip();
}

const keys = new Set<string>();
const ORDER_KEYS: Record<string, string> = { m: 'move', a: 'attack', g: 'guard', d: 'defend', c: 'cast', w: 'swarm', h: 'hold', r: 'retreat', s: 'still', p: 'pickup' };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit) {
    // Ctrl or Alt + number saves the group, Shift + number adds to it, a plain number recalls it
    // (twice quickly: centre the camera). Browsers keep Ctrl+number for tab switching, hence Alt too.
    e.preventDefault();
    groupKey(Number(digit[1]), e.ctrlKey || e.altKey ? 'set' : e.shiftKey ? 'add' : 'recall');
  } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAll();
  } else if (e.key === 'Escape') {
    if (armed) arm(null);
    else selected.clear();
  } else if (e.key === ' ') togglePause();
  else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey) toggleLoose();
  else if (!e.ctrlKey && !e.altKey && !e.metaKey && ORDER_KEYS[e.key.toLowerCase()]) orderButton(ORDER_KEYS[e.key.toLowerCase()]);
  else keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => {
  mods.alt = e.altKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
  keys.delete(e.key.toLowerCase());
});

// --- command bar ---
const INSTANT = new Set(['swarm', 'hold', 'retreat', 'still']);
function orderButton(ord: string): void {
  if (outcome) return;
  if (INSTANT.has(ord)) {
    const ids = selectedIds();
    if (ids.length === 0) {
      toast(S.selectFirst);
      return;
    }
    queue({ type: 'order', order: ord as OrderName, ids });
    blip();
    arm(null);
    return;
  }
  if (selectedIds().length === 0) {
    toast(S.selectFirst);
    return;
  }
  arm(armed === ord ? null : (ord as ArmKind));
}
const cmds = $('cmds');
const tipOn = (b: HTMLElement, text: string): void => {
  b.title = text;
  let t = 0;
  let shown = false;
  b.addEventListener('pointerdown', (e) => {
    shown = false;
    if (e.pointerType === 'mouse') return;
    t = window.setTimeout(() => {
      shown = true;
      const r = b.getBoundingClientRect();
      showTip(text, r.left + r.width / 2 + 120, r.top - 4 + 70);
      tipHide = window.setTimeout(hideTip, 2500);
    }, 450);
  });
  const stop = (): void => clearTimeout(t);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointerleave', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener(
    'click',
    (e) => {
      if (shown) {
        e.stopImmediatePropagation();
        e.preventDefault();
        shown = false;
      }
    },
    true,
  );
};
for (const [ord, info] of Object.entries(S.orders)) {
  const b = document.createElement('button');
  b.dataset.ord = ord;
  b.textContent = info.name;
  const k = document.createElement('small');
  k.textContent = info.key;
  b.append(k);
  b.onclick = () => orderButton(ord);
  tipOn(b, `${info.name} [${info.key}]: ${info.tip}`);
  cmds.append(b);
}

// --- toolbar ---
function selectAll(): void {
  selected.clear();
  for (let i = 0; i < sim.count; i++) if (sim.team[i] === 0 && alive(i)) selected.add(i);
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
function toggleLoose(): void {
  looseMode = !looseMode;
  $('btn-loose').classList.toggle('on', looseMode);
  $('btn-loose').textContent = looseMode ? S.buttons['btn-loose-on'] : S.buttons['btn-loose'];
}
function cycleForce(): void {
  forceState = (forceState + 1) % 3;
  $('btn-force').textContent = S.force[forceState];
  $('btn-force').classList.toggle('on', forceState > 0);
}
function setQuality(q: number, auto = false): void {
  renderer.setQuality(q);
  $('btn-quality').textContent = `${S.quality}: ${QUALITY_NAMES[renderer.quality]}`;
  if (!auto) {
    try {
      localStorage.setItem('thornvael.quality', String(renderer.quality));
    } catch {
      // storage may be blocked
    }
  }
}

// --- control groups ---
const groupButtons: HTMLButtonElement[] = [];
function refreshGroupButtons(): void {
  for (let n = 1; n <= GROUP_COUNT; n++) {
    const b = groupButtons[n - 1];
    const size = groups.get(n).filter(alive).length;
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
    const ids = groups.get(n).filter(alive);
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
$('btn-loose').onclick = toggleLoose;
$('btn-force').onclick = cycleForce;
$('btn-quality').onclick = () => setQuality((renderer.quality + 1) % 3);
for (const id of ['btn-loose', 'btn-force', 'btn-quality', 'btn-box', 'btn-add', 'btn-set', 'btn-all', 'btn-pause', 'btn-speed']) {
  const tip = S.tips[id as keyof typeof S.tips];
  if (tip) tipOn($(id), tip);
}

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
let simMs = 0;
let simSteps = 0;
let fpsText = '';
let lastReport = lastNow;
let lastMini = 0;
let slowSince = 0;
let emaDt = 16; // smoothed frame time in ms; quality drops when it stays above 36 (under about 28 fps)
const dbg = $('debug');
dbg.hidden = !debug;
let persisted: boolean | string = '?';

function updateStats(): void {
  for (const id of [...selected]) if (!alive(id)) selected.delete(id);
  refreshGroupButtons();
  if (combatMode) {
    $('stats').textContent = `${S.army} ${sim.cb.alive[0]}/${heroTeamSize}  ${S.foes} ${sim.cb.alive[1]}  ${S.gold} ${sim.cb.gold[0]}`;
    if (!outcome) {
      if (sim.cb.hp[0] <= 0 && sim.cb.kind[0] === Kind.Hero) finish('lose');
      else if (sim.cb.alive[1] === 0 && !battle) finish('win');
      else if (battle && (sim.cb.alive[0] === 0 || sim.cb.alive[1] === 0)) finish(sim.cb.alive[1] === 0 ? 'win' : 'lose');
    }
  }
}

function finish(kind: 'win' | 'lose'): void {
  outcome = kind;
  arm(null);
  userPause = true;
  const lost = heroTeamSize - sim.cb.alive[0];
  openPanel(kind === 'win' ? S.victory : S.defeat, `${kind === 'win' ? S.victoryBody : S.defeatBody}\n${S.army}: ${sim.cb.alive[0]}/${heroTeamSize} (${lost} ${S.fallen}). ${S.gold}: ${sim.cb.gold[0]}.`, true);
}

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
      const cmdsNow = ai ? ai.commands(sim) : bot ? bot.commands(sim) : [];
      cmdsNow.push(...pending.splice(0));
      const s0 = performance.now();
      sim.step(cmdsNow);
      simMs += performance.now() - s0;
      simSteps++;
      acc -= STEP_MS;
      n++;
    }
    if (n === 5) acc = 0;
  } else if (hidden) pending.length = 0; // a user pause keeps orders queued for the resume
  const speed = 10;
  const dx = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
  const dy = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
  if (dx || dy) renderer.pan(dx * speed, dy * speed);
  const age = ping ? (now - ping.t) / 600 : 2;
  if (age >= 1) ping = null;
  const t0 = performance.now();
  renderer.draw(sim, prevX, prevY, hidden || userPause ? 1 : acc / STEP_MS, {
    selected,
    box: boxDrag,
    ping: ping ? { x: ping.x, y: ping.y, age } : null,
    hover,
  });
  if (now - lastMini >= 125) {
    lastMini = now;
    minimap.draw(sim, renderer.viewTiles(), selected);
    $('clock').textContent = clockText(sim.tick + sim.dayOffset);
    updateStats();
  }
  const cost = performance.now() - t0;
  frames++;
  sumMs += cost;
  worst = Math.max(worst, dt);
  // Quality drops by itself when the smoothed frame time stays over 36 ms for three seconds.
  emaDt += (Math.min(dt, 60) - emaDt) * 0.05;
  if (!hidden && !userPause && emaDt > 36 && renderer.quality > 0) {
    slowSince = slowSince || now;
    if (now - slowSince > 3000) {
      setQuality(renderer.quality - 1, true);
      toast(`${S.qualityLowered}: ${QUALITY_NAMES[renderer.quality]}`);
      slowSince = 0;
      emaDt = 16;
    }
  } else slowSince = 0;
  if (debug && now - lastReport >= 1000) {
    const secs = (now - lastReport) / 1000;
    fpsText = `${(frames / secs).toFixed(0)} fps, draw ${(sumMs / frames).toFixed(2)} ms, sim ${(simMs / Math.max(1, simSteps)).toFixed(2)} ms/step, worst frame ${worst.toFixed(0)} ms`;
    frames = 0;
    sumMs = 0;
    simMs = 0;
    simSteps = 0;
    worst = 0;
    lastReport = now;
  }
  if (debug) {
    dbg.textContent = `${fpsText}\nunits ${sim.count} (alive ${sim.cb.alive[0]}+${sim.cb.alive[1]}), tick ${sim.tick}, hash ${sim.hash().toString(16)}\nzoom ${renderer.zoom}, quality ${QUALITY_NAMES[renderer.quality]}, light ${sim.daylight}, moving ${sim.moving.reduce((a, b) => a + b, 0)}, audio ${audioState()}, persisted ${persisted}`;
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
function openPanel(title: string, body: string, restart = false): void {
  $('panel-title').textContent = title;
  $('panel-body').textContent = body;
  $('panel-restart').hidden = !restart;
  $('panel').hidden = false;
}
$('panel-close').onclick = () => {
  $('panel').hidden = true;
};
$('panel-restart').onclick = () => location.reload();
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
$('hint').textContent = combatMode ? S.hintCombat : S.hint;
$('cmds').hidden = !combatMode;
$('stats').hidden = !combatMode;
for (const [id, text] of Object.entries(S.buttons)) {
  if (!id.endsWith('-on')) $(id).textContent = text;
}
$('btn-force').textContent = S.force[0];
if (!combatMode) for (const id of ['btn-loose', 'btn-force']) $(id).hidden = true;

void renderer.init(sim).then(() => {
  setQuality(renderer.quality, true);
  if (combatMode) selectAll();
  if (battle) {
    const a = [...Array(150).keys()];
    pending.push({ type: 'order', order: 'swarm', ids: a, x: 38, y: map.h - 9 });
    pending.push({ type: 'order', order: 'swarm', ids: a.map((i) => i + 150), x: 10, y: map.h - 9 });
  }
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
    armed: () => armed,
    order: orderButton,
    spell: SPELL,
  };
});
