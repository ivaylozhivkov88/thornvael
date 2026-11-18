// Side quests: machine specs (content/quest-specs.json) tracked from kills by family and gold.
// UI-side only; never touches the deterministic sim state except the optional win bonus.
interface Obj { type: string; args: Record<string, number | string> }
interface Spec { id: string; mission: string; objectives: Obj[]; reward_bonus: number }
export interface ActiveQuest { id: string; title: string; objs: Obj[]; bonus: number; done: boolean }

let active: ActiveQuest[] = [];
let kills: Record<string, number> = {};
let total = 0;
let maxGold = 0;
let prevAlive: boolean[] = [];

function hash(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

/** Pick the quests of a mission key like "m07": all mission-specific plus two generic ones. */
export async function startSideQuests(key: string): Promise<ActiveQuest[]> {
  active = []; kills = {}; total = 0; maxGold = 0; prevAlive = [];
  try {
    const base = import.meta.env.BASE_URL;
    const r = await fetch(`${base}data/content/quest-specs.json`);
    if (!r.ok) return active;
    const specs = ((await r.json()) as { quest_specs: Spec[] }).quest_specs;
    const titles: Record<string, string> = {};
    for (const f of ['side-quests', 'side-quests-2', 'side-quests-3', 'side-quests-4']) {
      try {
        const q = await fetch(`${base}data/content/${f}.json`);
        if (q.ok) for (const e of (await q.json()) as { id: string; title?: string }[]) if (e.title) titles[e.id] = e.title;
      } catch { /* optional */ }
    }
    const own = specs.filter((s) => s.mission === key);
    const any = specs.filter((s) => s.mission === 'any');
    const pick = own.slice();
    for (let i = 0; i < 2 && any.length; i++) pick.push(any[(hash(key) + i * 7) % any.length]);
    active = [...new Map(pick.map((s) => [s.id, s])).values()].map((s) => ({ id: s.id, title: titles[s.id] ?? s.id, objs: s.objectives, bonus: s.reward_bonus, done: false }));
  } catch { /* optional */ }
  return active;
}

/** Call each UI tick: counts newly dead enemies by family. */
export function sqTrack(count: number, team: ArrayLike<number>, hp: ArrayLike<number>, family: readonly string[], gold: number): void {
  if (!active.length) return;
  maxGold = Math.max(maxGold, gold);
  for (let i = 0; i < count; i++) {
    const foe = team[i] === 1;
    if (prevAlive[i] && foe && hp[i] <= 0) { total++; const f = family[i] || ''; if (f) kills[f] = (kills[f] ?? 0) + 1; }
    prevAlive[i] = foe && hp[i] > 0;
  }
}

function met(o: Obj, win: boolean, flawless: boolean): boolean {
  const n = Number(o.args.count ?? o.args.amount ?? 0);
  switch (o.type) {
    case 'kill_family': return (kills[String(o.args.family)] ?? 0) >= n;
    case 'kill_any': return total >= n;
    case 'hold_gold': return maxGold >= n;
    case 'win_mission': return win;
    case 'no_losses': return win && flawless;
    default: return false;
  }
}

/** On mission end: the quests fulfilled, with their bonus percent. */
export function sqFinish(win: boolean, flawless: boolean): ActiveQuest[] {
  const out: ActiveQuest[] = [];
  for (const q of active) if (!q.done && win && q.objs.every((o) => met(o, win, flawless))) { q.done = true; out.push(q); }
  return out;
}
