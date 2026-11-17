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
    const [camp, all] = await Promise.all([
      fetch(`${base}data/campaign.json`).then((r) => r.json()),
      fetch(`${base}data/content/missions.json`).then((r) => r.json()),
    ]);
    const node = (camp.nodes as { id: string; map?: string }[]).find((n) => n.map === map);
    return (node && all[node.id]) || null;
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
