# Thornvael — Save & Character Schema Changes (for Hero/Roster Agent)

> **Status:** Stage 1 Design Spec  
> **Target Files (Owned by Hero/Roster Agent):** `src/savedb.ts`, `src/characters.ts`, `src/save.ts`, `src/sim/hero.ts`  
> **Constraint:** Zero breaking changes to existing `v: 1` `characters` records or `saveVersion: 1..5` save files.

---

## 1. Summary of Additive Fields

All new fields are **optional (`?`)** on persisted types and normalized with deterministic defaults during load/migration.

### 1.1 `ItemInstance` (`src/sim/items.ts`, stored in `Character.items` & `SaveFile`)

```ts
export interface AffixRollRecord {
  readonly id: string; // e.g. 'prefix:Cruel' or 'suffix:of Slaughter'
  readonly values: readonly number[]; // exact integer stat rolls
}

export interface ItemInstance {
  // Existing fields:
  readonly id: number; // >= 1000
  readonly baseId: number;
  readonly quality: 'common' | 'magic' | 'rare' | 'set' | 'unique' | string;
  readonly name: string;
  readonly def: ItemDef;
  readonly affixes?: readonly string[];
  readonly serial?: number;

  // New additive fields (Stage 2):
  readonly ilvl?: number; // 1..50 (default: clamp((def.tier || 1) * 10, 1, 50))
  readonly upgradeLevel?: number; // 0..5 (default: 0)
  readonly upgradePity?: number; // 0..4 consecutive fails for deterministic fail-safe (default: 0)
  readonly sockets?: number; // 0..3 (default: def.sockets ?? 0)
  readonly socketed?: readonly string[]; // gem/rune names (default: def.socketedGems ?? [])
  readonly affixRolls?: readonly AffixRollRecord[]; // exact rolled affix values
  readonly seed?: number; // uint32 generation seed
}
```

### 1.2 `HeroState` (`src/sim/hero.ts`, stored in `Character.hero` & `SaveState.snap`)

```ts
export type EssenceMap = Record<string, number>; // keys: 'ash' | 'glimmer' | 'amber' | 'verdant' | 'astral'

export interface HeroState {
  // ...existing fields...

  // New additive fields (Stage 2):
  essences?: EssenceMap; // default: {}
  skillRanks?: Record<string, number>; // e.g. { war_ber_1: 3, war_ber_2: 1 }, default: {}
  skillLoadout?: (string | null)[]; // up to 6 active skill IDs [Q, W, E, R, T, RMB], default: []
  respecCount?: number; // number of gold respecs used, default: 0
}
```

### 1.3 `Character` (`src/characters.ts`, stored in IndexedDB `saves` store under key `'characters'`)

```ts
export interface Character {
  // ...existing fields (id, name, cls, female, diff, createdAt, lastPlayed, level, hero, items, slots, gold, played)...

  // New optional summary/progression fields (safe to omit on v: 1 records):
  essences?: Record<string, number>; // mirrored from hero.essences for town/roster display
  skillRanks?: Record<string, number>; // mirrored from hero.skillRanks
  skillLoadout?: (string | null)[]; // mirrored from hero.skillLoadout
  respecCount?: number; // default: 0
}
```

---

## 2. Non-Breaking Migration Steps (for `src/savedb.ts` & `src/save.ts` / `src/characters.ts`)

### 2.1 `SaveFile` Migration (`SAVE_VERSION = 5 -> 6`, or backward-compatible `v5` read)

In `src/save.ts` (`migrateSave(raw)`):
1. Accept `saveVersion` `1..6` (only reject `> SAVE_VERSION`).
2. When migrating `< 6`:
   - For `state.snap?.hero` (if present):
     - `hero.essences ??= {}`
     - `hero.skillRanks ??= {}`
     - `hero.skillLoadout ??= []`
     - `hero.respecCount ??= 0`
   - For any `ItemInstance` arrays (`carry?.items`, etc.):
     - `item.ilvl ??= Math.min(50, Math.max(1, (item.def?.tier ?? 1) * 10))`
     - `item.upgradeLevel ??= 0`
     - `item.upgradePity ??= 0`
   - Bump `saveVersion = 6`.

### 2.2 `Character` Store Migration (`src/characters.ts` `parse(raw)`)

1. Accept both `s.v === 1` and `s.v === 2` in `parse(raw)`:
   - Normalize each `Character`:
     - `c.essences ??= c.hero?.essences ?? {}`
     - `c.skillRanks ??= c.hero?.skillRanks ?? {}`
     - `c.skillLoadout ??= c.hero?.skillLoadout ?? []`
     - `c.respecCount ??= c.hero?.respecCount ?? 0`
     - Normalize `c.items` with `ilvl`, `upgradeLevel`, `upgradePity` defaults if absent.
2. When `saveCharacter()` persists a `Character`, copy `hero.essences`, `hero.skillRanks`, `hero.skillLoadout`, and `hero.respecCount` onto `Character` as well as `c.hero`.

### 2.3 `src/savedb.ts` Notes

- `savedb.ts` already delegates save migration to `migrateSave(raw)` inside `getSave()` and `exportAllSaves()`, and stores `characters` via `putRecord` / `getRecord`.
- No IndexedDB schema version (`DB = 'thornvael', version = 1`) change is needed, preserving 100% of existing player saves and characters on upgrade.
