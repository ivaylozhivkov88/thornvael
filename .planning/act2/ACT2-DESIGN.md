# Act II Design Document: Into the Redmarsh (`Lv 12–24`)

**Branch:** `gemini/big-pass`  
**Canonical Continuity:** Continues directly from Act I (`m11-ashbrook-retreat` & Morvessa's death).  
**Canonical Name Locks:** Master Kaelen (Thornwick Smith only), Hexer **Saelen** (`SQ2-03`), **Quartermaster Bram**, **Chronicler Zahra**, **Cask-Master Tull**, **Forgemaster Vok**, **Overlord Gorrathul**.

---

## 1. Story Synopsis (Continuing Act I)
With Ashbrook Gate scarred but standing and Morvessa's ash-stained ledger in hand, the Vanguard Company marches south across the Redmarsh frontier seeking the glacial cisterns meant to quench the volcanic Caldera seals. Instead of relief, the company steps into a salt-crusted wasteland choked by toxic alkali storms: blood-chanters have cracked the twelve primeval Quartz Wardstones, ironstone miners are shackled in the Deep Quarry, and Overlord Gorrathul holds Ironheart Bastion above cisterns that silted dry fifty years ago.

---

## 2. Zones & Level Ranges (7 Zones, `Lv 12–24`)
1. **Ochre Ditch & Corduroy Causeway** (`Lv 12–14`) — Salt-marsh timber road, ambushed supply convoys, alkali bogs.
2. **Twin Passes & Highgate Watch** (`Lv 14–16`) — Limestone canyon crossfire, signal obelisks, border palisades.
3. **Bracken Alkali Basin** (`Lv 16–18`) — Caustic salt-pans, poisoned oasis wells, Hexer Saelen's bog-cauldron.
4. **Quartz Wardstone Plateau** (`Lv 18–20`) — Shattered resonance monoliths, static dust storms, blood-chanters.
5. **Third-Dynasty Salt-Vaults** (`Lv 20–21`) — Sunken inland-sea port tombs, bitumen altars, Hollow Knights, **Khepri**.
6. **Deep Quarry Terraces** (`Lv 21–23`) — Flooded black-ironstone galleries, bronze sluice-gates, miner revolt.
7. **Fork of Spears & Ironheart Bastion** (`Lv 23–24`) — Basalt citadel approach, dry glacial cisterns, **Overlord Gorrathul**.

---

## 3. Towns, Shops, Taverns & NPCs (4 Hubs)
1. **Redmarsh Outpost** (`town-redmarsh`) — Stilt-built salt-flat hub. *Shop:* Quartermaster Bram (scale armor, brine flasks). *Tavern:* Cask-Master Tull (rations, desert mercs). *Lore/Academy:* Chronicler Zahra.
2. **Highgate Watch** (`town-highgate`) — Canyon garrison post. *Shop:* Carpenter Vane (ironstone plating, pavises). *Tavern:* Watch-Sergeant Durn (convoy escorts).
3. **Brine-Well Oasis** (`town-brinewell`) — Cleansed aquifer camp. *Shop:* Apothecary Sabik (antivenoms, lime-poultices). *Tavern:* Surveyor Lyra (bounties, cistern maps).
4. **Ironheart Quarry-Camp** (`town-quarrycamp`) — Rebel miners' redoubt. *Shop:* Forgemaster Vok (black-ironstone weapons). *Tavern:* Miner Gorin & Tomb-Notary Seti (sappers, probate contracts).

---

## 4. Bosses & Mechanics (3 Act II Bosses)
1. **Hexer Saelen, the Bog-Curse Alchemist** (`Lv 17`, Bracken Alkali Basin):
   - *Phase 1:* Casts *Verdigris Cauldron* (toxic ground pools) and summons *Bog Leeches*.
   - *Phase 2 (<50% HP):* Drinks *Venom Patriarch's Bile*, gaining haste and firing splitting poison bolts; players must shatter the lime-casks around the arena to cleanse stacks.
2. **Khepri, the Sunken Embalmer** (`Lv 21`, Third-Dynasty Salt-Vaults):
   - *Phase 1:* Shielded by *Bitumen Ward* while three *Silver Tally-Altars* empower nearby *Hollow Knights*.
   - *Phase 2 (<60% HP):* Channels *Probate Binding* (rooting tether); placing/striking the three altars strips his ward and exposes him to astral/fire burst.
3. **Gorrathul, the Sand Glutton** (`Lv 24`, Ironheart Bastion):
   - *Phase 1:* Sweeping *Ironheart Cleave* + *Alkali Sand-Vortex* pulling units inward.
   - *Phase 2 (<65% HP):* Shatters limestone pillars, triggering falling-rock AoEs and *Salt-Crusted Carapace* (high physical armor; vulnerable to water/lightning).
   - *Phase 3 (<30% HP):* *Dry Cistern Fury* — enrages inside the silted cistern floor, unleashing radial shockwaves until felled.

---

## 5. Quests (26 Quests with `steps[]`) & 40 Unique Items
- Structured in `src/data/act2/quests.json` (26 quests covering `MQ2-01..06`, `SQ2-01..06`, and 14 regional contracts, each with 3–4 `steps[]`).
- 40 unique Act II items defined in `src/data/act2/uniques.json` with corresponding 40 painterly paperdoll prompts in `.planning/act2/act2_item_prompts.json`.
