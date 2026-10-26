import { registerSW } from 'virtual:pwa-register';
import { H, W, findPath, makeMap, type Tile } from './map';
import { S } from './strings';
import './style.css';

const COLORS: Record<Tile, string> = { 0: '#3f5a2e', 1: '#7a6446', 2: '#2c4f78', 3: '#1f3a1b' };
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const map = makeMap();
const hero = { x: 2, y: 9, px: 2, py: 9, path: [] as [number, number][] };
let ts = 32;
let ox = 0;
let oy = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ts = Math.max(8, Math.floor(Math.min(canvas.width / W, canvas.height / H))); // whole-pixel tiles
  ox = Math.floor((canvas.width - ts * W) / 2);
  oy = Math.floor((canvas.height - ts * H) / 2);
}

function draw(): void {
  ctx.fillStyle = '#14100c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map[y * W + x];
      ctx.fillStyle = COLORS[t];
      ctx.fillRect(ox + x * ts, oy + y * ts, ts, ts);
      if (t === 3) {
        ctx.fillStyle = '#2d5a27';
        ctx.beginPath();
        ctx.arc(ox + (x + 0.5) * ts, oy + (y + 0.45) * ts, ts * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const cx = ox + (hero.px + 0.5) * ts;
  const cy = oy + (hero.py + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ts * 0.3, ts * 0.3, ts * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8b24a';
  ctx.fillRect(cx - ts * 0.22, cy - ts * 0.35, ts * 0.44, ts * 0.65);
  ctx.fillStyle = '#e8d5b0';
  ctx.beginPath();
  ctx.arc(cx, cy - ts * 0.42, ts * 0.17, 0, Math.PI * 2);
  ctx.fill();
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const next = hero.path[0];
  if (next) {
    const dx = next[0] - hero.px;
    const dy = next[1] - hero.py;
    const d = Math.hypot(dx, dy);
    const step = 5 * dt; // 5 tiles per second
    if (d <= step) {
      hero.px = hero.x = next[0];
      hero.py = hero.y = next[1];
      hero.path.shift();
    } else {
      hero.px += (dx / d) * step;
      hero.py += (dy / d) * step;
    }
  }
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / r.width;
  const tx = Math.floor(((e.clientX - r.left) * k - ox) / ts);
  const ty = Math.floor(((e.clientY - r.top) * k - oy) / ts);
  // Re-plan from the tile the hero is heading to, so a new tap never teleports it.
  const head = hero.path[0];
  const from = head ?? [hero.x, hero.y];
  const p = findPath(map, from[0], from[1], tx, ty);
  if (p.length) hero.path = head ? [head, ...p] : p;
});
window.addEventListener('resize', resize);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// --- overlays ---
const $ = (id: string): HTMLElement => document.getElementById(id)!;
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
void nav.storage?.persist?.();

document.title = S.title;
$('hint').textContent = S.hint;
resize();
requestAnimationFrame(frame);
(window as unknown as { __game: unknown }).__game = hero;
