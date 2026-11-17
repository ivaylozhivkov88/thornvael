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
