# Task: rewrite weak wiki summaries — category "affixes" (146 entries)

You write for the in-game wiki of **Thornvael**, a dark-fantasy top-down RTS/ARPG (Rage of Mages 2 style): a frontier border region, ash, iron, salt-tithe armies, gnolls, necromancers, a Vanguard Company. Tone: grim, dry, concrete, slightly wry; like a field-guide or quartermaster's ledger. English only.

## What to do
For EACH entry below, write a better `summary` (one line, 70–140 characters) and one `flavor` paragraph (2–3 sentences, 220–420 characters).
- The summary must say what the thing IS and why a player cares, using the facts in the entry's `infobox` (tier, slot, class, effect, act). Never contradict or invent numbers; do not repeat raw stats verbatim.
- The flavor is in-world lore: who made/used/feared it, where it is found in the Border. Do NOT reveal story spoilers (act endings, who dies, final boss identity). Keep names consistent with the entry's title; do not invent new proper nouns beyond one or two small ones.
- No copyrighted names from Rage of Mages, Diablo, Warcraft, etc. No emojis, no markdown inside strings.
- Make entries of the same tier/kind sound different from each other; avoid repeating the same opening words.

## Output format (STRICT)
Return ONE valid JSON object, nothing else, no code fence: `{"<id>": {"summary": "...", "flavor": "..."}, ...}` covering every id below exactly once. Escape quotes properly.

## Entries (id, title, current summary, infobox)
{"id":"pref-stout","title":"Stout","summary":"Prefix · tier 1 · Body 1","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Body 1"],["Slots","Weapon, Armor, Shield, Helm"]]}
{"id":"pref-oxen","title":"Oxen","summary":"Prefix · tier 2 · Body 1-2","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Body 1-2"],["Slots","Weapon, Armor, Shield, Boots"]]}
{"id":"pref-quarry-born","title":"Quarry-Born","summary":"Prefix · tier 3 · Body 2-3","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Body 2-3"],["Slots","Weapon, Armor, Shield"]]}
{"id":"pref-colossus-wrought","title":"Colossus-Wrought","summary":"Prefix · tier 4 · Body 3-4","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","Body 3-4"],["Slots","Weapon, Armor, Shield"]]}
{"id":"pref-lucid","title":"Lucid","summary":"Prefix · tier 1 · Mind 1","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Mind 1"],["Slots","Weapon, Helm, Armor, Ring, Amulet"]]}
{"id":"pref-scribe-marked","title":"Scribe-Marked","summary":"Prefix · tier 2 · Mind 1-2","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Mind 1-2"],["Slots","Weapon, Helm, Armor, Ring"]]}
{"id":"pref-vesperal","title":"Vesperal","summary":"Prefix · tier 3 · Mind 2-3","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Mind 2-3"],["Slots","Weapon, Helm, Armor, Amulet"]]}
{"id":"pref-archon-forged","title":"Archon-Forged","summary":"Prefix · tier 4 · Mind 3-4","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","Mind 3-4"],["Slots","Weapon, Helm, Armor, Amulet"]]}
{"id":"pref-brisk","title":"Brisk","summary":"Prefix · tier 1 · Speed 3-6","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Speed 3-6"],["Slots","Boots, Weapon, Armor"]]}
{"id":"pref-fleet","title":"Fleet","summary":"Prefix · tier 2 · Speed 7-11","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Speed 7-11"],["Slots","Boots, Weapon, Ring"]]}
{"id":"pref-galestrung","title":"Galestrung","summary":"Prefix · tier 3 · Speed 12-16","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Speed 12-16"],["Slots","Boots, Weapon, Amulet"]]}
{"id":"pref-hale","title":"Hale","summary":"Prefix · tier 1 · Max HP 8-15","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Max HP 8-15"],["Slots","Armor, Helm, Shield, Ring, Amulet"]]}
{"id":"pref-blood-warm","title":"Blood-Warm","summary":"Prefix · tier 2 · Max HP 16-28","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Max HP 16-28"],["Slots","Armor, Helm, Shield, Amulet"]]}
{"id":"pref-sinew-bound","title":"Sinew-Bound","summary":"Prefix · tier 3 · Max HP 30-45","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Max HP 30-45"],["Slots","Armor, Helm, Shield, Ring"]]}
{"id":"pref-immortal","title":"Undying","summary":"Prefix · tier 4 · Max HP 48-68","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","Max HP 48-68"],["Slots","Armor, Shield, Amulet"]]}
{"id":"pref-wellspring","title":"Wellspring","summary":"Prefix · tier 1 · Max Mana 8-14","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Max Mana 8-14"],["Slots","Weapon, Helm, Armor, Ring, Amulet"]]}
{"id":"pref-vessel","title":"Deep-Vessel","summary":"Prefix · tier 2 · Max Mana 16-26","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Max Mana 16-26"],["Slots","Weapon, Helm, Armor, Amulet"]]}
{"id":"pref-ley-steeped","title":"Ley-Steeped","summary":"Prefix · tier 3 · Max Mana 28-42","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Max Mana 28-42"],["Slots","Weapon, Helm, Armor, Ring"]]}
{"id":"pref-abyssal-font","title":"Astral-Font","summary":"Prefix · tier 4 · Max Mana 45-65","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","Max Mana 45-65"],["Slots","Weapon, Helm, Armor, Amulet"]]}
{"id":"pref-riveted","title":"Riveted","summary":"Prefix · tier 1 · Armor 1-2","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","Armor 1-2"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"pref-bastion","title":"Bastion-Grade","summary":"Prefix · tier 2 · Armor 3-4","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Armor 3-4"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"pref-citadel-plated","title":"Citadel-Plated","summary":"Prefix · tier 3 · Armor 5-7","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","Armor 5-7"],["Slots","Armor, Shield, Helm"]]}
{"id":"pref-true-sighted","title":"True-Sighted","summary":"Prefix · tier 2 · Accuracy 2-4","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","Accuracy 2-4"],["Slots","Weapon, Helm, Ring"]]}
{"id":"pref-unerring","title":"Unerring","summary":"Prefix · tier 4 · Accuracy 5-8","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","Accuracy 5-8"],["Slots","Weapon, Helm, Ring, Amulet"]]}
{"id":"suff-of-the-ford","title":"of the Ford","summary":"Suffix · tier 1 · Cold res 8-14","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Cold res 8-14"],["Slots","Boots, Armor, Shield"]]}
{"id":"suff-of-winter-watch","title":"of Winter Watch","summary":"Suffix · tier 2 · Cold res 16-26","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Cold res 16-26"],["Slots","Armor, Helm, Boots, Amulet, Ring"]]}
{"id":"suff-of-the-glacier","title":"of the Rime-Vault","summary":"Suffix · tier 4 · Cold res 28-40","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Cold res 28-40"],["Slots","Armor, Shield, Amulet, Ring"]]}
{"id":"suff-of-slag","title":"of the Slag-Heap","summary":"Suffix · tier 1 · Fire res 8-14","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Fire res 8-14"],["Slots","Armor, Shield, Boots, Helm"]]}
{"id":"suff-of-the-kiln","title":"of the Kiln","summary":"Suffix · tier 2 · Fire res 16-26","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Fire res 16-26"],["Slots","Armor, Shield, Helm, Ring, Amulet"]]}
{"id":"suff-of-the-caldera","title":"of the Caldera","summary":"Suffix · tier 4 · Fire res 28-40","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Fire res 28-40"],["Slots","Armor, Shield, Amulet, Ring"]]}
{"id":"suff-of-the-fen","title":"of the Fen","summary":"Suffix · tier 1 · Poison res 8-14","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Poison res 8-14"],["Slots","Boots, Armor, Helm, Ring"]]}
{"id":"suff-of-alkali","title":"of the Salt-Pan","summary":"Suffix · tier 2 · Poison res 16-26","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Poison res 16-26"],["Slots","Armor, Helm, Boots, Amulet, Ring"]]}
{"id":"suff-of-the-ossuary","title":"of the Bile-Ward","summary":"Suffix · tier 4 · Poison res 28-40","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Poison res 28-40"],["Slots","Armor, Shield, Amulet, Ring"]]}
{"id":"suff-of-copper-wire","title":"of Grounding","summary":"Suffix · tier 1 · Lightning res 8-14","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Lightning res 8-14"],["Slots","Boots, Armor, Helm, Shield"]]}
{"id":"suff-of-the-fulgurite","title":"of Fulgurite","summary":"Suffix · tier 2 · Lightning res 16-26","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Lightning res 16-26"],["Slots","Armor, Shield, Helm, Ring, Amulet"]]}
{"id":"suff-of-the-storm-rod","title":"of the Storm-Rod","summary":"Suffix · tier 4 · Lightning res 28-40","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Lightning res 28-40"],["Slots","Armor, Shield, Amulet, Ring"]]}
{"id":"suff-of-spite","title":"of Spite","summary":"Suffix · tier 1 · Crit 2-4","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Crit 2-4"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-the-butcher","title":"of the Abattoir","summary":"Suffix · tier 2 · Crit 5-8","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Crit 5-8"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-arteries","title":"of Severed Sinew","summary":"Suffix · tier 3 · Crit 9-13","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","Crit 9-13"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-execution","title":"of the Headsman","summary":"Suffix · tier 4 · Crit 14-18","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Crit 14-18"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-the-tick","title":"of the Wood-Tick","summary":"Suffix · tier 1 · Life steal 2-3","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Life steal 2-3"],["Slots","Weapon, Ring"]]}
{"id":"suff-of-the-leech","title":"of the Redmarsh Leech","summary":"Suffix · tier 2 · Life steal 4-6","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Life steal 4-6"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-exsanguination","title":"of the Tithe","summary":"Suffix · tier 3 · Life steal 7-10","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","Life steal 7-10"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"suff-of-the-strigoi","title":"of the Crimson Thirst","summary":"Suffix · tier 4 · Life steal 11-15","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Life steal 11-15"],["Slots","Weapon, Amulet"]]}
{"id":"suff-of-quietude","title":"of Quietude","summary":"Suffix · tier 1 · Mana regen 1-2","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","Mana regen 1-2"],["Slots","Helm, Armor, Ring, Amulet"]]}
{"id":"suff-of-the-cistern","title":"of the Cistern","summary":"Suffix · tier 2 · Mana regen 3-4","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","Mana regen 3-4"],["Slots","Weapon, Helm, Armor, Ring, Amulet"]]}
{"id":"suff-of-the-pendulum","title":"of the Pendulum","summary":"Suffix · tier 3 · Mana regen 5-7","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","Mana regen 5-7"],["Slots","Weapon, Helm, Ring, Amulet"]]}
{"id":"suff-of-perpetual-ash","title":"of the Unbroken Circle","summary":"Suffix · tier 4 · Mana regen 8-12","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","Mana regen 8-12"],["Slots","Weapon, Helm, Armor, Amulet"]]}
{"id":"aff2-riveted","title":"Riveted","summary":"Prefix · tier 1 · +4 Armor","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+4 Armor"],["Slots","Armor, Shield"]]}
{"id":"aff2-bog-stained","title":"Bog-Stained","summary":"Prefix · tier 1 · +12 Poison res","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+12 Poison res"],["Slots","Armor, Boots"]]}
{"id":"aff2-notched","title":"Notched","summary":"Prefix · tier 1 · +3 Damage","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+3 Damage"],["Slots","Weapon"]]}
{"id":"aff2-waxed","title":"Waxed","summary":"Prefix · tier 1 · +6 Accuracy","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+6 Accuracy"],["Slots","Bow, Gloves"]]}
{"id":"aff2-tallow-sealed","title":"Tallow-Sealed","summary":"Prefix · tier 1 · +12 Cold res","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+12 Cold res"],["Slots","Armor, Boots"]]}
{"id":"aff2-pauper-inked","title":"Pauper-Inked","summary":"Prefix · tier 1 · +14 Max Mana","infobox":[["Kind","Prefix"],["Tier","1"],["Effect","+14 Max Mana"],["Slots","Wand, Staff, Robe"]]}
{"id":"aff2-quarry-hewn","title":"Quarry-Hewn","summary":"Prefix · tier 2 · +5 Armor pen","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+5 Armor pen"],["Slots","Weapon"]]}
{"id":"aff2-alkali-cured","title":"Alkali-Cured","summary":"Prefix · tier 2 · +16 Fire res, +10 Poison res","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+16 Fire res, +10 Poison res"],["Slots","Armor"]]}
{"id":"aff2-salt-bitten","title":"Salt-Bitten","summary":"Prefix · tier 2 · +6 Damage, +4 Crit %","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+6 Damage, +4 Crit %"],["Slots","Weapon"]]}
{"id":"aff2-copper-wound","title":"Copper-Wound","summary":"Prefix · tier 2 · +18 Lightning res, +0.8 Mana regen","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+18 Lightning res, +0.8 Mana regen"],["Slots","Staff, Wand, Hat"]]}
{"id":"aff2-fen-stalking","title":"Fen-Stalking","summary":"Prefix · tier 2 · +7 Evasion %, +6 Move speed %","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+7 Evasion %, +6 Move speed %"],["Slots","Boots, Armor"]]}
{"id":"aff2-notarized","title":"Notarized","summary":"Prefix · tier 2 · +12 Dot dmg %","infobox":[["Kind","Prefix"],["Tier","2"],["Effect","+12 Dot dmg %"],["Slots","Wand, Ring, Amulet"]]}
{"id":"aff2-annealed","title":"Annealed","summary":"Prefix · tier 3 · +12 Armor, +30 Max hp","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+12 Armor, +30 Max hp"],["Slots","Armor, Shield"]]}
{"id":"aff2-bodkin-tipped","title":"Bodkin-Tipped","summary":"Prefix · tier 3 · +10 Damage, +7 Armor pen","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+10 Damage, +7 Armor pen"],["Slots","Bow"]]}
{"id":"aff2-galvanic","title":"Galvanic","summary":"Prefix · tier 3 · +12 Lightning dmg, +8 Cast speed %","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+12 Lightning dmg, +8 Cast speed %"],["Slots","Staff, Wand"]]}
{"id":"aff2-bitumen-coated","title":"Bitumen-Coated","summary":"Prefix · tier 3 · +22 Poison res, +35 Max hp","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+22 Poison res, +35 Max hp"],["Slots","Armor"]]}
{"id":"aff2-windlass-spanned","title":"Windlass-Spanned","summary":"Prefix · tier 3 · +12 Damage, +18 Crit dmg %","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+12 Damage, +18 Crit dmg %"],["Slots","Bow"]]}
{"id":"aff2-indentured","title":"Indentured","summary":"Prefix · tier 3 · +18 Minion hp %, +28 Max Mana","infobox":[["Kind","Prefix"],["Tier","3"],["Effect","+18 Minion hp %, +28 Max Mana"],["Slots","Wand, Robe, Amulet"]]}
{"id":"aff2-meteor-forged","title":"Meteor-Forged","summary":"Prefix · tier 4 · +18 Damage, +10 Armor pen","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+18 Damage, +10 Armor pen"],["Slots","Weapon"]]}
{"id":"aff2-slag-quenched","title":"Slag-Quenched","summary":"Prefix · tier 4 · +20 Armor, +24 Fire res","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+20 Armor, +24 Fire res"],["Slots","Armor, Shield"]]}
{"id":"aff2-pre-schism","title":"Pre-Schism","summary":"Prefix · tier 4 · +6 Int, +1.6 Mana regen","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+6 Int, +1.6 Mana regen"],["Slots","Staff, Wand, Hat"]]}
{"id":"aff2-oath-bound","title":"Oath-Bound","summary":"Prefix · tier 4 · +22 Minion dmg %, +12 All res","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+22 Minion dmg %, +12 All res"],["Slots","Robe, Amulet, Ring"]]}
{"id":"aff2-smoke-veiled","title":"Smoke-Veiled","summary":"Prefix · tier 4 · +12 Evasion %, +8 Crit %","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+12 Evasion %, +8 Crit %"],["Slots","Armor, Boots, Hat"]]}
{"id":"aff2-brine-tempered","title":"Brine-Tempered","summary":"Prefix · tier 4 · +26 Cold res, +10 Block %","infobox":[["Kind","Prefix"],["Tier","4"],["Effect","+26 Cold res, +10 Block %"],["Slots","Shield, Armor"]]}
{"id":"aff2-sovereign","title":"Sovereign","summary":"Prefix · tier 5 · +28 Damage, +10 Crit %, +7 Str","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+28 Damage, +10 Crit %, +7 Str"],["Slots","Weapon"]]}
{"id":"aff2-anchor-sealed","title":"Anchor-Sealed","summary":"Prefix · tier 5 · +32 Armor, +18 All res","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+32 Armor, +18 All res"],["Slots","Armor, Shield"]]}
{"id":"aff2-caldera-born","title":"Caldera-Born","summary":"Prefix · tier 5 · +25 Fire dmg %, +30 Fire res","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+25 Fire dmg %, +30 Fire res"],["Slots","Staff, Wand, Robe"]]}
{"id":"aff2-first-watch","title":"First-Watch","summary":"Prefix · tier 5 · +95 Max hp, +25 Morale res","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+95 Max hp, +25 Morale res"],["Slots","Armor, Hat, Amulet"]]}
{"id":"aff2-foreclosing","title":"Foreclosing","summary":"Prefix · tier 5 · +6 Lifesteal %, +24 Damage","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+6 Lifesteal %, +24 Damage"],["Slots","Weapon"]]}
{"id":"aff2-star-iron","title":"Star-Iron","summary":"Prefix · tier 5 · +20 All res, +30 Crit dmg %","infobox":[["Kind","Prefix"],["Tier","5"],["Effect","+20 All res, +30 Crit dmg %"],["Slots","Weapon, Armor"]]}
{"id":"aff2-of-the-ford","title":"of the Ford","summary":"Suffix · tier 1 · +10 Cold res, +12 Max HP","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+10 Cold res, +12 Max HP"],["Slots","Boots, Ring"]]}
{"id":"aff2-of-tallies","title":"of Tallies","summary":"Suffix · tier 1 · +10 Gold %","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+10 Gold %"],["Slots","Ring, Amulet"]]}
{"id":"aff2-of-dry-socks","title":"of Dry Socks","summary":"Suffix · tier 1 · +10 Fatigue red","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+10 Fatigue red"],["Slots","Boots"]]}
{"id":"aff2-of-the-ditch","title":"of the Ditch","summary":"Suffix · tier 1 · +3 Armor, +14 Max HP","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+3 Armor, +14 Max HP"],["Slots","Armor, Shield"]]}
{"id":"aff2-of-goose-fletch","title":"of Goose-Fletch","summary":"Suffix · tier 1 · +7 Accuracy","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+7 Accuracy"],["Slots","Bow, Gloves"]]}
{"id":"aff2-of-gall-ink","title":"of Gall-Ink","summary":"Suffix · tier 1 · +15 Max Mana","infobox":[["Kind","Suffix"],["Tier","1"],["Effect","+15 Max Mana"],["Slots","Wand, Ring"]]}
{"id":"aff2-of-the-cistern","title":"of the Cistern","summary":"Suffix · tier 2 · +16 Fire res, +24 Max HP","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+16 Fire res, +24 Max HP"],["Slots","Amulet, Ring"]]}
{"id":"aff2-of-sinew","title":"of Sinew","summary":"Suffix · tier 2 · +4 Dex, +7 Atk speed %","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+4 Dex, +7 Atk speed %"],["Slots","Gloves, Bow"]]}
{"id":"aff2-of-arrears","title":"of Arrears","summary":"Suffix · tier 2 · +14 Dot dmg %, +20 Max Mana","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+14 Dot dmg %, +20 Max Mana"],["Slots","Wand, Ring"]]}
{"id":"aff2-of-the-pick","title":"of the Pick","summary":"Suffix · tier 2 · +6 Armor pen, +3 Str","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+6 Armor pen, +3 Str"],["Slots","Weapon"]]}
{"id":"aff2-of-vinegar","title":"of Vinegar","summary":"Suffix · tier 2 · +18 Poison res, +12 Heal recv %","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+18 Poison res, +12 Heal recv %"],["Slots","Armor, Amulet"]]}
{"id":"aff2-of-the-parapet","title":"of the Parapet","summary":"Suffix · tier 2 · +14 Missile res, +6 Block %","infobox":[["Kind","Suffix"],["Tier","2"],["Effect","+14 Missile res, +6 Block %"],["Slots","Shield, Hat"]]}
{"id":"aff2-of-the-sluice","title":"of the Sluice","summary":"Suffix · tier 3 · +22 Cold res, +10 Armor","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+22 Cold res, +10 Armor"],["Slots","Armor, Boots"]]}
{"id":"aff2-of-the-windlass","title":"of the Windlass","summary":"Suffix · tier 3 · +22 Crit dmg %, +5 Dex","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+22 Crit dmg %, +5 Dex"],["Slots","Bow, Gloves"]]}
{"id":"aff2-of-probate","title":"of Probate","summary":"Suffix · tier 3 · +20 Minion hp %, +5 Int","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+20 Minion hp %, +5 Int"],["Slots","Wand, Staff, Amulet"]]}
{"id":"aff2-of-conduction","title":"of Conduction","summary":"Suffix · tier 3 · +22 Lightning res, +1.3 Mana regen","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+22 Lightning res, +1.3 Mana regen"],["Slots","Ring, Hat"]]}
{"id":"aff2-of-the-keel","title":"of the Keel","summary":"Suffix · tier 3 · +48 Max hp, +5 Vit","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+48 Max hp, +5 Vit"],["Slots","Armor, Shield"]]}
{"id":"aff2-of-sightlines","title":"of Sightlines","summary":"Suffix · tier 3 · +2 Vision tiles, +14 Accuracy","infobox":[["Kind","Suffix"],["Tier","3"],["Effect","+2 Vision tiles, +14 Accuracy"],["Slots","Hat, Bow"]]}
{"id":"aff2-of-the-fissure","title":"of the Fissure","summary":"Suffix · tier 4 · +26 Fire res, +16 Damage","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+26 Fire res, +16 Damage"],["Slots","Weapon, Armor"]]}
{"id":"aff2-of-the-witness","title":"of the Witness","summary":"Suffix · tier 4 · +24 Mind res, +18 Heal power %","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+24 Mind res, +18 Heal power %"],["Slots","Amulet, Robe"]]}
{"id":"aff2-of-the-bailiff","title":"of the Bailiff","summary":"Suffix · tier 4 · +5 Lifesteal %, +6 Str","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+5 Lifesteal %, +6 Str"],["Slots","Weapon, Ring"]]}
{"id":"aff2-of-the-gauntlet","title":"of the Gauntlet","summary":"Suffix · tier 4 · +22 Armor, +65 Max hp","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+22 Armor, +65 Max hp"],["Slots","Armor, Boots"]]}
{"id":"aff2-of-the-leyline","title":"of the Leyline","summary":"Suffix · tier 4 · +55 Max Mana, +12 Cast speed %","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+55 Max Mana, +12 Cast speed %"],["Slots","Staff, Wand, Ring"]]}
{"id":"aff2-of-the-cairn","title":"of the Cairn","summary":"Suffix · tier 4 · +14 All res, +6 Vit","infobox":[["Kind","Suffix"],["Tier","4"],["Effect","+14 All res, +6 Vit"],["Slots","Shield, Amulet"]]}
{"id":"aff2-of-the-threshold","title":"of the Threshold","summary":"Suffix · tier 5 · +18 All res, +100 Max hp","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+18 All res, +100 Max hp"],["Slots","Armor, Amulet"]]}
{"id":"aff2-of-liquidation","title":"of Liquidation","summary":"Suffix · tier 5 · +12 Crit %, +32 Crit dmg %","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+12 Crit %, +32 Crit dmg %"],["Slots","Weapon"]]}
{"id":"aff2-of-the-dais","title":"of the Dais","summary":"Suffix · tier 5 · +8 Str, +8 Vit, +25 Armor","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+8 Str, +8 Vit, +25 Armor"],["Slots","Armor, Ring"]]}
{"id":"aff2-of-the-void-eye","title":"of the Void-Eye","summary":"Suffix · tier 5 · +9 Int, +2.4 Mana regen","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+9 Int, +2.4 Mana regen"],["Slots","Staff, Hat, Amulet"]]}
{"id":"aff2-of-the-unbroken","title":"of the Unbroken","summary":"Suffix · tier 5 · +15 Block %, +110 Max hp","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+15 Block %, +110 Max hp"],["Slots","Shield, Armor"]]}
{"id":"aff2-of-reckoning","title":"of Reckoning","summary":"Suffix · tier 5 · +26 Damage, +14 Armor pen","infobox":[["Kind","Suffix"],["Tier","5"],["Effect","+26 Damage, +14 Armor pen"],["Slots","Weapon"]]}
{"id":"sim-prefix-jagged","title":"Jagged","summary":"Prefix · tier 1-2 · +1-1 Damage","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1-1 Damage"],["Slots","Weapon"]]}
{"id":"sim-prefix-serrated","title":"Serrated","summary":"Prefix · tier 2-3 · +2-3 Damage, +1 Acc","infobox":[["Kind","Prefix"],["Tier","2-3"],["Effect","+2-3 Damage, +1 Acc"],["Slots","Weapon"]]}
{"id":"sim-prefix-keen","title":"Keen","summary":"Prefix · tier 3-4 · +3-5 Damage, +2 Acc","infobox":[["Kind","Prefix"],["Tier","3-4"],["Effect","+3-5 Damage, +2 Acc"],["Slots","Weapon"]]}
{"id":"sim-prefix-cruel","title":"Cruel","summary":"Prefix · tier 4-5 · +5-8 Damage, +3 Acc","infobox":[["Kind","Prefix"],["Tier","4-5"],["Effect","+5-8 Damage, +3 Acc"],["Slots","Weapon"]]}
{"id":"sim-prefix-stout","title":"Stout","summary":"Prefix · tier 1-2 · +1 Def, +1 Abs","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1 Def, +1 Abs"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"sim-prefix-hardened","title":"Hardened","summary":"Prefix · tier 2-3 · +2 Def, +1 Abs","infobox":[["Kind","Prefix"],["Tier","2-3"],["Effect","+2 Def, +1 Abs"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"sim-prefix-tempered","title":"Tempered","summary":"Prefix · tier 3-4 · +2 Def, +2 Abs","infobox":[["Kind","Prefix"],["Tier","3-4"],["Effect","+2 Def, +2 Abs"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"sim-prefix-indomitable","title":"Indomitable","summary":"Prefix · tier 4-5 · +3 Def, +3 Abs","infobox":[["Kind","Prefix"],["Tier","4-5"],["Effect","+3 Def, +3 Abs"],["Slots","Armor, Shield, Helm, Boots"]]}
{"id":"sim-prefix-glowing","title":"Glowing","summary":"Prefix · tier 1-2 · +1-1 Damage","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1-1 Damage"],["Slots","All gear"]]}
{"id":"sim-prefix-fiery","title":"Fiery","summary":"Prefix · tier 2-4 · +2-3 Damage","infobox":[["Kind","Prefix"],["Tier","2-4"],["Effect","+2-3 Damage"],["Slots","All gear"]]}
{"id":"sim-prefix-volcanic","title":"Volcanic","summary":"Prefix · tier 4-5 · +4-6 Damage","infobox":[["Kind","Prefix"],["Tier","4-5"],["Effect","+4-6 Damage"],["Slots","All gear"]]}
{"id":"sim-prefix-chilly","title":"Chilly","summary":"Prefix · tier 1-2 · +1 Def","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1 Def"],["Slots","All gear"]]}
{"id":"sim-prefix-glacial","title":"Glacial","summary":"Prefix · tier 3-5 · +2 Def, +1 Abs","infobox":[["Kind","Prefix"],["Tier","3-5"],["Effect","+2 Def, +1 Abs"],["Slots","All gear"]]}
{"id":"sim-prefix-breezy","title":"Breezy","summary":"Prefix · tier 1-2 · +1 Acc","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1 Acc"],["Slots","All gear"]]}
{"id":"sim-prefix-storming","title":"Storming","summary":"Prefix · tier 3-5 · +2-3 Damage, +2 Acc","infobox":[["Kind","Prefix"],["Tier","3-5"],["Effect","+2-3 Damage, +2 Acc"],["Slots","All gear"]]}
{"id":"sim-prefix-earthen","title":"Earthen","summary":"Prefix · tier 1-2 · +1 Abs","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+1 Abs"],["Slots","All gear"]]}
{"id":"sim-prefix-granite","title":"Granite","summary":"Prefix · tier 3-5 · +2 Def, +2 Abs","infobox":[["Kind","Prefix"],["Tier","3-5"],["Effect","+2 Def, +2 Abs"],["Slots","All gear"]]}
{"id":"sim-prefix-glimmering","title":"Glimmering","summary":"Prefix · tier 1-2 · +6 Mana, +4% Power","infobox":[["Kind","Prefix"],["Tier","1-2"],["Effect","+6 Mana, +4% Power"],["Slots","Weapon, Helm, Ring, Amulet"]]}
{"id":"sim-prefix-luminescent","title":"Luminescent","summary":"Prefix · tier 3-4 · +14 Mana, +8% Power","infobox":[["Kind","Prefix"],["Tier","3-4"],["Effect","+14 Mana, +8% Power"],["Slots","Weapon, Helm, Ring, Amulet"]]}
{"id":"sim-prefix-celestial","title":"Celestial","summary":"Prefix · tier 4-5 · +24 Mana, +14% Power","infobox":[["Kind","Prefix"],["Tier","4-5"],["Effect","+24 Mana, +14% Power"],["Slots","Weapon, Helm, Ring, Amulet"]]}
{"id":"sim-suffix-of-striking","title":"of Striking","summary":"Suffix · tier 1-2 · +1-2 Damage","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","+1-2 Damage"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"sim-suffix-of-carnage","title":"of Carnage","summary":"Suffix · tier 2-3 · +2-4 Damage","infobox":[["Kind","Suffix"],["Tier","2-3"],["Effect","+2-4 Damage"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"sim-suffix-of-slaughter","title":"of Slaughter","summary":"Suffix · tier 4-5 · +4-7 Damage","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","+4-7 Damage"],["Slots","Weapon, Ring, Amulet"]]}
{"id":"sim-suffix-of-the-ox","title":"of the Ox","summary":"Suffix · tier 1-2 · +10 HP","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","+10 HP"],["Slots","All gear"]]}
{"id":"sim-suffix-of-the-bear","title":"of the Bear","summary":"Suffix · tier 2-4 · +20 HP","infobox":[["Kind","Suffix"],["Tier","2-4"],["Effect","+20 HP"],["Slots","All gear"]]}
{"id":"sim-suffix-of-the-behemoth","title":"of the Behemoth","summary":"Suffix · tier 4-5 · +35 HP","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","+35 HP"],["Slots","All gear"]]}
{"id":"sim-suffix-of-dexterity","title":"of Dexterity","summary":"Suffix · tier 1-2 · +1 Acc","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","+1 Acc"],["Slots","All gear"]]}
{"id":"sim-suffix-of-grace","title":"of Grace","summary":"Suffix · tier 2-4 · +2 Acc, +1 Def","infobox":[["Kind","Suffix"],["Tier","2-4"],["Effect","+2 Acc, +1 Def"],["Slots","All gear"]]}
{"id":"sim-suffix-of-nirvana","title":"of Nirvana","summary":"Suffix · tier 4-5 · +3 Acc, +2 Def","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","+3 Acc, +2 Def"],["Slots","All gear"]]}
{"id":"sim-suffix-of-thought","title":"of Thought","summary":"Suffix · tier 1-2 · +8 Mana","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","+8 Mana"],["Slots","All gear"]]}
{"id":"sim-suffix-of-wisdom","title":"of Wisdom","summary":"Suffix · tier 2-4 · +16 Mana","infobox":[["Kind","Suffix"],["Tier","2-4"],["Effect","+16 Mana"],["Slots","All gear"]]}
{"id":"sim-suffix-of-the-archmage","title":"of the Archmage","summary":"Suffix · tier 4-5 · +28 Mana, +6% Power","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","+28 Mana, +6% Power"],["Slots","All gear"]]}
{"id":"sim-suffix-of-health","title":"of Health","summary":"Suffix · tier 1-2 · +15 HP, +1 Regen","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","+15 HP, +1 Regen"],["Slots","All gear"]]}
{"id":"sim-suffix-of-regeneration","title":"of Regeneration","summary":"Suffix · tier 2-4 · +25 HP, +2 Regen","infobox":[["Kind","Suffix"],["Tier","2-4"],["Effect","+25 HP, +2 Regen"],["Slots","All gear"]]}
{"id":"sim-suffix-of-immortality","title":"of Immortality","summary":"Suffix · tier 4-5 · +40 HP, +3 Regen","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","+40 HP, +3 Regen"],["Slots","All gear"]]}
{"id":"sim-suffix-of-protection","title":"of Protection","summary":"Suffix · tier 1-2 · Elemental / Attribute bonus","infobox":[["Kind","Suffix"],["Tier","1-2"],["Effect","Elemental / Attribute bonus"],["Slots","All gear"]]}
{"id":"sim-suffix-of-warding","title":"of Warding","summary":"Suffix · tier 2-4 · Elemental / Attribute bonus","infobox":[["Kind","Suffix"],["Tier","2-4"],["Effect","Elemental / Attribute bonus"],["Slots","All gear"]]}
{"id":"sim-suffix-of-the-aegis","title":"of the Aegis","summary":"Suffix · tier 4-5 · Elemental / Attribute bonus","infobox":[["Kind","Suffix"],["Tier","4-5"],["Effect","Elemental / Attribute bonus"],["Slots","All gear"]]}
