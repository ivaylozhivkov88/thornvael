# THORNVAEL — CANONICAL QUEST CORRESPONDENCE MAP
**Authoritative Reference:** `THORNVAEL-MASTER-LORE-BIBLE-SCRIPT.md` (PART I §1.4 "Canonical Name Locks") & `ACT-1..3-COMPLETE-CHRONICLE.md`  
**Generated Date:** 2026-11-23  
**Status:** Audit & Mapping Complete — 100% of Canonical Quests Implemented in Engine & Content Packs

---

## 1. Executive Summary

This document audits all canonical Main Quests (`MQ`) and Side Quests (`SQ`) defined across the Thornvael Lore Chronicles against the live engine (`src/sidequests.ts`, `src/campaign.ts`, `src/sim/town.ts`) and data content packs (`public/data/campaign.json`, `public/data/content/quest-specs.json`, `public/data/content/side-quests*.json`).

Every quest in the narrative bible has a direct corresponding implementation in the game engine:
- **Main Quests (MQ)**: Form the backbone of the 46-node campaign DAG (`m01` through `m46`).
- **Side Quests (SQ)**: Implemented as rich narrative side contracts in `public/data/content/side-quests*.json` and tracked at runtime via `src/sidequests.ts` with machine objectives in `public/data/content/quest-specs.json`.
- **Name Locks Enforced**:
  - `SQ2-03`: Canonical title is **Saelen's Bog-Curse Cauldron** (Hexer = Saelen, `m19-hexer-capture`).
  - `MQ1-06` / `m11`: High Arcanist = Vaelen, Siege Commander = Velen.
  - `m35`: Lord-Captain Korvus.
  - `m39`: Arch-Mage Malrik.

---

## 2. Act I: The Border Fords (Thornwick Market)

### Main Quests (MQ1-01 – MQ1-06)

| Bible ID | Canonical Bible Title | Code ID | Engine Type | Quest Giver / Context | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MQ1-01** | Blood at the Ford | `m01-blood-at-the-ford` | Core Campaign Mission | Ford-Scout Bren / Reeve Marlow | ✅ Implemented |
| **MQ1-02** | Whispers in the Fen | `m02-whispers-in-the-fen` | Core Campaign Mission | Father Cael / Fenwick Ferryman | ✅ Implemented |
| **MQ1-03** | Nightfall at Ravenwatch | `m03-nightfall-at-ravenwatch` | Core Campaign Mission | Sergeant Garrick / Ravenwatch Runner | ✅ Implemented |
| **MQ1-04** | The Weeping Ossuary / Split Vanguard | `m04-the-sunken-sanctum` & `m07-split-vanguard` | Core Campaign Mission | High Quartermaster Morvessa | ✅ Implemented |
| **MQ1-05** | Three Waves at Alder Bridge | `m08-alder-bridge` | Core Campaign Mission | Captain of the Bridge Watch | ✅ Implemented |
| **MQ1-06** | Ash on the Southern Road | `m11-ashbrook-retreat` | Core Campaign Climax | Siege Commander Velen / High Arcanist Vaelen | ✅ Implemented |

### Side Quests & Border Contracts (SQ1-01 – SQ1-06)

| Bible ID | Canonical Bible Title | Code ID | Engine Type / Spec File | Quest Giver | Primary Objective & Reward | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SQ1-01** | The Burned Mint Assay | `sq01-tollhouse-audit` | Side Quest (`side-quests.json`, `quest-specs.json`) | Reeve Marlow / Captain Garrick | Recover counterfeit coins & Pell's scales from smoldering mint. *Reward:* 350g, 400 XP, Customs Warden's Seal. | ✅ Implemented |
| **SQ1-02** | Vitrified Slag of the Old Kilns | `sq56-green-slag-cullets` | Side Quest (`side-quests-3.json`, `quest-specs.json`) | High Arcanist Vaelen / Alchemist Marta | Slay Krazak the Volt Stalker; harvest 3 vitrified slag chunks. *Reward:* Static Arc spell, Copper Grounding Ring. | ✅ Implemented |
| **SQ1-03** | Wedged Wheel at Greywood Mill | `m06-greywood-supply` & `sq53-crosscut-blades` | Campaign Node & Side Quest (`side-quests-3.json`) | Miller Edda & Factor Merrick | Knock loose wedges from mill-wheel, slay Skara. *Reward:* 400g, 500 XP, Alder Flatbow / Bread in Thornwick. | ✅ Implemented |
| **SQ1-04** | Hunt for the Ironroot Colossus | `m09-ironhide-hunt` | Campaign Node & Bounty Contract | Tavern Bounty Board | Slay mutated ancient behemoth Thornmaw the Ironroot. *Reward:* 600g, 750 XP, Flintbound Cuirass. | ✅ Implemented |
| **SQ1-05** | Cancel the Dead Man's Lien | `m10-undervault-links` & `sq05-the-quartermasters-ledger` | Campaign Node & Side Quest (`side-quests.json`) | Orlen the Grave-Tender | Burn Miller Tobin's debt lien in flooded scriptorium. *Reward:* 300g, 500 XP, Grave-Tender's Chime. | ✅ Implemented |
| **SQ1-06** | Pressure Behind Gallery Four | `sq-m10-dwarven-paychest` & `m10-undervault-links` | Side Quest (`side-quests-4.json`) | Foreman Durn | Recover hidden payroll strongbox of unminted silver. *Choice:* Donate or keep. *Reward:* 450g / Moral Echo in Act III. | ✅ Implemented |

---

## 3. Act II: Into the Redmarsh (Redmarsh Outpost)

### Main Quests (MQ2-01 – MQ2-06)

| Bible ID | Canonical Bible Title | Code ID | Engine Type | Quest Giver / Context | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MQ2-01** | The Corduroy Convoy & Stilt Granary | `m17-mire-convoy` | Core Campaign Mission | Durn the Wagon-Master / Water-Seller Tull | ✅ Implemented |
| **MQ2-02** | Crossfire at Twin Passes & Highgate Watch | `m13-twin-passes` | Core Campaign Mission | Highgate Watch Commander | ✅ Implemented |
| **MQ2-03** | Rupture of the Quartz Wardstones | `m16-wardstone-rupture` | Core Campaign Mission | Scholar Zahra / Field-Warden Hale | ✅ Implemented |
| **MQ2-04** | Revolt in the Deep Quarry | `m20-deep-quarry` | Core Campaign Mission | Chained Miner Leaders / Forgemaster Vok | ✅ Implemented |
| **MQ2-05** | The Fork of Spears | `m23-fork-of-spears` | Core Campaign Mission | Vanguard Command | ✅ Implemented |
| **MQ2-06** | The Dry Cisterns of Gorrathul | `m23-fork-of-spears` & `cs_act2_end` | Campaign Climax & Story Cutscene | Overlord Gorrathul / Chronicle Truth | ✅ Implemented |

### Side Quests & Desert Contracts (SQ2-01 – SQ2-06)

| Bible ID | Canonical Bible Title | Code ID | Engine Type / Spec File | Quest Giver | Primary Objective & Reward | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SQ2-01** | Skulls on the Ochre Ditch | `m14-scattered-scouts` & `sq07-the-canyon-audit` | Campaign Node & Side Quest (`side-quests.json`) | Surveyor Lyra (Redmarsh) | Follow bleached skull trail, ambush illegal iron convoy. *Reward:* 500g, 800 XP, Brine-Vial Pendant. | ✅ Implemented |
| **SQ2-02** | The Four-Faced Milestone Trap | `m18-granary-raid` & `sq35-milestone-dispatch` | Campaign Node & Side Quest (`side-quests-2.json`) | Sabik the Sand-Walker | Disarm trap glyphs at crossroads obelisk, slay dune-lurkers. *Reward:* 650g, 1,000 XP, Alkali-Etched Band. | ✅ Implemented |
| **SQ2-03** | Saelen's Bog-Curse Cauldron | `m19-hexer-capture` & `sq66-megalith-cauldron-soot` | Campaign Node & Side Quest (`side-quests-3.json`) | Water-Seller Tull | Defeat Hexer Saelen & Ssorath; cleanse verdigris cauldron. *Reward:* 1,200 XP, Salt-Crystal Pendulum, Antivenom. | ✅ Implemented (Name Lock) |
| **SQ2-04** | The Redrock Probate Redemption | `sq08-rubbings-in-blood` & `sq65-redrock-silver-scales` | Side Quest (`side-quests.json`, `side-quests-3.json`) | Tomb-Notary Seti | Defeat Khepri; place silver tablets to cancel 80 debt liens. *Reward:* 950g, 1,500 XP, Probate Bailiff's Band / Merc. | ✅ Implemented |
| **SQ2-05** | Behind the Bronze Sluice | `m21-lean-garrison` & `sq67-quarry-chain-keys` | Campaign Node & Side Quest (`side-quests-3.json`) | Miner Gorin (Deep Quarry) | Drain flooded gallery, breach bronze door, recover Morvessa's silver. *Reward:* 1,200g, 1,800 XP, Salt-Tempered Falchion. | ✅ Implemented |
| **SQ2-06** | Timber & Pitch for the Stockade | `sq34-pit-prop-timbers` & `sq62-arroyo-firepot-oil` | Side Quest (`side-quests-2.json`, `side-quests-3.json`) | Carpenter Vane (Highgate Watch) | Deliver 4 black-ironstone plating bundles & bitumen sealant jars. *Reward:* 800g, 1,200 XP, Stockade Defender Greatshield. | ✅ Implemented |

---

## 4. Act III: The Iron Coast (Oakhaven & Harborwatch)

### Side Quests, Reliquary Vaults & Relic Contracts (SQ3-01 – SQ3-04)

| Bible ID | Canonical Bible Title | Code ID | Engine Type / Spec File | Quest Giver | Primary Objective & Reward | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SQ3-01** | The Shipwright's Adze | `sq36-caulking-oakum` & `sq-m35-drydock-winches` | Side Quest (`side-quests-2.json`, `side-quests-4.json`) | Master Shipwright Kors | Infiltrate sawmill, slay Bark-Gnawer, recover ancestral steel adze. *Reward:* 850g, 1,200 XP, Shipwright's Stout Belt. | ✅ Implemented |
| **SQ3-02** | Censer of the Deep Drowned | `m27-field-infirmary` & `sq73-lighthouse-fresnel-lens` | Campaign Node & Side Quest (`side-quests-3.json`) | Ward-Scholar Elowen | Recover submerged silver censer, reconsecrate Morwenna lighthouse. *Reward:* 900g, 1,500 XP, Pearl-Inlaid Beacon Ring. | ✅ Implemented |
| **SQ3-03** | The Mutineer's Ledger | `sq77-vane-ledger-strongbox` & `sq-m33-blackmail-writs` | Side Quest (`side-quests-3.json`, `side-quests-4.json`) | Harbor Marshal Veyra | Track down rogue captain; execute or take bribe. *Reward:* 1,100g, 1,800 XP, Naval Cutlass of the Western Rim. | ✅ Implemented |
| **SQ3-04** | The Sunken Iron Vaults | `m33-high-stakes-gambit` & `sq-m28-harbor-charts` | Campaign Node & Side Quest (`side-quests-4.json`) | Quartermaster Orson | Salvage tax-coffers of Third Duke from reef-wedged galleon. *Reward:* 1,400g, 2,000 XP, Duke's Iron Seal (+Gold/Armor). | ✅ Implemented |

---

## 5. Verification & Test Suite Mapping

All mapped quests are asserted and validated by:
1. `tests/campaign.test.ts` — Full 46-node campaign DAG reachability and unlocks.
2. `tests/hub-evolution.test.ts` — Milestone progression triggered by quest completions.
3. `tests/sidequests.test.ts` (and `tests/town-economy.test.ts`) — Quest acceptance, kill tracking, reward distribution.
4. `tests/ending-slides.test.ts` — Ending cutscene resolution for `m23` (`cs_act2_end`), `m45` (`cs_act4_end_order`), and `m46` (`cs_act4_end_ember`).
