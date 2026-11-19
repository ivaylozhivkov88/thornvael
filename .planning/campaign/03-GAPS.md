# ENGINE & DATA FORMAT GAP ANALYSIS (`03-GAPS`)

## 1. What `MapDoc` v2 (`loadDoc` / `validate`) Already Supports Out of the Box

A thorough code audit of `src/mapdoc.ts`, `src/sim/script.ts`, `src/mission.ts`, `src/campaign.ts`, and `src/sim/town.ts` confirms that **85% of the 4-City, 4-Huge-Map architecture already works declaratively in `MapDoc` format v2**:

1. **Huge Map Dimensions (`192 x 192` to `256 x 256`)**:
   - `src/mapdoc.ts` sets `MIN_SIDE = 16` and `MAX_SIDE = 1024`. A `192 x 192` tile map (`36,864` tiles, RLE-compressed to < 12 KB JSON) passes `validate(doc)` and bakes cleanly into `12 x 12` terrain chunks of `16 x 16` tiles.
2. **Embedded City Hub (`doc.towns`) on the Same Map as the Wilderness**:
   - `MapDoc.towns` natively supports placing a full town hub (`tavern`, `shop`, `school`, `tiers`, `spells`, `mercs`, `npcs`) inside a huge combat map (proven by `thornwick-market.map.json`). The hero can walk out of the town palisade directly into Region 1 without a loading screen, and return via Waypoints or Town Portal (`openTownPortal` / `useTownPortal` in `src/sim/script.ts`).
3. **Named Regions, Waypoints, Shrines, Zone Exits & Adventure Objects**:
   - `doc.regions`: `{ name, x1, y1, x2, y2 }` rectangles for all 6 regions per map.
   - `doc.waypoints`: `{ id, name, x, y, activated? }` fast-travel nodes checked by `checkWaypointTouch`.
   - `doc.shrines`: `{ x, y, kind: 'healing' | 'mana' | 'combat' | 'armor' | 'haste' | 'ward', cooldown? }`.
   - `doc.exits`: `{ x, y, targetMap, targetX, targetY, label?, kind?: 'gate' | 'cave' | 'road' | 'caravan' }` for sub-dungeons (`weeping-ossuary`) and inter-act transitions (`map1` -> `map2` -> `map3` -> `map4`).
   - `doc.adventureObjects`: `{ x, y, kind: 'watermill' | 'windmill' | 'magic_well' | 'fountain_of_youth' | 'creature_bank', rewardGold?, rewardArtifact? }`.
4. **Declarative Triggers (`27 CHECKS` & `49 ACTIONS`)**:
   - All 12 quests per map (6 Main + 6 Side) can be expressed using `unitInBox`, `groupSize`, `isVip`, `unitAlive`, `hasItem`, `carriedAt`, `variable`, `scenarioVar`, `subobjective`, paired with `setSub`, `message`, `setVar`, `incVar`, `dropGold`, `giveMoney`, `addItem`, `removeItem`, `phaseInGroup`, `phaseOutGroup`, `outpost`, `music`, and `win`/`lose`.

---

## 2. Prioritized Engine Gaps (Ordered by Priority & Effort)

To play all 4 huge maps at 100% design fidelity without workarounds, the following 6 targeted engine extensions are needed:

| Rank | Gap ID | Subsystem / File | Priority | Effort | Summary |
|------|--------|------------------|----------|--------|---------|
| **1** | **GAP-01** | `src/mapdoc.ts` & `src/sim/data.ts` | **P0 (Critical)** | **XS (~25 LOC)** | Allow `UnitDef.family` & `UnitDef.bossMods` in `*.map.json` to validate all 16 Super-Uniques and all 12 Boss Mod IDs. |
| **2** | **GAP-02** | `src/sim/script.ts` & `src/missionui.ts` | **P0 (Critical)** | **S (~45 LOC)** | Expand `ScriptState.sub` from 8 to 16 objectives and read quest coordinates/categories declaratively from `doc.text` instead of hardcoded `isFordMap`. |
| **3** | **GAP-03** | `src/sim/script.ts` | **P1 (High)** | **XS (~20 LOC)** | Add `giveXp` action to `ACTIONS` and raise trigger `acts` cap from 4 to 6 (or chain via `setSub`) so side quests award XP, Gold, and Items in one trigger. |
| **4** | **GAP-04** | `src/missionui.ts` & `src/sim/sim.ts` | **P1 (High)** | **S (~35 LOC)** | Wire dialogue choice clicks (`[1]`, `[2]`, `[3]`) to emit a deterministic sim command setting a script variable (`st.vars` / `st.sv`) for `MQ4-05: The Threshold Choice`. |
| **5** | **GAP-05** | `src/terrain.ts` & `src/mapdoc.ts` | **P2 (Medium)** | **M (~60 LOC)** | Per-region `biome`, `zoneSkin`, and `music` fields on `Region` so a single 192x192 map can blend multiple regional skins and auto-switch regional exploration music (`musicNode`). |
| **6** | **GAP-06** | `src/mapdoc.ts` & `src/sim/sim.ts` | **P2 (Medium)** | **S (~30 LOC)** | Allow up to `512` total `doc.units` in `validate()` when `>= 220` are `dormant: true` (phased in per region), while keeping active non-dormant units `<= 300` for the `< 1ms` tick budget. |

---

## 3. Detailed Technical Specifications for Each Gap

### GAP-01: Declarative Super-Unique Families & Extended `BOSS_MOD_IDS` (P0, Effort: XS)
- **Current Limitation**:
  - `src/mapdoc.ts` lines 38–46 define only 7 `BOSS_MOD_IDS`: `'fire_enchanted' | 'cold_enchanted' | 'extra_fast' | 'stone_skin' | 'magic_resistant' | 'spectral_hit' | 'blessed_aura'`.
  - `src/sim/super-uniques.ts` uses 5 additional modifiers: `'lightning_enchanted' | 'extra_strong' | 'cursed' | 'mana_burn' | 'teleporting'`.
  - `validate()` in `src/mapdoc.ts` line 227 checks `!monsterFamilyById(u.family)`, which looks up `MONSTER_FAMILIES` and `BOSS_FAMILIES` (`monsters.json`) but does not check `getSuperUniqueById(u.family)`.
- **Exact Fix**:
  1. Add `'lightning_enchanted'`, `'extra_strong'`, `'cursed'`, `'mana_burn'`, and `'teleporting'` to `BOSS_MOD_IDS` in `src/mapdoc.ts`.
  2. In `src/sim/data.ts`, let `monsterFamilyById(id)` fall back to `superUniqueAsFamilyDef(id)` (or check `getSuperUniqueById(id)` in `validate()` and call `spawnSuperUniqueInPack` in `placeScenario`).
- **Workaround Used in Current Prototype**: Set `u.family` to the Super-Unique's base sprite family (e.g., `'fallen-shaman'` for Malgath, `'ironbark'` for Thornmaw) and use the 7 currently whitelisted `BOSS_MOD_IDS`.

### GAP-02: 16 Sub-Objectives (`st.sub`) & Data-Driven Quest Tracker Coordinates (P0, Effort: S)
- **Current Limitation**:
  - `newState()` in `src/sim/script.ts` line 457 allocates `sub: Array(8).fill(0)`. A huge map with 6 Main Quests and 6 Side Quests needs at least 12–16 sub-objective slots (`sub[0]`..`sub[15]`).
  - `evaluateQuestDossier()` in `src/missionui.ts` lines 1060–1115 checks `isFordMap` to assign hardcoded `[x, y]` coordinates for `obj.0`..`obj.4`, falling back to generic unit positions on other maps.
- **Exact Fix**:
  1. Change `sub: Array(8).fill(0)` to `sub: Array(16).fill(0)` in `src/sim/script.ts` (backward-compatible with existing saves and hashes when `sub[8..15]` are 0, or pad on restore).
  2. In `src/missionui.ts`, read optional `doc.text['obj.N.pos']` (e.g. `"74,98"`) and `doc.text['obj.N.kind']` (`"main"` | `"side"`) so any map can define exact auto-navigation pin coordinates `(targetX, targetY)` and Main/Side grouping purely in `doc.text` JSON!

### GAP-03: Declarative `giveXp` Action & Multi-Reward Triggers (P1, Effort: XS)
- **Current Limitation**:
  - `ACTIONS` in `src/sim/script.ts` has `giveMoney` (gold) and `addItem` (item), but no action to grant Experience Points (`addHeroXp`) when a non-combat or delivery/lore quest completes.
  - `validate()` caps `t.acts.length <= 4`. A quest turn-in that sets `setSub(N, 2)`, displays `message(M)`, awards `giveMoney(0, G)`, gives an item `addItem(0, I)`, and increments a progress counter `incVar(V)` needs 5 actions (currently split across 2 triggers).
- **Exact Fix**:
  1. Add `{ key: 'giveXp', label: 'Give experience to the hero', params: [UNIT(), NUM('XP')], run: (c, [u, xp]) => void (c.sim.hero && c.sim.hero.id === u && addHeroXp(c.sim, xp)) }` to `ACTIONS` in `src/sim/script.ts`.

### GAP-04: Deterministic Script Variable Binding for Dialogue Choices (P1, Effort: S)
- **Current Limitation**:
  - In `src/missionui.ts`, clicking one of the 3 Disco Elysium player stances (`1.`, `2.`, `3.`) plays an audio cue and advances the dialogue, but does not send a command to the simulation.
- **Exact Fix**:
  - Support optional `doc.text['msg.N.var'] = "14"` (or `sv` index). When the player selects stance `1`, `2`, or `3` on message `N`, queue a deterministic command `{ type: 'scriptVar', var: 14, val: choiceNum }` so triggers in Map 4 (`MQ4-05: The Threshold Choice`) can branch cleanly between Ending A (`vars[14] = 1`) and Ending B (`vars[14] = 2`).

### GAP-05: Per-Region Visual Sub-Biomes & Functional `musicNode` Crossfading (P2, Effort: M)
- **Current Limitation**:
  - `Region` in `src/mapdoc.ts` is `{ name: string; x1: number; y1: number; x2: number; y2: number }`.
  - `musicNode` in `src/sim/script.ts` line 431 is stubbed (`run: (c, a) => void (c.st.nodes.push(a.slice()), note(c))`).
- **Exact Fix**:
  - Extend `Region` with optional `{ biome?: string; zone?: string; music?: string; ambience?: string }`.
  - When the hero's tile `(hx, hy)` enters a `Region`, crossfade the background `<audio>` stream to the region's exploration track (e.g., `music_explore_act1_fords.m4a` in Region 1 -> `music_explore_act1_fen.m4a` in Region 2) and use `region.zone` in `terrain.ts` `zoneField` to bias feature-zone ground textures (`crypt`, `ruinstone`, `highland`, `sand`, `snow`) inside that region's rectangle.

### GAP-06: Dormant Region Population Pool vs. Active 300-Unit Sim Budget (P2, Effort: S)
- **Current Limitation**:
  - `validate()` enforces `doc.units.length <= 300`.
  - For a `192 x 192` map, 240–280 units (approx. 40–45 per region across 6 regions) already fits inside the 300-unit limit and runs at `< 0.6 ms` per tick. However, if a designer wants 80+ enemies per region (480 total across all 6 regions), placing all 480 in `doc.units` fails `validate()`.
- **Exact Fix**:
  - Keep the active (non-dormant) unit limit at `300`, and allow up to `512` total `doc.units` in `validate()` provided at most `300` are active (`!u.dormant`) at mission start, using region-entry triggers (`unitInBox` -> `phaseInGroup`) to wake regional packs as the hero explores.
