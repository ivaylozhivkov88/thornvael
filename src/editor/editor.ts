import { ObjectKind, Terrain } from '../map';
import { MAP_VERSION, MAX_SIDE, MIN_SIDE, blankDoc, loadDoc, migrate, rleDecode, rleEncode, validate, type MapDoc, type UnitDef } from '../mapdoc';
import { TEST_KEY } from '../mission';
import { DEFS } from '../sim/combat';
import { ITEMS } from '../sim/items';
import { ACTIONS, CHECKS, OPS, actionDef, checkDef, type Param, type Ref, type Trigger } from '../sim/script';
import { SPELLS } from '../sim/spelldata';

/** Browser map editor: paint terrain and height, place objects, units and regions, build triggers from forms, test-play. */

const DRAFT = 'thornvael.editor.draft';
const Z = 14; // pixels per tile
const TERRAIN_COLOR = ['#4a7a3a', '#8a7048', '#2a5a9a', '#6a6a6a', '#4a5a30'];
const TERRAIN_NAMES = ['Grass', 'Dirt', 'Water', 'Rock', 'Marsh'];
const TEAM_COLOR = ['#e8c050', '#d84a3a', '#aaaaaa', '#4aa0e0'];

let doc: MapDoc = blankDoc();
let terrain = rleDecode(doc.terrain, doc.w * doc.h);
let height = rleDecode(doc.height, doc.w * doc.h);
let tool = 'terrain';
let brush = 1;
let paint = 0;
let kindSel = 0;
let teamSel = 0;
let selUnit = -1;
let tab = 'script';
let dragStart: [number, number] | null = null;
let hoverTile: [number, number] = [0, 0];
let pick: ((x: number, y: number) => void) | null = null;
let dirty = false;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;

type Child = Node | string;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...kids);
  return el;
}

function sync(): void {
  doc.terrain = rleEncode(terrain);
  doc.height = rleEncode(height);
}
function save(): void {
  sync();
  try {
    localStorage.setItem(DRAFT, JSON.stringify(doc));
  } catch {
    // storage may be blocked; the file download still works
  }
}
function touch(): void {
  dirty = true;
  save();
  draw();
  $('info').textContent = `${doc.name} · ${doc.w}×${doc.h} · ${doc.units.length} units · ${doc.triggers.length} triggers`;
}

function setDoc(d: MapDoc): void {
  doc = d;
  terrain = rleDecode(d.terrain, d.w * d.h);
  height = rleDecode(d.height, d.w * d.h);
  selUnit = -1;
  cv.width = d.w * Z;
  cv.height = d.h * Z;
  buildTools();
  buildSide();
  touch();
}

// ---------- canvas ----------
function draw(): void {
  const { w, h: hh } = doc;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      ctx.fillStyle = TERRAIN_COLOR[terrain[i]] ?? '#f0f';
      ctx.fillRect(x * Z, y * Z, Z, Z);
      if (height[i] !== 1) {
        ctx.fillStyle = height[i] > 1 ? `rgba(255,255,255,${0.12 * (height[i] - 1)})` : 'rgba(0,0,0,0.25)';
        ctx.fillRect(x * Z, y * Z, Z, Z);
      }
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  for (let x = 0; x <= w; x++) (ctx.moveTo(x * Z + 0.5, 0), ctx.lineTo(x * Z + 0.5, hh * Z));
  for (let y = 0; y <= hh; y++) (ctx.moveTo(0, y * Z + 0.5), ctx.lineTo(w * Z, y * Z + 0.5));
  ctx.stroke();
  for (const o of doc.objects) {
    if (o.kind === ObjectKind.Tree) {
      ctx.fillStyle = '#1f4a22';
      ctx.beginPath();
      ctx.arc(o.x * Z + Z / 2, o.y * Z + Z / 2, Z / 2 - 1, 0, 7);
      ctx.fill();
    } else {
      ctx.fillStyle = '#a0522d';
      ctx.fillRect(o.x * Z + 1, o.y * Z + 1, Z * 2 - 2, Z * 2 - 2);
    }
  }
  ctx.lineWidth = 2;
  ctx.font = '10px sans-serif';
  for (const r of doc.regions) {
    ctx.strokeStyle = '#ffe070';
    ctx.strokeRect(r.x1 * Z + 1, r.y1 * Z + 1, (r.x2 - r.x1 + 1) * Z - 2, (r.y2 - r.y1 + 1) * Z - 2);
    ctx.fillStyle = '#ffe070';
    ctx.fillText(r.name, r.x1 * Z + 3, r.y1 * Z + 11);
  }
  doc.units.forEach((u, i) => {
    ctx.fillStyle = TEAM_COLOR[u.team] ?? '#fff';
    ctx.globalAlpha = u.dormant ? 0.5 : 1;
    ctx.beginPath();
    ctx.arc(u.x * Z + Z / 2, u.y * Z + Z / 2, Z / 2 - 1, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = i === selUnit ? '#fff' : '#000';
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fillText(String(i), u.x * Z + 2, u.y * Z + 11);
  });
  ctx.lineWidth = 1;
  if (dragStart) {
    ctx.strokeStyle = '#fff';
    const [x1, y1, x2, y2] = [Math.min(dragStart[0], hoverTile[0]), Math.min(dragStart[1], hoverTile[1]), Math.max(dragStart[0], hoverTile[0]), Math.max(dragStart[1], hoverTile[1])];
    ctx.strokeRect(x1 * Z, y1 * Z, (x2 - x1 + 1) * Z, (y2 - y1 + 1) * Z);
  }
}

const tileOf = (e: PointerEvent): [number, number] => {
  const r = cv.getBoundingClientRect();
  return [Math.max(0, Math.min(doc.w - 1, Math.floor((e.clientX - r.left) / Z))), Math.max(0, Math.min(doc.h - 1, Math.floor((e.clientY - r.top) / Z)))];
};

function brushAt(x: number, y: number): void {
  const half = Math.floor(brush / 2);
  for (let dy = -half; dy < brush - half; dy++) {
    for (let dx = -half; dx < brush - half; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= doc.w || ty >= doc.h) continue;
      if (tool === 'terrain') terrain[ty * doc.w + tx] = paint;
      else if (tool === 'height') height[ty * doc.w + tx] = paint;
    }
  }
}

function stamp(x: number, y: number): void {
  if (pick) {
    pick(x, y);
    pick = null;
    return;
  }
  if (tool === 'terrain' || tool === 'height') brushAt(x, y);
  else if (tool === 'tree' || tool === 'house') {
    if (!doc.objects.some((o) => o.x === x && o.y === y)) doc.objects.push({ kind: tool === 'tree' ? ObjectKind.Tree : ObjectKind.House, x, y, ...(tool === 'house' ? { owner: 1, hp: 100 } : {}) });
  } else if (tool === 'erase') {
    const k = doc.objects.findIndex((o) => o.x === x && o.y === y);
    if (k >= 0) doc.objects.splice(k, 1);
    const u = doc.units.findIndex((q, i) => i > 0 && q.x === x && q.y === y);
    if (u >= 0) removeUnit(u);
  } else if (tool === 'unit') {
    if (!doc.units.some((q) => q.x === x && q.y === y)) {
      doc.units.push({ kind: kindSel, team: teamSel, x, y } as UnitDef);
      selUnit = doc.units.length - 1;
    }
    buildSide();
  } else if (tool === 'select') {
    const u = doc.units.findIndex((q) => q.x === x && q.y === y);
    if (u >= 0) {
      selUnit = u;
      tab = 'units';
      buildSide();
    }
  }
}

/** Removing a unit renumbers the ones after it, so script references to them are shifted too. */
function removeUnit(u: number): void {
  doc.units.splice(u, 1);
  const fix = (r: Ref, def: { params: Param[] } | undefined): void => {
    def?.params.forEach((p, i) => {
      if (p.kind === 'unit' && r.a[i] > u) r.a[i]--;
    });
  };
  for (const t of doc.triggers) {
    for (const c of t.conds) (fix(c.a, checkDef(c.a.k)), fix(c.b, checkDef(c.b.k)));
    for (const a of t.acts) fix(a, actionDef(a.k));
  }
  selUnit = -1;
  buildSide();
}

cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const [x, y] = tileOf(e);
  if (tool === 'region') dragStart = [x, y];
  else stamp(x, y);
  hoverTile = [x, y];
  touch();
});
cv.addEventListener('pointermove', (e) => {
  const [x, y] = tileOf(e);
  if (x === hoverTile[0] && y === hoverTile[1]) return;
  hoverTile = [x, y];
  $('info').textContent = `tile ${x}, ${y} · ${TERRAIN_NAMES[terrain[y * doc.w + x]]} · height ${height[y * doc.w + x]}`;
  if (e.buttons && (tool === 'terrain' || tool === 'height')) {
    brushAt(x, y);
    draw();
  } else if (dragStart) draw();
});
cv.addEventListener('pointerup', (e) => {
  if (tool === 'terrain' || tool === 'height') touch();
  if (dragStart) {
    const [x, y] = tileOf(e);
    const name = prompt('Region name', `region${doc.regions.length + 1}`);
    if (name) doc.regions.push({ name, x1: Math.min(dragStart[0], x), y1: Math.min(dragStart[1], y), x2: Math.max(dragStart[0], x), y2: Math.max(dragStart[1], y) });
    dragStart = null;
    touch();
    buildSide();
  }
});

// ---------- left tools ----------
function buildTools(): void {
  const el = $('tools');
  el.replaceChildren();
  const toolBtn = (id: string, label: string): HTMLButtonElement => {
    const b = h('button', { textContent: label, className: tool === id ? 'on' : '' });
    b.onclick = () => {
      tool = id;
      buildTools();
    };
    return b;
  };
  el.append(
    h('h3', { textContent: 'Tool' }),
    h('div', { className: 'row' }, toolBtn('select', 'Select'), toolBtn('terrain', 'Terrain'), toolBtn('height', 'Height'), toolBtn('tree', 'Tree'), toolBtn('house', 'Building'), toolBtn('unit', 'Unit'), toolBtn('region', 'Region'), toolBtn('erase', 'Erase')),
  );
  if (tool === 'terrain' || tool === 'height') {
    const names = tool === 'terrain' ? TERRAIN_NAMES : ['Low 0', 'Normal 1', 'High 2', 'Peak 3'];
    const sel = h('select', {}, ...names.map((n, i) => h('option', { value: String(i), textContent: n })));
    sel.value = String(Math.min(paint, names.length - 1));
    sel.onchange = () => (paint = Number(sel.value));
    paint = Number(sel.value);
    const bs = h('select', {}, ...[1, 2, 3, 5].map((n) => h('option', { value: String(n), textContent: `${n}×${n}` })));
    bs.value = String(brush);
    bs.onchange = () => (brush = Number(bs.value));
    el.append(h('h3', { textContent: 'Paint' }), sel, h('br'), h('label', {}, 'Brush ', bs));
  }
  if (tool === 'unit') {
    const k = h('select', {}, ...DEFS.map((d, i) => h('option', { value: String(i), textContent: d.name })));
    k.value = String(kindSel);
    k.onchange = () => (kindSel = Number(k.value));
    const t = h('select', {}, ...doc.players.map((p, i) => h('option', { value: String(i), textContent: `${i}: ${p}` })));
    t.value = String(teamSel);
    t.onchange = () => (teamSel = Number(t.value));
    el.append(h('h3', { textContent: 'New unit' }), k, h('br'), t);
  }
  el.append(
    h('h3', { textContent: 'Map' }),
    h('label', {}, 'Name ', Object.assign(h('input', { value: doc.name }), { onchange(this: HTMLInputElement) { doc.name = this.value; touch(); } })),
    h('small', { textContent: `Format version ${MAP_VERSION}. Units are numbered; unit 0 is your hero.` }),
  );
}

// ---------- right side ----------
function numInput(v: number, on: (n: number) => void, title = ''): HTMLInputElement {
  const i = h('input', { type: 'number', value: String(v), title });
  i.onchange = () => {
    on(Math.trunc(Number(i.value)) || 0);
    touch();
  };
  return i;
}

function paramInput(p: Param, ref: Ref, k: number, next?: Param): Node {
  const v = ref.a[k] ?? 0;
  const set = (n: number): void => void (ref.a[k] = n);
  if (p.kind === 'enum') {
    const s = h('select', {}, ...(p.options ?? []).map((o, i) => h('option', { value: String(i), textContent: o })));
    s.value = String(v);
    s.onchange = () => (set(Number(s.value)), touch());
    return h('label', {}, `${p.name} `, s);
  }
  if (p.kind === 'item' || p.kind === 'spell') {
    const list = p.kind === 'item' ? ITEMS.map((i) => i.name) : SPELLS.map((s) => s.name);
    const s = h('select', {}, ...list.map((o, i) => h('option', { value: String(i), textContent: o })));
    s.value = String(v);
    s.onchange = () => (set(Number(s.value)), touch());
    return h('label', {}, `${p.name} `, s);
  }
  if (p.kind === 'player') {
    const s = h('select', {}, ...doc.players.map((o, i) => h('option', { value: String(i), textContent: `${i}: ${o}` })));
    s.value = String(v);
    s.onchange = () => (set(Number(s.value)), touch());
    return h('label', {}, `${p.name} `, s);
  }
  const inp = numInput(v, set, p.name);
  const label = h('label', {}, `${p.name} `, inp);
  if (p.kind === 'x' && next?.kind === 'y') {
    const b = h('button', { textContent: '⌖', title: 'Pick a tile on the map' });
    b.onclick = () => {
      $('info').textContent = 'Click a tile on the map…';
      pick = (x, y) => {
        ref.a[k] = x;
        ref.a[k + 1] = y;
        buildSide();
        touch();
      };
    };
    label.append(b);
  }
  return label;
}

function refEditor(ref: Ref, defs: { key: string; label: string; params: Param[] }[]): HTMLElement {
  const sel = h('select', {}, ...defs.map((d) => h('option', { value: d.key, textContent: d.label })));
  sel.value = ref.k;
  sel.onchange = () => {
    ref.k = sel.value;
    ref.a = (defs.find((d) => d.key === sel.value)?.params ?? []).map(() => 0);
    buildSide();
    touch();
  };
  const def = defs.find((d) => d.key === ref.k);
  def?.params.forEach((_p, i) => {
    while (ref.a.length < def.params.length) ref.a.push(0);
  });
  return h('div', { className: 'line' }, sel, ...(def?.params ?? []).map((p, i) => paramInput(p, ref, i, def!.params[i + 1])));
}

function triggerEditor(t: Trigger, n: number): HTMLElement {
  const box = h('div', { className: 'trig' });
  const id = h('input', { type: 'text', value: t.id });
  id.onchange = () => ((t.id = id.value), touch());
  const once = h('input', { type: 'checkbox', checked: t.once });
  once.onchange = () => ((t.once = once.checked), touch());
  const on = h('input', { type: 'checkbox', checked: t.enabled });
  on.onchange = () => ((t.enabled = on.checked), touch());
  const del = h('button', { textContent: 'Delete' });
  del.onclick = () => {
    doc.triggers.splice(n, 1);
    buildSide();
    touch();
  };
  box.append(h('div', { className: 'line' }, id, h('label', {}, once, ' once'), h('label', {}, on, ' enabled'), del));
  box.append(h('small', { textContent: 'When ALL of these hold (up to 3):' }));
  t.conds.forEach((c, ci) => {
    const op = h('select', {}, ...OPS.map((o, i) => h('option', { value: String(i), textContent: o })));
    op.value = String(c.op);
    op.onchange = () => ((c.op = Number(op.value)), touch());
    const rm = h('button', { textContent: '×' });
    rm.onclick = () => (t.conds.splice(ci, 1), buildSide(), touch());
    box.append(refEditor(c.a, CHECKS), h('div', { className: 'line' }, op, rm), refEditor(c.b, CHECKS));
  });
  if (t.conds.length < 3) {
    const add = h('button', { textContent: '+ condition' });
    add.onclick = () => (t.conds.push({ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }), buildSide(), touch());
    box.append(add);
  }
  box.append(h('br'), h('small', { textContent: 'Do (up to 4):' }));
  t.acts.forEach((a, ai) => {
    const rm = h('button', { textContent: '×' });
    rm.onclick = () => (t.acts.splice(ai, 1), buildSide(), touch());
    box.append(refEditor(a, ACTIONS), rm);
  });
  if (t.acts.length < 4) {
    const add = h('button', { textContent: '+ action' });
    add.onclick = () => (t.acts.push({ k: 'message', a: [1] }), buildSide(), touch());
    box.append(add);
  }
  return box;
}

function unitPanel(): HTMLElement {
  const root = h('div');
  const u = doc.units[selUnit];
  root.append(h('small', { textContent: 'Use the Select tool and click a unit. Units are numbered as drawn on the map.' }));
  if (!u) return root;
  const k = h('select', {}, ...DEFS.map((d, i) => h('option', { value: String(i), textContent: d.name })));
  k.value = String(u.kind);
  k.onchange = () => ((u.kind = Number(k.value)), touch());
  const t = h('select', {}, ...doc.players.map((p, i) => h('option', { value: String(i), textContent: `${i}: ${p}` })));
  t.value = String(u.team);
  t.onchange = () => ((u.team = Number(t.value)), touch());
  const flag = (label: string, key: 'dormant' | 'vip'): HTMLElement => {
    const c = h('input', { type: 'checkbox', checked: !!u[key] });
    c.onchange = () => ((u[key] = c.checked || undefined), touch());
    return h('label', {}, c, ` ${label} `);
  };
  const del = h('button', { textContent: 'Delete unit', disabled: selUnit === 0 });
  del.onclick = () => (removeUnit(selUnit), touch());
  root.append(
    h('h3', { textContent: `Unit ${selUnit}` }),
    h('div', { className: 'line' }, k, t),
    h('div', { className: 'line' }, h('label', {}, 'Group ', numInput(u.group ?? 0, (n) => (u.group = n || undefined))), h('label', {}, 'Pack ', numInput(u.pack ?? 0, (n) => (u.pack = n || undefined)))),
    h('div', { className: 'line' }, flag('starts phased out', 'dormant'), flag('VIP', 'vip')),
    del,
  );
  return root;
}

function textPanel(): HTMLElement {
  const ta = h('textarea', { value: Object.entries(doc.text).map(([k, v]) => `${k} = ${v}`).join('\n') });
  ta.onchange = () => {
    const t: Record<string, string> = {};
    for (const line of ta.value.split('\n')) {
      const m = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(line);
      if (m) t[m[1]] = m[2];
    }
    doc.text = t;
    touch();
  };
  return h('div', {}, h('small', { textContent: 'One "key = text" per line: title, body, obj.0, obj.1…, msg.N, msg.N.who, win, fail.N' }), ta);
}

function regionPanel(): HTMLElement {
  const root = h('div', {}, h('small', { textContent: 'Draw regions with the Region tool. Use ⌖ in a trigger to copy a tile.' }));
  doc.regions.forEach((r, i) => {
    const del = h('button', { textContent: '×' });
    del.onclick = () => (doc.regions.splice(i, 1), buildSide(), touch());
    root.append(h('div', { className: 'line' }, `${r.name}: ${r.x1},${r.y1} → ${r.x2},${r.y2} `, del));
  });
  const w = numInput(doc.w, () => undefined);
  const hh = numInput(doc.h, () => undefined);
  const resize = h('button', { textContent: 'Resize map' });
  resize.onclick = () => {
    const nw = Math.max(MIN_SIDE, Math.min(MAX_SIDE, Number(w.value)));
    const nh = Math.max(MIN_SIDE, Math.min(MAX_SIDE, Number(hh.value)));
    const t = new Uint8Array(nw * nh);
    const g = new Uint8Array(nw * nh).fill(1);
    for (let y = 0; y < Math.min(nh, doc.h); y++) for (let x = 0; x < Math.min(nw, doc.w); x++) ((t[y * nw + x] = terrain[y * doc.w + x]), (g[y * nw + x] = height[y * doc.w + x]));
    doc.w = nw;
    doc.h = nh;
    doc.objects = doc.objects.filter((o) => o.x < nw && o.y < nh);
    doc.units = doc.units.filter((u, i) => i === 0 || (u.x < nw && u.y < nh));
    doc.regions = doc.regions.filter((r) => r.x2 < nw && r.y2 < nh);
    terrain = t;
    height = g;
    sync();
    setDoc(doc);
  };
  root.append(h('h3', { textContent: 'Size' }), h('div', { className: 'line' }, w, '×', hh, resize));
  return root;
}

function scriptPanel(): HTMLElement {
  const root = h('div');
  doc.triggers.forEach((t, i) => root.append(triggerEditor(t, i)));
  const add = h('button', { textContent: '+ New trigger' });
  add.onclick = () => (doc.triggers.push({ id: `trigger${doc.triggers.length + 1}`, once: true, enabled: true, conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }], acts: [] }), buildSide(), touch());
  root.append(add);
  return root;
}

function buildSide(): void {
  const el = $('side');
  el.replaceChildren();
  const tabs = h('div', { className: 'tabs' });
  for (const [id, label] of [['script', 'Script'], ['units', 'Unit'], ['text', 'Text'], ['map', 'Regions & size']]) {
    const b = h('button', { textContent: label, className: tab === id ? 'on' : '' });
    b.onclick = () => ((tab = id), buildSide());
    tabs.append(b);
  }
  el.append(tabs, tab === 'script' ? scriptPanel() : tab === 'units' ? unitPanel() : tab === 'text' ? textPanel() : regionPanel(), h('div', { id: 'errors' }));
}

// ---------- header buttons ----------
function check(): string[] {
  sync();
  const errs = validate(migrate(JSON.parse(JSON.stringify(doc))));
  $('errors').textContent = errs.length ? errs.join('\n') : 'No problems found.';
  return errs;
}
$('b-new').onclick = () => {
  const w = Number(prompt(`Width in tiles (${MIN_SIDE}-${MAX_SIDE})`, '48'));
  const hh = Number(prompt(`Height in tiles (${MIN_SIDE}-${MAX_SIDE})`, '36'));
  if (w >= MIN_SIDE && w <= MAX_SIDE && hh >= MIN_SIDE && hh <= MAX_SIDE) setDoc(blankDoc(Math.trunc(w), Math.trunc(hh)));
};
$('b-open').onclick = () => $('f-open').click();
$<HTMLInputElement>('f-open').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const d = migrate(JSON.parse(await f.text()));
    setDoc(d);
    check();
  } catch (err) {
    $('errors').textContent = (err as Error).message;
  }
};
$('b-save').onclick = () => {
  sync();
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' })), download: `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'map'}.map.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  dirty = false;
};
$('b-check').onclick = () => void check();
$('b-test').onclick = () => {
  if (check().length) return;
  try {
    loadDoc(JSON.parse(JSON.stringify(doc)));
    localStorage.setItem(TEST_KEY, JSON.stringify(doc));
    window.open('./?mission=test', '_blank');
  } catch (err) {
    $('errors').textContent = (err as Error).message;
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

// ---------- start ----------
try {
  const raw = localStorage.getItem(DRAFT);
  if (raw) doc = migrate(JSON.parse(raw));
} catch {
  doc = blankDoc();
}
void Terrain;
(window as unknown as { __editor: unknown }).__editor = { get doc() { return (sync(), doc); }, setDoc, check };
setDoc(doc);
dirty = false;
