/** First-time contextual tips: each tip shows once per device. Storage is a convenience; failures just mean tips may repeat. */
export type TipId = 'lowHp' | 'firstLoot' | 'firstSpell';

const KEY = 'thornvael.tips';

export class Tips {
  private readonly seen: Set<string>;
  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null, seen?: string[]) {
    let list: string[] = seen ?? [];
    if (!seen && store) {
      try {
        const raw = JSON.parse(store.getItem(KEY) ?? '[]') as unknown;
        if (Array.isArray(raw)) list = raw.filter((x): x is string => typeof x === 'string');
      } catch { /* ignore */ }
    }
    this.seen = new Set(list);
  }
  /** True the first time `id` is asked for (then remembers it). */
  once(id: TipId): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    try { this.store?.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ }
    return true;
  }
}

/** Low HP threshold (percent) for the potion tip. */
export const LOW_HP_TIP = 35;
