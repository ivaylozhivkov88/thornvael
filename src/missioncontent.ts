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
    const [camp, all, bosses, endings] = await Promise.all([
      fetch(`${base}data/campaign.json`).then((r) => r.json()),
      fetch(`${base}data/content/missions.json`).then((r) => r.json()),
      fetch(`${base}data/content/bosses.json`).then((r) => r.json()).catch(() => ({})),
      fetch(`${base}data/content/act-endings.json`).then((r) => r.json()).catch(() => []),
    ]);
    const nodes = camp.nodes as { id: string; map?: string; act?: number; kind?: string }[];
    const node = nodes.find((n) => n.map === map);
    if (!node) return null;
    const base0: MissionContent = { ...(all[node.id] ?? {}) };
    const boss = Object.values(bosses as Record<string, { mission: string; pre_fight?: Scene[]; death_scene?: Scene[]; hero_reaction?: string }>).find((b) => b.mission === node.id);
    if (boss) {
      base0.intro_scene = [...(base0.intro_scene ?? []), ...(boss.pre_fight ?? [])];
      const reaction = boss.hero_reaction ? [{ speaker: 'hero', line: boss.hero_reaction }] : [];
      base0.victory_epilogue = [...(base0.victory_epilogue ?? []), ...(boss.death_scene ?? []), ...reaction];
    }
    // The last mission of an act closes it with the act-ending text.
    const missions = nodes.filter((n) => n.kind === 'mission' && n.act === node.act);
    const end = (endings as { act: number; title: string; text: string; cliffhanger?: string }[]).find((e) => e.act === node.act);
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
}
const pick = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
/** UI-only randomness (never feeds the sim). */
export function defeatFlavor(): string {
  const q = pick(deathQuotes), t = pick(loadingTips);
  return [q ? `"${q.quote}" - ${q.source}` : '', t ? `Tip: ${t.tip}` : ''].filter(Boolean).join('\n');
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
}
