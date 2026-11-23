import { loadAchievements as loadAchievementsPack } from './data/text/index';

// Achievements: Gemini-authored defs + trigger table, evaluated against small persisted counters.
// UI-only; never touches the sim.
type Trig = { id: string; type: string; args: Record<string, unknown>; name?: string; desc?: string };
type Def = { id: string; name?: string; desc?: string; description?: string };
interface Stats { kills: number; hired: number; flawless: number; won: string[]; acts: number[]; maxLevel: number; maxGold: number; done: string[]; unlocked: string[]; fam: Record<string, number>; bosses: string[]; }
const KEY = 'thornvael.achievements.v1';
let stats: Stats = { kills: 0, hired: 0, flawless: 0, won: [], acts: [], maxLevel: 0, maxGold: 0, done: [], unlocked: [], fam: {}, bosses: [] };
let rosterBoss: Record<string, string> = {};
let prevAlive: boolean[] = [];
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
  const ro = (await get('mission-rosters.json')) as { mission_rosters?: { mission: string; boss: string | null }[] } | null;
  for (const r of ro?.mission_rosters ?? []) if (r.boss) rosterBoss[r.mission] = r.boss;
  for (const f of ['achievements', 'achievements-2', 'achievements-3']) {
    const a = (await get(`${f}.json`)) as Record<string, Def[]> | null;
    if (a) for (const k of Object.keys(a)) if (Array.isArray(a[k])) for (const d of a[k]) if (d?.id) defs.set(d.id, d);
  }
  try {
    const curated = await loadAchievementsPack(import.meta.env.BASE_URL);
    const seenIds = new Set(trigs.map((x) => x.id));
    for (const entry of curated.entries ?? []) {
      defs.set(entry.id, { id: entry.id, name: entry.title, desc: entry.desc });
      if (!seenIds.has(entry.id) && entry.condition?.metric) {
        const metric = entry.condition.metric;
        const target = entry.condition.target;
        const args: Record<string, unknown> =
          metric === 'act_done' ? { act: target }
            : metric === 'mission_won' ? { mission: target }
            : metric === 'boss_kill' ? { boss: target }
            : { n: target };
        if (metric === 'kills_total' || metric === 'merc_hired' || metric === 'flawless_mission' ||
            metric === 'hero_level' || metric === 'gold_held' || metric === 'mission_won' ||
            metric === 'act_done' || metric === 'boss_kill' || metric === 'win_gold_zero' ||
            metric === 'campaign_done') {
          trigs.push({ id: entry.id, type: metric, args, name: entry.title, desc: entry.desc });
          seenIds.add(entry.id);
        }
      }
    }
  } catch {
    /* offline or missing optional curated pack */
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
      case 'family_kills': ok = (stats.fam[String(t.args.family)] ?? 0) >= Number(t.args.count ?? 50); break;
      case 'boss_kill': ok = stats.bosses.includes(String(t.args.boss)); break;
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
/** Per tick: counts newly dead enemies by family into persistent counters. */
export function achTrack(count: number, team: ArrayLike<number>, hp: ArrayLike<number>, family: readonly string[]): void {
  let any = false;
  for (let i = 0; i < count; i++) {
    const foe = team[i] === 1;
    if (prevAlive[i] && foe && hp[i] <= 0) { const f = family[i]; if (f) { stats.fam[f] = (stats.fam[f] ?? 0) + 1; any = true; } }
    prevAlive[i] = foe && hp[i] > 0;
  }
  if (any) check();
}
export function achReset(): void { prevAlive = []; }
export function achHired(): void { stats.hired++; check(); }
export function achLevel(l: number): void { if (l > stats.maxLevel) { stats.maxLevel = l; check(); } }
export function achGold(g: number): void { if (g > stats.maxGold) { stats.maxGold = g; check(); } }
export function achWin(nodeId: string | null, act: number, lastOfAct: boolean, flawless: boolean, gold: number): void {
  const m = nodeId?.split('-')[0];
  if (m && !stats.won.includes(m)) stats.won.push(m);
  if (m && rosterBoss[m] && !stats.bosses.includes(rosterBoss[m])) stats.bosses.push(rosterBoss[m]);
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

// ---------------------------------------------------------------------------
// Pure achievement evaluator for src/data/achievements.json (no UI/DOM)
// ---------------------------------------------------------------------------

export type ConditionOp = '>=' | '<=' | '==' | 'in';

export interface AchievementCondition {
  metric: string;
  op: ConditionOp;
  target: number | string | boolean | (string | number)[];
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  condition: AchievementCondition;
  hidden: boolean;
  category: string;
}

export type AchievementMetrics = Record<string, number | string | boolean | undefined>;

export interface EvaluationResult {
  unlockedIds: string[];
  newlyUnlocked: AchievementDef[];
}

export interface AchievementDisplay {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  hidden: boolean;
  category: string;
}

/** Check whether a single condition spec is satisfied by the given metrics snapshot. */
export function matchesCondition(
  cond: AchievementCondition,
  metrics: AchievementMetrics,
): boolean {
  const val = metrics[cond.metric];
  if (val === undefined) return false;

  switch (cond.op) {
    case '>=':
      return typeof val === 'number' && typeof cond.target === 'number' && val >= cond.target;
    case '<=':
      return typeof val === 'number' && typeof cond.target === 'number' && val > 0 && val <= cond.target;
    case '==':
      return val === cond.target;
    case 'in':
      return Array.isArray(cond.target) && (cond.target as (string | number)[]).includes(val as string | number);
    default:
      return false;
  }
}

/** Purely evaluate achievements against metrics, preserving previously unlocked IDs. */
export function evaluateAchievements(
  defsList: readonly AchievementDef[],
  metrics: AchievementMetrics,
  alreadyUnlocked: readonly string[] = [],
): EvaluationResult {
  const unlockedSet = new Set(alreadyUnlocked);
  const newlyUnlocked: AchievementDef[] = [];

  for (const def of defsList) {
    if (unlockedSet.has(def.id)) continue;
    if (matchesCondition(def.condition, metrics)) {
      unlockedSet.add(def.id);
      newlyUnlocked.push(def);
    }
  }

  return {
    unlockedIds: Array.from(unlockedSet),
    newlyUnlocked,
  };
}

/** Format an achievement for display, masking hidden locked entries. */
export function formatAchievementForDisplay(
  def: AchievementDef,
  unlocked: boolean,
): AchievementDisplay {
  if (def.hidden && !unlocked) {
    return {
      id: def.id,
      name: 'Hidden Achievement',
      description: 'Continue your campaign in Thornvael to uncover this deed.',
      unlocked: false,
      hidden: true,
      category: def.category,
    };
  }
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    unlocked,
    hidden: def.hidden,
    category: def.category,
  };
}
