/* Headless Act 1 bot playthrough. Run: npx vitest run -c vitest.playthrough.config.ts
 * Env: CLS (0 warrior, 1 mage, 2 archer, 3 necro), FEMALE=1, DIFF.
 * Writes .planning/evidence/act1-playthrough/cls<N><m|f>/{log.jsonl,summary.json}. */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { newProgress, parseCampaign, townSeed } from '../../src/campaign';
import { applyCarryover, extractCarryover, waivePurse, type CarryoverState } from '../../src/carryover';
import { afterMission, afterTown } from '../../src/flow';
import { loadDoc } from '../../src/mapdoc';
import { BUILT_IN, createMission, type MissionGame } from '../../src/mission';
import { blocker, createHero, heroCommand } from '../../src/sim/hero';
import { FP, type Command } from '../../src/sim/sim';
import { priceOf, Role, townCommand } from '../../src/sim/town';

const CLS = Number(process.env.CLS ?? 0);
const FEMALE = process.env.FEMALE === '1';
const DIFF = Number(process.env.DIFF ?? 1);
const OUT = new URL(`../../../.planning/evidence/act1-playthrough/cls${CLS}${FEMALE ? 'f' : 'm'}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });
const LOGF = new URL('log.jsonl', OUT);
writeFileSync(LOGF, '');
const log = (o: Record<string, unknown>): void => appendFileSync(LOGF, JSON.stringify(o) + '\n');

const campaign = parseCampaign(JSON.parse(readFileSync(new URL('../../public/data/campaign.json', import.meta.url), 'utf8')));
const ORDER = ['m01-blood-at-the-ford', 'town-thornwick', 'm02-whispers-in-the-fen', 'm03-nightfall-at-ravenwatch', 'm04-the-sunken-sanctum', 'm05-lantern-passage', 'm06-greywood-supply', 'm07-split-vanguard', 'm08-alder-bridge', 'm09-ironhide-hunt', 'm10-undervault-links', 'm11-ashbrook-retreat'];

const alive = (g: MissionGame, team: number): number[] => {
  const s = g.sim;
  const o: number[] = [];
  for (let id = 0; id < s.count; id++) if (s.team[id] === team && !s.hidden[id] && s.cb.hp[id] > 0) o.push(id);
  return o;
};
const dist = (g: MissionGame, a: number, x: number, y: number): number => Math.hypot(g.sim.x[a] / FP - x, g.sim.y[a] / FP - y);

type Def = ReturnType<MissionGame['sim']['getItemDef']>;
function score(d: Def): number {
  if (!d) return 0;
  return d.min + d.max * 1.5 + d.def * 3 + d.abs * 3 + d.hp * 0.2 + d.mana * 0.1 + d.pow * 0.5 + d.attr.reduce((a, b) => a + b, 0) * 4 + (d.lifesteal ?? 0) + (d.crit ?? 0);
}

function spendPoints(g: MissionGame): void {
  const h = g.sim.hero!;
  const main = CLS === 1 || CLS === 3 ? 2 : 0;
  let n = 0;
  while ((h.statPoints ?? 0) > 0 && n++ < 200) heroCommand(g.sim, { type: 'hero', op: 'stat', attr: n % 3 === 0 ? 1 : main });
  n = 0;
  const spell = CLS === 1 || CLS === 3 ? 4 : 7;
  while ((h.skillPoints ?? 0) > 0 && n++ < 50) heroCommand(g.sim, { type: 'hero', op: 'rank', spell });
}

function equipBest(g: MissionGame): number {
  const h = g.sim.hero!;
  const sim = g.sim;
  let n = 0;
  for (const st of [...h.inv]) {
    const d = sim.getItemDef(st.item);
    if (!d || d.slot < 0 || blocker(h, st.item) !== 0) continue;
    const cur = h.eq[d.slot] >= 0 ? sim.getItemDef(h.eq[d.slot]) : undefined;
    if (score(d) > score(cur) + 0.5) {
      heroCommand(sim, { type: 'hero', op: 'equip', item: st.item });
      n++;
    }
  }
  return n;
}

function townVisit(g: MissionGame, nodeId: string): Record<string, unknown> {
  const sim = g.sim;
  const h = sim.hero!;
  const rep: Record<string, unknown> = { node: nodeId, goldStart: sim.cb.gold[0], lvl: h.level };
  const t = sim.towns[0];
  const go = (role: number): boolean => {
    const c = t.centre[role];
    if (!c) return false;
    sim.place(0, c[0] - 0.5 + 1, c[1] - 0.5 + 1);
    return true;
  };
  if (go(Role.Tavern)) {
    townCommand(sim, { type: 'town', op: 'enter', town: 0, v: Role.Tavern });
    rep.goldAfterHandIn = sim.cb.gold[0];
    for (let o = 0; o < 3; o++) townCommand(sim, { type: 'town', op: 'accept', town: 0, v: o });
    for (let m = 0; m < 6; m++) townCommand(sim, { type: 'town', op: 'hire', town: 0, v: m });
    townCommand(sim, { type: 'town', op: 'leave', town: 0 });
  } else rep.noTavern = true;
  const shopLog: unknown[] = [];
  for (let r = 0; r < 4; r++) {
    if (!go(Role.Shop)) {
      rep.noShop = true;
      break;
    }
    townCommand(sim, { type: 'town', op: 'enter', town: 0, v: Role.Shop });
    const shelf = sim.town.stock[0];
    let gold = sim.cb.gold[0];
    const picks: number[] = [];
    const seenSlot = new Set<number>();
    const cand = shelf.map((id, k) => ({ id, k })).filter((c) => c.id >= 0);
    cand.sort((a, b) => score(sim.getItemDef(b.id)) / Math.max(1, priceOf(b.id)) - score(sim.getItemDef(a.id)) / Math.max(1, priceOf(a.id)));
    for (const c of cand) {
      const d = sim.getItemDef(c.id);
      if (!d || d.slot < 0) continue;
      const p = priceOf(c.id);
      if (p > gold || blocker(h, c.id) !== 0) continue;
      const cur = h.eq[d.slot] >= 0 ? sim.getItemDef(h.eq[d.slot]) : undefined;
      if (score(d) <= score(cur) * 1.15 + 1 || seenSlot.has(d.slot)) continue;
      seenSlot.add(d.slot);
      picks.push(c.k);
      gold -= p;
    }
    if (picks.length) townCommand(sim, { type: 'town', op: 'deal', town: 0, list: picks });
    const eqd = equipBest(g);
    if (r === 3) {
      const pk = cand.filter((c) => { const d = sim.getItemDef(c.id); return d && d.slot < 0 && d.heal > 0 && priceOf(c.id) <= sim.cb.gold[0]; }).slice(0, 2).map((c) => c.k);
      if (pk.length) townCommand(sim, { type: 'town', op: 'deal', town: 0, list: [...pk, ...pk, ...pk] });
    }
    shopLog.push({ pass: r, stock: cand.length, tiers: cand.map((c) => sim.getItemDef(c.id)?.tier).join(''), bought: picks.length, equipped: eqd, gold: sim.cb.gold[0] });
    townCommand(sim, { type: 'town', op: 'leave', town: 0 });
  }
  rep.shop = shopLog;
  rep.goldEnd = sim.cb.gold[0];
  rep.eq = h.eq.map((i) => (i >= 0 ? sim.getItemDef(i)?.name : null));
  rep.invCount = h.inv.length;
  return rep;
}


import { Buffer as Buf } from 'node:buffer';
async function renderMap(g: MissionGame, label: string, trace: [number, number][], enemies: [number, number][]): Promise<void> {
  const { map } = g.sim;
  const doc = loadDoc(BUILT_IN[(campaign.nodes.find((n) => n.id === label)?.map) ?? 'ford']) as unknown as { regions?: unknown[] };
  const data = { id: label, w: map.w, h: map.h, terrain: Buf.from(map.terrain).toString('base64'), light: Buf.from(map.light).toString('base64'), trace, enemies, regions: doc.regions ?? [], shrines: (g.sim as unknown as { shrines?: unknown[] }).shrines ?? [] };
  writeFileSync(new URL(`map-${label.slice(0, 3)}.json`, OUT), JSON.stringify(data));
}
const pending: Promise<void>[] = [];
function playMission(g: MissionGame, label: string): { win: boolean; ticks: number; notes: Record<string, unknown> } {
  const sim = g.sim;
  const st = sim.script!.st;
  const REGS = ((loadDoc(BUILT_IN[campaign.nodes.find((n) => n.id === label)!.map]) as unknown as { regions?: { x1: number; y1: number; x2: number; y2: number }[] }).regions) ?? [];
  const LIMIT = 30_000;
  let minHp = sim.cb.hp[0];
  let potions = 0;
  let lastProgress = 0;
  let lastSig = '';
  const notes: Record<string, unknown> = {};
  let ac = -1;
  let lastKill = 0;
  let lastFoes = -1;
  // greedy tour over enemy clusters (24-tile cells), nearest-first from the hero
  const cl = new Map<string, { x: number; y: number; n: number }>();
  for (const id of alive(g, 1)) {
    const cx = sim.x[id] / FP, cy = sim.y[id] / FP;
    const k = Math.floor(cx / 24) + ',' + Math.floor(cy / 24);
    const c = cl.get(k) ?? { x: 0, y: 0, n: 0 };
    c.x += cx; c.y += cy; c.n++; cl.set(k, c);
  }
  const pts = [...cl.values()].map((c) => ({ x: c.x / c.n, y: c.y / c.n }));
  const tour: { x: number; y: number }[] = [];
  let cur = { x: sim.x[0] / FP, y: sim.y[0] / FP };
  while (pts.length) {
    let bi = 0, bd = 1e9;
    pts.forEach((q, i) => { const d = Math.hypot(q.x - cur.x, q.y - cur.y); if (d < bd) { bd = d; bi = i; } });
    cur = pts.splice(bi, 1)[0]; tour.push(cur);
  }
  let wp = 0;
  const trace: [number, number][] = [];
  const enemies0: [number, number][] = alive(g, 1).map((id) => [sim.x[id] / FP, sim.y[id] / FP]);
  while (sim.tick < LIMIT && st.status === 0) {
    const player: Command[] = [];
    if (sim.tick % 20 === 0) {
      const h = sim.hero!;
      spendPoints(g);
      const hpPct = sim.cb.hp[0] / sim.cb.hpMax[0];
      if (hpPct < 0.4) {
        const p = h.inv.find((s) => { const d = sim.getItemDef(s.item); return d && d.slot < 0 && d.heal > 0; });
        if (p) { heroCommand(sim, { type: 'hero', op: 'use', item: p.item }); potions++; }
      }
      const want = CLS === 0 || CLS === 2 ? 7 : hpPct < 0.6 && sim.cb.mana[0] >= 8 ? 7 : 4;
      if (want !== ac) { player.push({ type: 'autocast', ids: [0], spell: want }); ac = want; }
      const friends = alive(g, 0);
      const foes = alive(g, 1);
      let tx = sim.map.w / 2;
      let ty = sim.map.h / 2;
      let objT: { x: number; y: number } | null = null;
      const regs = (g.sim as unknown as { map: { regions?: { x1: number; y1: number; x2: number; y2: number }[] } }).map.regions ?? REGS;
      for (let i = 0; i < regs.length && i < st.sub.length; i++) if (st.sub[i] === 1) { objT = { x: (regs[i].x1 + regs[i].x2) / 2, y: (regs[i].y1 + regs[i].y2) / 2 }; break; }
      while (wp < tour.length && !foes.some((f) => Math.hypot(sim.x[f] / FP - tour[wp].x, sim.y[f] / FP - tour[wp].y) < 16)) wp++;
      if (objT && (wp >= tour.length || foes.length === 0)) { tx = objT.x; ty = objT.y; }
      else if (wp < tour.length) { tx = tour[wp].x; ty = tour[wp].y; }
      else if (foes.length) {
        const sorted = [...foes].sort((a, b) => dist(g, a, sim.x[0] / FP, sim.y[0] / FP) - dist(g, b, sim.x[0] / FP, sim.y[0] / FP));
        const best = sorted[Math.floor((sim.tick - lastKill) / 400) % sorted.length];
        if (foes.length !== lastFoes) { lastFoes = foes.length; lastKill = sim.tick; }
        tx = sim.x[best] / FP;
        ty = sim.y[best] / FP;
      }
      player.push({ type: 'order', order: 'attack', ids: friends, x: tx, y: ty });
    }
    sim.step([...g.ai.commands(sim), ...player]);
    if (sim.tick % 100 === 0) trace.push([sim.x[0] / FP, sim.y[0] / FP]);
    minHp = Math.min(minHp, sim.cb.hp[0]);
    const sig = JSON.stringify([...st.sub, alive(g, 1).length]);
    if (sig !== lastSig) { lastSig = sig; lastProgress = sim.tick; }
    if (sim.tick - lastProgress > 12_000) {
      notes.stuck = { tick: sim.tick, sub: [...st.sub], foes: alive(g, 1).length, hero: [Math.round(sim.x[0] / FP), Math.round(sim.y[0] / FP)] };
      break;
    }
    if (sim.cb.hp[0] <= 0) break;
  }
  Object.assign(notes, { minHpPct: +(minHp / sim.cb.hpMax[0]).toFixed(2), potions, friendsEnd: alive(g, 0).length, level: sim.hero!.level, status: st.status, cause: st.cause, sub: [...st.sub] });
  pending.push(renderMap(g, label, trace, enemies0));
  log({ ev: 'mission-end', label, ticks: sim.tick, ...notes });
  return { win: st.status === 1, ticks: sim.tick, notes };
}

it('Act 1 bot playthrough', async () => {
  let prog = newProgress(campaign, DIFF);
  let carry: CarryoverState | null = null;
  const summary: Record<string, unknown>[] = [];
  for (const id of ORDER) {
    const node = campaign.nodes.find((n) => n.id === id)!;
    const isTown = node.kind === 'town';
    const g = createMission(loadDoc(BUILT_IN[node.map]), townSeed(1, prog.townVisits + (isTown ? 1 : 0)));
    createHero(g.sim, 0, CLS, FEMALE, DIFF);
    waivePurse(g.sim, prog.townVisits);
    if (carry) applyCarryover(g.sim, carry);
    const lvlStart = g.sim.hero!.level;
    const goldStart = g.sim.cb.gold[0];
    const rec0 = { hero: { cls: CLS, female: FEMALE }, progress: prog, carry, last: null } as never;
    if (isTown) {
      const rep = townVisit(g, id);
      carry = extractCarryover(g.sim, prog, townSeed(1, prog.townVisits + 1), undefined);
      prog = afterTown(campaign, rec0, id, carry).progress;
      log({ ev: 'town', ...rep });
      summary.push(rep);
    } else {
      const r = playMission(g, id);
      const rep = { node: id, win: r.win, ticks: r.ticks, lvlStart, lvlEnd: g.sim.hero!.level, goldStart, goldEnd: g.sim.cb.gold[0], ...r.notes };
      summary.push(rep);
      if (!r.win) { log({ ev: 'FAILED', ...rep }); break; }
      carry = extractCarryover(g.sim, prog, townSeed(1, prog.townVisits + 1), undefined);
      prog = afterMission(campaign, rec0, id, true, carry, { text: '', up: 0, size: 0, gold: 0 }).progress;
    }
  }
  await Promise.all(pending);
  writeFileSync(new URL('summary.json', OUT), JSON.stringify(summary, null, 1));
}, 3_600_000);
