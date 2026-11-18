// Achievements: Gemini-authored defs + trigger table, evaluated against small persisted counters.
// UI-only; never touches the sim.
type Trig = { id: string; type: string; args: Record<string, unknown>; name?: string; desc?: string };
type Def = { id: string; name?: string; desc?: string; description?: string };
interface Stats { kills: number; hired: number; flawless: number; won: string[]; acts: number[]; maxLevel: number; maxGold: number; done: string[]; unlocked: string[]; }
const KEY = 'thornvael.achievements.v1';
let stats: Stats = { kills: 0, hired: 0, flawless: 0, won: [], acts: [], maxLevel: 0, maxGold: 0, done: [], unlocked: [] };
let trigs: Trig[] = [];
const defs = new Map<string, Def>();
let notify: (msg: string) => void = () => {};

function save(): void { try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* blocked */ } }

export async function loadAchievements(toast: (m: string) => void): Promise<void> {
  notify = toast;
  try { const r = localStorage.getItem(KEY); if (r) stats = { ...stats, ...JSON.parse(r) }; } catch { /* keep defaults */ }
  const base = `${import.meta.env.BASE_URL}data/content/`;
  const get = async (f: string): Promise<unknown> => { try { const r = await fetch(base + f); return r.ok ? await r.json() : null; } catch { return null; } };
  const t = (await get('achievement-triggers.json')) as { triggers?: Trig[] } | null;
  trigs = t?.triggers?.filter((x) => x.type !== 'unsupported') ?? [];
  for (const f of ['achievements', 'achievements-2', 'achievements-3']) {
    const a = (await get(`${f}.json`)) as Record<string, Def[]> | null;
    if (a) for (const k of Object.keys(a)) if (Array.isArray(a[k])) for (const d of a[k]) if (d?.id) defs.set(d.id, d);
  }
}

function check(): void {
  let changed = false;
  for (const t of trigs) {
    if (stats.unlocked.includes(t.id)) continue;
    const n = Number(t.args.n ?? 0);
    let ok = false;
    switch (t.type) {
      case 'kills_total': ok = stats.kills >= n; break;
      case 'merc_hired': ok = stats.hired >= n; break;
      case 'flawless_mission': ok = stats.flawless >= n; break;
      case 'hero_level': ok = stats.maxLevel >= n; break;
      case 'gold_held': ok = stats.maxGold >= n; break;
      case 'mission_won': ok = stats.won.includes(String(t.args.mission)); break;
      case 'act_done': ok = stats.acts.includes(Number(t.args.act)); break;
      case 'win_gold_zero': ok = stats.done.includes('goldzero'); break;
      case 'campaign_done': ok = stats.done.includes(`campaign:${t.args.difficulty ?? '*'}:${t.args.class ?? '*'}`); break;
      default: break;
    }
    if (!ok) continue;
    stats.unlocked.push(t.id); changed = true;
    const nm = t.name ?? defs.get(t.id)?.name, ds = t.desc ?? defs.get(t.id)?.desc ?? defs.get(t.id)?.description;
    if (nm) notify(`Achievement: ${nm}${ds ? ' — ' + ds : ''}`);
  }
  if (changed) save();
}

export function achKills(n: number): void { if (n > 0) { stats.kills += n; check(); } }
export function achHired(): void { stats.hired++; check(); }
export function achLevel(l: number): void { if (l > stats.maxLevel) { stats.maxLevel = l; check(); } }
export function achGold(g: number): void { if (g > stats.maxGold) { stats.maxGold = g; check(); } }
export function achWin(nodeId: string | null, act: number, lastOfAct: boolean, flawless: boolean, gold: number): void {
  const m = nodeId?.split('-')[0];
  if (m && !stats.won.includes(m)) stats.won.push(m);
  if (lastOfAct && !stats.acts.includes(act)) stats.acts.push(act);
  if (flawless) stats.flawless++;
  if (gold === 0 && !stats.done.includes('goldzero')) stats.done.push('goldzero');
  check(); save();
}
export function achCampaign(diff: string, cls: string): void {
  for (const k of [`campaign:${diff}:*`, `campaign:*:${cls}`, `campaign:${diff}:${cls}`, 'campaign:*:*']) if (!stats.done.includes(k)) stats.done.push(k);
  check(); save();
}
export function achCount(): { got: number; total: number } { return { got: stats.unlocked.length, total: trigs.length }; }
export function achList(): { name: string; desc: string; got: boolean }[] {
  return trigs.map((t) => { const d = defs.get(t.id); return { name: t.name ?? d?.name ?? t.id, desc: t.desc ?? d?.desc ?? d?.description ?? '', got: stats.unlocked.includes(t.id) }; });
}
