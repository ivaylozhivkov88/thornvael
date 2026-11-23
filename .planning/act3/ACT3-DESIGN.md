# Act III Design Document: The Burning Coast & Ember Reckoning (`Lv 24–36`)

**Branch:** `gemini/big-pass`  
**Canonical Continuity:** Continues directly from Act II (`Overlord Gorrathul`'s fall at Ironheart Bastion) and resolves the main Thornvael plot through `m35-burning-harbor`, `m39-flight-of-malrik`, and `m45-crown-of-order` / `m46-ember-reckoning`.  
**Canonical Name Locks:** **Lord-Captain Korvus** (Dock Commander, Burning Harbor), **Arch-Mage Malrik** (traitor), **Siege Commander Velen** & **High Arcanist Vaelen** (twins), **Valgor** (never Vaelor), **Master Kaelen** (Thornwick Smith only).

---

## 1. Story Synopsis (Main Plot Resolution)
With Ironheart Bastion's dry cisterns exposed as a fifty-year lie, the Vanguard Company marches from Oakhaven into the salt-sprayed coastal provinces and volcanic heartlands. At Burning Harbor, **Lord-Captain Korvus** holds the ash-choked seawall against raiding flotillas while **Siege Commander Velen** coordinates the inland artillery lines. When **Arch-Mage Malrik** breaks the Heartland Beacons and flees toward the Caldera, **High Arcanist Vaelen** guides the Vanguard through the Sundered Ranks and Outer Rampart to confront Malrik at the Ember Threshold, sealing the rift and deciding the Crown of Order.

---

## 2. Zones & Level Ranges (7 Zones, `Lv 24–36`)
1. **Oakhaven & Cinder Wards** (`Lv 24–26`) — Ash-dusted frontier keep, beacon-relay towers, vanguard muster.
2. **Sunken Citadel & Riverlock** (`Lv 26–28`) — Flooded sluice-fortress, bronze tide-locks, drowned wardens.
3. **Burning Harbor** (`Lv 28–30`) — Tar-slicked docks, **Lord-Captain Korvus**'s seawall, corsair fireships.
4. **Shattered Beacons & Heartland** (`Lv 30–32`) — Ruined signal-spires, **Siege Commander Velen**'s forward battery.
5. **Malrik's Flight & Gauntlet of Iron** (`Lv 32–33`) — Obsidian causeway, arcane ward-pylons, **Arch-Mage Malrik**'s vanguard.
6. **Outer Rampart & Three-Roads Siege** (`Lv 33–35`) — Basalt ring-wall, siege engines, **High Arcanist Vaelen**'s breach ritual.
7. **Ember Threshold & Caldera Crown** (`Lv 35–36`) — Volcanic core, **Arch-Mage Malrik**'s final stand & **Ember Reckoning** resolution.

---

## 3. Towns, Shops, Taverns & NPCs (4 Hubs)
1. **Oakhaven Keep** (`town-oakhaven`) — Stone-walled inland command. *Shop:* Armorer Brecht (royal steel, ward-plates). *Tavern:* Quartermistress Ysolde (frontier levies, siege rations). *Command:* **Siege Commander Velen**.
2. **Burning Harbor Docks** (`town-burning-harbor`) — Fortified saltwater quay. *Shop:* Shipwright Tarek (brine-sealed mail, harpoons). *Tavern:* **Lord-Captain Korvus** & Bosun Rafe (marines, fire-warded sails).
3. **Heartland Battery** (`town-heartland`) — Entrenched artillery camp. *Shop:* Artificer Orin (runed bolts, prism staves). *Tavern:* **High Arcanist Vaelen** (battle-mages, ward-scrolls).
4. **Rampart Redoubt** (`town-rampart`) — Final staging bastion below the Caldera. *Shop:* Master-Smith Torvald (basalt-forged arms). *Tavern:* Veteran Halvar (elite Vanguard knights).

---

## 4. Bosses & Mechanics (3 Act III Bosses)
1. **Admiral Vargash of the Ash-Flotilla** (`Lv 29`, Burning Harbor):
   - *Phase 1:* Bombards the quay with *Pitch-Barrel Volleys* and boards with *Corsair Marines*.
   - *Phase 2 (<55% HP):* Ignites *Tide-Fire Broadside* (sweeping flame lanes); players must man **Lord-Captain Korvus**'s harbor ballistae to crack his flagship hull.
2. **The Iron Juggernaut of Riverlock** (`Lv 32`, Gauntlet of Iron):
   - *Phase 1:* *Piston-Slam* shockwaves + *Riveted Bulwark* (reflects ranged arrows).
   - *Phase 2 (<50% HP):* *Boiler Overpressure* vents steam clouds; luring it onto flooded sluice grates cools its core for +50% burst damage.
3. **Arch-Mage Malrik, Usurper of the Caldera** (`Lv 36`, Ember Threshold & Caldera Crown):
   - *Phase 1:* Casts *Cinder Lance* and raises *Obsidian Conduit Pylons* that shield him.
   - *Phase 2 (<65% HP):* Shatters the floor with *Caldera Fault* and summons *Valgor-Bound Shades*; **High Arcanist Vaelen** opens counter-sigils to dispel his barrier.
   - *Phase 3 (<30% HP):* *Ember Reckoning* — channels the collapsing Crown of Order; interrupting his final cast seals the Caldera and completes the main campaign.

---

## 5. Quests (26 Quests with `steps[]`) & 40 Unique Items
- Structured in `src/data/act3/quests.json` (26 quests covering `MQ3-01..08`, `SQ3-01..06`, and 12 regional/endgame contracts, each with 3–4 `steps[]`).
- 40 unique Act III items defined in `src/data/act3/uniques.json` with corresponding 40 painterly paperdoll prompts in `.planning/act3/act3_item_prompts.json`.
