import { heroEnding } from './herovoice';
/** Flavour text for campaign missions (Gemini packs 4a/4b, imported to public/data/content/missions.json). Optional: the game plays without it. */
export interface Scene { speaker: string; line: string }
export interface MissionContent { intro_scene?: Scene[]; victory_epilogue?: Scene[]; defeat_line?: string }

const prettySpeaker = (s: string): string =>
  s === 'narrator' ? 'Narrator' : s === 'hero' ? 'Hero' : s.replace(/^npc-/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
export const speakerName = prettySpeaker;

/** Looks the mission up by its map name (the campaign node's `map`). Returns null when anything is missing. */
export async function loadMissionContent(map: string | null): Promise<MissionContent | null> {
  if (!map) return null;
  try {
    const base = import.meta.env.BASE_URL;
    const [camp, all, bosses, endings, texts, bossLines] = await Promise.all([
      fetch(`${base}data/campaign.json`).then((r) => r.json()),
      fetch(`${base}data/content/missions.json`).then((r) => r.json()),
      fetch(`${base}data/content/bosses.json`).then((r) => r.json()).catch(() => ({})),
      fetch(`${base}data/content/act-endings.json`).then((r) => r.json()).catch(() => []),
      fetch(`${base}data/content/mission-texts.json`).then((r) => r.json()).catch(() => []),
      fetch(`${base}data/content/boss-dialogue.json`).then((r) => r.json()).catch(() => []),
    ]);
    const nodes = camp.nodes as { id: string; map?: string; act?: number; kind?: string }[];
    const node = nodes.find((n) => n.map === map);
    if (!node) return null;
    const base0: MissionContent = { ...(all[node.id] ?? {}) };
    // Pack 11 mission texts: briefing opens the intro, win/loss debriefs close the mission.
    const mt = (texts as { mission_id: string; briefing?: string; debrief_win?: string; debrief_loss?: string }[]).find((t) => t.mission_id === node.id);
    if (mt) {
      if (mt.briefing) base0.intro_scene = [{ speaker: 'narrator', line: mt.briefing }, ...(base0.intro_scene ?? [])];
      if (mt.debrief_win) base0.victory_epilogue = [{ speaker: 'narrator', line: mt.debrief_win }, ...(base0.victory_epilogue ?? [])];
      if (mt.debrief_loss) base0.defeat_line = base0.defeat_line ? `${mt.debrief_loss} ${base0.defeat_line}` : mt.debrief_loss;
    }
    const boss = Object.values(bosses as Record<string, { mission: string; pre_fight?: Scene[]; death_scene?: Scene[]; hero_reaction?: string }>).find((b) => b.mission === node.id);
    if (boss) {
      base0.intro_scene = [...(base0.intro_scene ?? []), ...(boss.pre_fight ?? [])];
      const bossKey = Object.keys(bosses as Record<string, { mission: string }>).find((k) => (bosses as Record<string, { mission: string }>)[k].mission === node.id);
      const bl = (bossLines as { boss?: string; intro?: string }[]).find((b) => b.boss === bossKey);
      if (bl?.intro) (base0.intro_scene as Scene[]).push({ speaker: bossKey ?? 'boss', line: bl.intro });
      const reaction = boss.hero_reaction ? [{ speaker: 'hero', line: boss.hero_reaction }] : [];
      base0.victory_epilogue = [...(base0.victory_epilogue ?? []), ...(boss.death_scene ?? []), ...reaction];
    }
    // Pack 13 act cutscenes: the first mission of an act opens with the act-start scene, the last closes with the act-end scene.
    try {
      const cs = await (await fetch(`${base}data/content/cutscenes.json`)).json() as { act: number; timing: string; lines: Scene[] }[];
      const first = nodes.filter((n) => n.kind === 'mission' && n.act === node.act)[0]?.id === node.id;
      const last = nodes.filter((n) => n.kind === 'mission' && n.act === node.act).slice(-1)[0]?.id === node.id;
      const st = first ? cs.find((c) => c.act === node.act && c.timing === 'start') : undefined;
      const en = last ? cs.find((c) => c.act === node.act && c.timing === 'end') : undefined;
      if (st) base0.intro_scene = [...st.lines, ...(base0.intro_scene ?? [])];
      if (en) base0.victory_epilogue = [...(base0.victory_epilogue ?? []), ...en.lines];
    } catch { /* optional */ }
    // The last mission of an act closes it with the act-ending text.
    const missions = nodes.filter((n) => n.kind === 'mission' && n.act === node.act);
    const end = (endings as { act: number; title: string; text: string; cliffhanger?: string }[]).find((e) => e.act === node.act);
    if (missions[missions.length - 1]?.id === node.id) {
      try {
        const epi = (await (await fetch(`${base}data/content/act-epilogues.json`)).json() as { act: number; title: string; text: string }[]).find((e) => e.act === node.act);
        if (epi) base0.victory_epilogue = [...(base0.victory_epilogue ?? []), { speaker: 'narrator', line: `${epi.title}\n${epi.text}` }];
      } catch { /* optional */ }
    }
    if (node.act === 4 && missions[missions.length - 1]?.id === node.id) {
      const ce = await heroEnding();
      if (ce) base0.victory_epilogue = [...(base0.victory_epilogue ?? []), { speaker: 'narrator', line: ce }];
    }
    if (end && missions[missions.length - 1]?.id === node.id) {
      base0.victory_epilogue = [
        ...(base0.victory_epilogue ?? []),
        { speaker: 'narrator', line: `${end.title}
${end.text}${end.cliffhanger ? `
${end.cliffhanger}` : ''}` },
      ];
    }
    return Object.keys(base0).length ? base0 : null;
  } catch {
    return null;
  }
}

/** Item flavor/inspect text from content/item-flavor.json, keyed by item name. Empty until loaded. */
export interface ItemFlavor { flavor?: string; inspect?: string }
let itemFlavor: Record<string, ItemFlavor> = {};
export const getItemFlavor = (name: string): ItemFlavor | undefined => itemFlavor[name];
export async function loadItemFlavor(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/item-flavor.json`);
    if (r.ok) itemFlavor = await r.json();
  } catch { /* flavor is optional */ }
}

/** Death quotes and loading tips (content/death-quotes.json, loading-tips.json) for the defeat screen. */
let deathQuotes: { quote: string; source: string }[] = [];
let loadingTips: { tip: string }[] = [];
export async function loadFlavorLists(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  try { deathQuotes = await (await fetch(`${base}data/content/death-quotes.json`)).json(); } catch { /* optional */ }
  try { loadingTips = await (await fetch(`${base}data/content/loading-tips.json`)).json(); } catch { /* optional */ }
  try {
    const more = (await (await fetch(`${base}data/content/tips-2.json`)).json()) as { text: string }[];
    loadingTips = loadingTips.concat(more.map((t) => ({ tip: t.text })));
  } catch { /* optional */ }
  try {
    const ls = (await (await fetch(`${base}data/content/loading-screens.json`)).json()) as { text: string }[];
    loadingTips = loadingTips.concat(ls.map((t) => ({ tip: t.text })));
  } catch { /* optional */ }
}
const pick = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
/** UI-only randomness (never feeds the sim). */
export function defeatFlavor(): string {
  const q = pick(deathQuotes), t = pick(loadingTips);
  return [q ? `"${q.quote}" - ${q.source}` : '', t ? `Tip: ${t.tip}` : ''].filter(Boolean).join('\n');
}

/** Difficulty flavor (content/difficulty-flavor.json). diff index 0 easy, 1 normal, 2 hard. */
let diffFlavor: { level: string; on_select: string[]; on_death: string[]; on_win: string[] }[] = [];
export async function loadDifficultyFlavor(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/difficulty-flavor.json`);
    if (r.ok) diffFlavor = await r.json();
  } catch { /* optional */ }
}
export function difficultyLine(kind: 'on_select' | 'on_death' | 'on_win', diff: number): string | undefined {
  const lv = ['easy', 'normal', 'hard', 'nightmare'][diff] ?? 'normal';
  return pick(diffFlavor.find((d) => d.level === lv)?.[kind] ?? []);
}

/** Bestiary entries (content/monster-codex.json). Empty until loaded. */
export interface MonsterCodexEntry { id: string; name: string; codex: string; weakness?: string; special?: string; loot_theme?: string }
let monsterCodex: MonsterCodexEntry[] = [];
export const getMonsterCodex = (): MonsterCodexEntry[] => monsterCodex;
export async function loadMonsterCodex(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/monster-codex.json`);
    if (r.ok) monsterCodex = await r.json();
  } catch { /* optional */ }
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/bestiary-extra.json`);
    if (r.ok) {
      const have = new Set(monsterCodex.map((m) => m.id));
      for (const b of await r.json() as { id: string; name: string; behavior: string; lore: string; weakness?: string }[]) {
        if (!have.has(b.id)) monsterCodex.push({ id: b.id, name: b.name, codex: `${b.lore} ${b.behavior}`, weakness: b.weakness });
      }
    }
  } catch { /* optional */ }
}

/** Spell flavor text (content/spell-text.json), keyed by spell name. Empty until loaded. */
export interface SpellText { name: string; tooltip?: string; flavor?: string; cast_line?: string }
let spellText: Record<string, SpellText> = {};
export const getSpellText = (name: string): SpellText | undefined => spellText[name];
export async function loadSpellText(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/spell-text.json`);
    if (r.ok) spellText = Object.fromEntries((await r.json() as SpellText[]).map((x) => [x.name, x]));
  } catch { /* optional */ }
}

/** Codex lore entries (content/codex-entries.json + codex-missing.json). Empty until loaded. */
export interface CodexLore { id: string; category: string; title: string; body: string; act?: number; unlock_hint?: string }
let codexLore: CodexLore[] = [];
export const getCodexLore = (): CodexLore[] => codexLore;
export async function loadCodexLore(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const out: CodexLore[] = [];
  for (const f of ['codex-entries', 'codex-entries-2', 'codex-missing']) {
    try {
      const r = await fetch(`${base}data/content/${f}.json`);
      if (r.ok) out.push(...(await r.json() as CodexLore[]));
    } catch { /* optional */ }
  }
  try {
    const books = await (await fetch(`${base}data/content/lore-books.json`)).json() as { id: string; title: string; author?: string; text: string; act?: number }[];
    for (const b of books) out.push({ id: b.id, category: 'book', title: b.title, body: `${b.author ? `By ${b.author}. ` : ''}${b.text}`, act: b.act });
  } catch { /* optional */ }
  try {
    const facs = await (await fetch(`${base}data/content/factions.json`)).json() as { id: string; name: string; desc: string; ranks?: string[] }[];
    for (const f of facs) out.push({ id: f.id, category: 'faction', title: f.name, body: `${f.desc}${f.ranks?.length ? ` Ranks: ${f.ranks.join(', ')}.` : ''}` });
  } catch { /* optional */ }
  try {
    const tl = await (await fetch(`${base}data/content/timeline.json`)).json() as { year: string; event: string }[];
    out.push({ id: 'timeline', category: 'history', title: 'Timeline of Thornvael', body: tl.map((t) => `${t.year}: ${t.event}`).join('\n') });
  } catch { /* optional */ }
  codexLore = out;
}

/** Town ambient lines (content/town-barks.json), keyed by town name. */
let townBarks: { town: string; kind: string; line: string }[] = [];
export async function loadTownBarks(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/town-barks.json`);
    if (r.ok) townBarks = await r.json();
  } catch { /* optional */ }
}
/** One random ambient line for the town whose display name matches (UI-only randomness). */
export function townBark(townName: string): string | undefined {
  const key = townName.toLowerCase();
  const list = townBarks.filter((b) => key.includes(b.town.replace('town-', '')));
  return pick(list)?.line;
}

/** Help pages and credits lines (content/help-pages.json, content/credits-and-menu.json). */
export interface HelpPage { id: string; title: string; body: string }
let helpPages: HelpPage[] = [];
let creditLines: { key: string; text: string }[] = [];
export const getHelpPages = (): HelpPage[] => helpPages;
export const getCreditLines = (): { key: string; text: string }[] => creditLines;
export async function loadHelpAndCredits(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  try { const r = await fetch(`${base}data/content/help-pages.json`); if (r.ok) helpPages = await r.json(); } catch { /* optional */ }
  try {
    const r = await fetch(`${base}data/content/tutorial.json`);
    if (r.ok) {
      const steps = await r.json() as { step: number; title: string; text: string }[];
      helpPages = helpPages.concat(steps.map((s) => ({ id: `tutorial-${s.step}`, title: `Field Lesson ${s.step}: ${s.title}`, body: s.text })));
    }
  } catch { /* optional */ }
  try {
    const r = await fetch(`${base}data/content/credits-and-menu.json`);
    if (r.ok) creditLines = (await r.json() as { key: string; text: string }[]).filter((e) => e.key.startsWith('credits.'));
  } catch { /* optional */ }
}

/** Two-line mission hints (content/objective-hints-2.json), keyed by mission id. */
export async function loadMissionHints(mission: string): Promise<string[]> {
  try {
    const base = import.meta.env.BASE_URL;
    const camp = await (await fetch(`${base}data/campaign.json`)).json() as { nodes: { id: string; map?: string }[] };
    const id = camp.nodes.find((n) => n.map === mission)?.id;
    const r = await fetch(`${base}data/content/objective-hints-2.json`);
    if (id && r.ok) return ((await r.json()) as Record<string, string[]>)[id] ?? [];
  } catch { /* optional */ }
  return [];
}

/** In-mission radio line (content/mission-radio.json) for a map name and kind (start|mid|danger|win|lose). */
export async function missionRadio(mission: string, kind: 'start' | 'mid' | 'danger' | 'win' | 'lose'): Promise<string | null> {
  try {
    const base = import.meta.env.BASE_URL;
    const camp = await (await fetch(`${base}data/campaign.json`)).json() as { nodes: { id: string; map?: string }[] };
    const key = camp.nodes.find((n) => n.map === mission)?.id.split('-')[0];
    const r = await fetch(`${base}data/content/mission-radio.json`);
    if (key && r.ok) return ((await r.json()) as Record<string, string>[]).find((x) => x.mission === key)?.[kind] ?? null;
  } catch { /* optional */ }
  return null;
}

interface MercLine { act: number; name: string; hire_line: string }
let mercLines: MercLine[] = [];
/** Loads hire lines of the content mercenaries (Gemini mercenaries.json); optional. */
export async function loadMercLines(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/mercenaries.json`);
    if (r.ok) mercLines = (await r.json() as MercLine[]).filter((m) => m.hire_line);
  } catch { /* optional */ }
}
/** A hire line for the given act, picked by unit id so it stays stable per mercenary. */
export function mercHireLine(act: number, unit: number): string | null {
  const pool = mercLines.filter((m) => m.act === act);
  const m = pool.length ? pool[unit % pool.length] : null;
  return m ? `${m.name}: "${m.hire_line}"` : null;
}

interface Region { act: number; enter_line: string }
/** Region entry line for a mission (Gemini region-flavor.json); regions of the act are cycled by the mission's index. */
export async function regionEnterLine(act: number, index: number): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/region-flavor.json`);
    if (!r.ok) return null;
    const pool = (await r.json() as Region[]).filter((x) => x.act === act && x.enter_line);
    return pool.length ? pool[index % pool.length].enter_line : null;
  } catch { return null; }
}
let promoLines: string[] = [];
let banterLines: Record<string, string[]> = {};
/** Loads promotion-lines.json and class-banter.json (optional flavour). */
export async function loadHeroFlavor(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  try { promoLines = await (await fetch(`${base}data/content/promotion-lines.json`)).json(); } catch { /* optional */ }
  try { banterLines = await (await fetch(`${base}data/content/class-banter.json`)).json(); } catch { /* optional */ }
}
export const promotionLine = (level: number): string | null => (promoLines.length && level % 5 === 0 ? promoLines[(level / 5 - 1) % promoLines.length] : null);
export const classBanter = (cls: string, salt: number): string | null => { const l = banterLines[cls]; return l?.length ? l[salt % l.length] : null; };
