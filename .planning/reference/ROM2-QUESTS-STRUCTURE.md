# Rage of Mages II — Quest & Trigger Script Structure

*Source: Structural analysis of `Description Checks.ini` (27 checks), `Description Instants.ini` (49 actions), `main.res/text/quest.txt` (96 lines), and `46` `.alm` scenario maps (no original text or names copied).*

---

## 1. Declarative Script Architecture
Rage of Mages II avoids embedded imperative scripting in maps; instead, `.alm` files store **trigger rules** composed of:
- **Condition (`Checks`, 27 primitives):** Pure state queries evaluated against units, groups, players, regions, buildings, inventory, or scenario variables.
- **Action (`Instants`, 49 primitives):** State mutations executed when conditions pass (spawning, AI orders, diplomacy, items, messages, stage transitions, win/loss).
- **Stage & Subobjective Model:** Missions advance through numbered `mission stage` integers and boolean/numeric `Subobjective` flags, decoupled from localized briefing text in `mission*.txt` and `quest.txt`.

---

## 2. Check Vocabulary (`27` Primitives Grouped by Domain)
- **Unit & Group Queries (6):** Group unit count, unit alive check, unit parameter read, unit attacking check, VIP status check, unit inside box/circle region.
- **Spatial & Proximity (4):** Distance between two units, distance from point to unit, distance to nearest player unit, camera/map centered on tile.
- **Player & Economy (3):** Player unit count, player building count, building health query.
- **Diplomacy & Items (4):** Diplomacy state check, ground sack check, item delivered to point, item present in unit inventory.
- **Variables, Spells & Logic (10):** Constant value, `TRUE`, `FALSE`, variable value, scenario variable, subobjective state, active spell on tile, active spell on unit, teleportation check, unit parameter compare.

---

## 3. Instant / Action Vocabulary (`49` Primitives Grouped by Domain)
- **Mission Flow & UI (7):** Increment mission stage, set scenario variable, set subobjective, force mission complete, force mission fail, send message, change music / set music node.
- **Squad & AI Orders (10):** Group commands for `Guard`, `Swarm`, `Swarm 2`, `Stand Ground`, `Move`, `Attack`, `Defend`, `Patrol`, `Follow`, `Roam`, `Dwell`, plus `Set formation` and `Suspend group`.
- **Unit & Group Lifecycle (8):** Phase in/out single unit, phase in/out group, polymorph unit, change unit/group owner, set unit parameter, teleport unit, outpost repopper + repop delay.
- **Inventory & Loot (6):** Add item to inventory, remove item from inventory, remove item from all inventories, transfer item between units, drop single location / drop all, give money to player.
- **World, Diplomacy & Magic (18):** Change diplomacy, set building health, set trap, cast spell on unit, make spell effect, tile/unit spell duration, set/increment local variables, give all.

---

## 4. Quest & Mission Taxonomy (`96` Entries in `quest.txt`, `46` Maps)
- **Main Campaign Missions:** Multi-stage linear/branching maps combining escort, siege defense, assassination, and artifact recovery.
- **Town / Tavern Side Quests:** Short single-goal contracts (clear monster pack, rescue scout, recover item to point, deliver message) rewarded with gold, XP, and reputation/shop access.
- **Key Lesson for Thornvael:** Keeping `27` checks and `49` actions purely declarative makes every mission deterministic, serializable, and testable headlessly without a JS eval sandbox.
