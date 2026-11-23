# Act 1 Balance Table (`m01`–`m11` & Thornwick Market)

**Date:** 2026-11-23  
**Branch:** `gemini/act1-content`  
**Sources:** `src/sim/combat.ts` (`DEFS`), `src/sim/town.ts` (`priceOf`), `src/wiki/data/bestiary.json`, `public/data/content/side-quests*.json`, `.planning/campaign/map-1-border-fords.md`

---

## 1. Expected Hero Level & Zone Progression (`m01`–`m11`)

| Zone / Mission | Region | Expected Hero Lv | Monster Tier Band | Key Threat / Boss |
|---|---|---:|---|---|
| `town` | Thornwick Market (Hub) | 1–12 | — | Safe resupply, quests, gamble, shrine |
| `m01` (`m01-blood-at-the-ford`) | Sunken Ford & Outskirts | 1–2 | 1 | Briar Hound, Thorn Boar, Chieftain Grok'tar |
| `m02` (`m02-whispers-in-the-fen`) | Fenwick's Peat & Willow Sink | 2–3 | 1 | Mire Wisp, Ruin Mite, Bog Leech |
| `m03` (`m03-nightfall-at-ravenwatch`) | Ravenwatch Keep | 3–4 | 1–2 | Quill Fiend, Ash-Tongue Shaman, Ruin Mite |
| `m04` (`m04-the-sunken-sanctum`) | Sunken Sanctum | 4–5 | 1–2 | Mire Wisp, Rootbound, Ash-Tongue Shaman |
| `m05` (`m05-lantern-passage`) | Lantern Passage | 5–6 | 1–2 | Cinderling, Glasswing, Briar Hound |
| `m06` (`m06-greywood-supply`) | Greywood Sawmill & Canopy | 6–7 | 2 | Thorn Boar, Flintback, Gloom Stag |
| `m07` (`m07-split-vanguard`) | Craghorn Ridge & Twin Cairns | 7–8 | 2 | Glasswing, Quill Fiend, Gloom Stag |
| `m08` (`m08-alder-bridge`) | Alder Bridge | 8–9 | 2 | Briar Hound, Quill Fiend, Rootbound |
| `m09` (`m09-ironhide-hunt`) | Old Kilns & Quarry | 9–10 | 2–3 | Flintback, Cinderling, Gloom Stag, Thornmaw |
| `m10` (`m10-undervault-links`) | Undervault Links | 10–11 | 2–3 | Ruin Mite, Ash-Tongue Shaman, Cultist Warden |
| `m11` (`m11-ashbrook-retreat`) | Ashbrook Gate (Act I Climax) | 11–12 | 3 | Cinderling, Siege Commander Velen, **Morvessa** |

---

## 2. Act 1 Monster HP & Damage Ranges (Base Normal Difficulty)

| Creature ID | Name | Role / Element | Base HP | Damage | Speed |
|---|---|---|---:|---:|---:|
| `ruin-mite` | Ruin Mite | Melee / Physical | 36 | 3–7 | 105 |
| `cinderling` | Cinderling | Spell / Fire | 30 | 6–9 | 112 |
| `mire-wisp` | Mire Wisp | Spell / Water | 32 | 5–9 | 110 |
| `glasswing` | Glasswing | Ranged / Air | 34 | 6–10 | 125 |
| `quill-fiend` | Quill Fiend | Ranged / Physical | 38 | 5–9 | 105 |
| `briar-hound` | Briar Hound | Melee / Physical | 42 | 4–8 | 115 |
| `fallen-shaman` | Ash-Tongue Shaman | Spell / Fire | 46 | 5–9 | 95 |
| `thorn-boar` | Thorn Boar | Melee / Physical | 64 | 6–11 | 108 |
| `gloom-stag` | Gloom Stag | Melee / Astral | 76 | 7–12 | 115 |
| `flintback` | Flintback | Melee / Armored | 95 | 7–12 | 80 |
| `rootbound` | Rootbound | Melee / Earth | 120 | 8–14 | 70 |
| `morvessa` | **Morvessa, the Silk Widow** | Boss / Earth Spell | 460 | 16–24 | 105 |

---

## 3. Gold & XP per Act 1 Quest (22 Side Quests)

| Quest ID | Title | Unlocks / Mission | Base Gold | Base XP | Item Reward |
|---|---|---|---:|---:|---|
| `sq01-tollhouse-audit` | The Tollhouse Strongbox | After `m01` | 250 (or 550) | 300 | `uniq-tollkeeper-bill` |
| `sq02-bile-of-the-fen` | Bile of the Fen | After `m02` | 180 (or 240) | 350 | `uniq-bren-dry-boot` |
| `sq03-broken-picket` | The Broken Picket | After `m03` | 220 | 420 | — |
| `sq04-night-cargo` | Night Cargo | After `m05` | 120 | 210 | `uniq-mordred-tallow-wand` |
| `sq05-the-quartermasters-ledger` | The Quartermaster's Ledger | After `m06` | 150 | 260 | `uniq-corin-dispatch-ring` |
| `sq06-glass-in-the-thicket` | Glass in the Thicket | After `m09` | 95 | 175 | — |
| `sq25-weir-eel-traps` | Iron in the Weir | After `m02` | 110 (190 / 270) | 190 | — |
| `sq26-cold-hearth-coal` | Cold Hearth Coal | After `m03` | 135 | 230 | — |
| `sq27-rue-for-the-grey-itch` | Rue for the Grey Itch | After `m04` | 165 | 280 | — |
| `sq28-broken-axle-on-alder-road` | The Broken Axle | After `m06` | 195 | 330 | — |
| `sq49-rusted-toll-chain` | The Rusted Toll-Chain | Act I Field | 105 | 180 | — |
| `sq50-peat-spade-salvage` | Sunken Peat-Spades | Act I Field | 115 | 200 | — |
| `sq51-cellar-tally-books` | Mildewed Muster-Rolls | Act I Field | 130 | 220 | `item-iron-buckler` |
| `sq52-tallow-for-lantern-pass` | Tallow for the Third Post | Act I Field | 140 | 245 | — |
| `sq53-crosscut-blades` | Teeth of the Greywood Mill | Act I Field | 155 | 265 | — |
| `sq54-sleet-cairn-oil` | Pitch for the Craghorn Cairns | Act I Field | 170 | 290 | — |
| `sq55-chalk-bluff-stakes` | Stakes on Alder Bluff | Act I Field | 185 | 310 | — |
| `sq56-green-slag-cullets` | Green Slag Cullets | Act I Field | 200 | 335 | `item-alchemist-mortar` |
| `sq57-turnip-ditch-relics` | Dog-Tags in the Turnip Rows | Act I Field | 210 | 350 | — |
| `sq58-weir-pike-heads` | Bent Pikes of the Sunken Ford | Act I Field | 225 | 370 | — |
| `sq-m07-frozen-survey` | Surveyor's Brass Theodolite | `m07` | 80 | 150 | — |
| `sq-m10-dwarven-paychest` | Locked Miners' Paychest | `m10` | 110 | 180 | — |

---

## 4. Shop Price Bands (`priceOf` in `src/sim/town.ts`, Tiers 1–3)

Formula for Gear: `base = 30 * tier^2` multiplied by rarity (`normal` 1.0x, `magic` 1.8x, `rare` 3.5x, `set` 5.0x).

| Tier | Typical Zone | Normal | Magic (1.8x) | Rare (3.5x) | Set (5.0x) |
|---:|---|---:|---:|---:|---:|
| **Tier 1** | `m01`–`m03` | 30 g | 54 g | 105 g | 150 g |
| **Tier 2** | `m04`–`m08` | 120 g | 216 g | 420 g | 600 g |
| **Tier 3** | `m09`–`m11` | 270 g | 486 g | 945 g | 1,350 g |

---

## 5. Flagged Outliers (No Data Files Broken)

1. **`sq01-tollhouse-audit` Choice B (550g after `m01`)**: Splitting the strongbox with Old Fenwick yields 550g right after Mission 1—enough to buy a Tier 2 Rare or nearly a Tier 2 Set piece early. Intentional moral trade-off (weakens militia HP in `m08-alder-bridge`).
2. **`sq06-glass-in-the-thicket` (95g / 175 XP after `m09`)**: Unlocks late in Act I (`m09`) with Tier 1-level rewards, well below `sq57`/`sq58` (210–225g). Flagged as low for late Act I, though not broken.
3. **`sq-m07-frozen-survey` (80g / 150 XP in `m07`) & `sq-m10-dwarven-paychest` (110g / 180 XP in `m10`)**: Slightly below mid/late Act I averages (155–225g), functioning as quick in-mission bonus objectives rather than town contracts.
4. **Tier 3 Set Prices (1,350g)**: Requires saving across multiple quests/drops in Act I, keeping Set pieces aspirational until late Act I / early Act II.
