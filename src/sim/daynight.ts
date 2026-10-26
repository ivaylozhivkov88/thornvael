/** One full day lasts 6 minutes of game time (25 ticks per second). */
export const DAY_TICKS = 6 * 60 * 25;

/**
 * Daylight 0 (deep night) to 255 (full day) for a game tick. Integer-only so it can drive
 * simulation rules (vision) as well as lighting. The cycle starts in the morning.
 * Segments: day 0..0.50, dusk 0.50..0.60, night 0.60..0.90, dawn 0.90..1.00.
 */
export function dayLight(tick: number): number {
  const p = Math.floor((((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS) * 1000 / DAY_TICKS);
  if (p < 500) return 255;
  if (p < 600) return 255 - Math.floor(((p - 500) * 180) / 100);
  if (p < 900) return 75;
  return 75 + Math.floor(((p - 900) * 180) / 100);
}

/** Clock label like "07:30" for a tick, with the cycle starting at 06:00. */
export function clockText(tick: number): string {
  const minutes = Math.floor((((tick % DAY_TICKS) * 24 * 60) / DAY_TICKS + 6 * 60) % (24 * 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
