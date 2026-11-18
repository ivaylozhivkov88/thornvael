/** Hero voice lines (Gemini Pack 11 hero-voices.json). Optional: silent when the data is missing. */
interface HeroVoice { hero_id: string; barks: Record<string, string[]>; town_greeting?: string[]; refusal_lines?: string[]; intro_monologue?: string }
let voices: Record<string, HeroVoice> = {};
let voiceId = '';
let lastAt = 0;
const CLASS_NAMES = ['warrior', 'mage', 'archer', 'necromancer'];

export async function loadHeroVoices(cls: number, female: boolean): Promise<void> {
  voiceId = `${CLASS_NAMES[cls] ?? 'warrior'}-${female ? 'female' : 'male'}`;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/content/hero-voices.json`);
    if (r.ok) voices = Object.fromEntries((await r.json() as HeroVoice[]).map((v) => [v.hero_id, v]));
  } catch { /* optional */ }
}

/** UI-only randomness (never feeds the sim). Returns a line or null while on cooldown / without data. */
export function heroBark(kind: string, cooldownMs = 6000, now = Date.now()): string | null {
  const list = voices[voiceId]?.barks?.[kind];
  if (!list?.length || now - lastAt < cooldownMs) return null;
  lastAt = now;
  return list[Math.floor(Math.random() * list.length)];
}

export const heroIntro = (): string | null => voices[voiceId]?.intro_monologue ?? null;
