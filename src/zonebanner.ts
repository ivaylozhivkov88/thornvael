/**
 * Name and lore of the world-map zone the hero walks into.
 * Data: `zones` of the map and its text keys `zone.<id>` (docs/ACT-POLISH-PLAYBOOK.md §6).
 */
export interface ZoneRect { id: string; name: string; x: number; y: number; w: number; h: number }
export interface ZoneArrival { name: string; lore: string | null }

/** Call with the hero's tile; returns something only when a new zone is entered. Lore comes once per zone. */
export function zoneAnnouncer(zones: readonly ZoneRect[], text: Record<string, string>): (x: number, y: number) => ZoneArrival | null {
  let last = '';
  const seen = new Set<string>();
  return (x, y) => {
    // Roads between zones belong to no zone: the last one stays current.
    const z = zones.find((v) => x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h);
    if (!z || z.id === last) return null;
    last = z.id;
    const lore = seen.has(z.id) ? null : (text[`zone.${z.id}`] ?? null);
    seen.add(z.id);
    return { name: z.name, lore };
  };
}
