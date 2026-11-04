# Current enemy specifics

`monsterInfo(kind)` in `src/monster-info.ts` returns immutable structured base values (`base`, copied from the current `DEFS`) and a plain-text description (`text`). It supports Gnoll, Golem, Imp and Archer; other kinds return `null`. The unit-info caller must determine whether an Archer is hostile. This helper does not decide diplomacy or expose a unit through fog.

Values describe the family, not current HP, difficulty multipliers, gear or temporary statuses. Attack element, damage, accuracy, fixed-point reach converted to tiles, attack ticks/seconds, walking speed percentage, dodge, armour and absorption per body part, and five school resistances all come from `DEFS`. Negative resistance means vulnerability. Caster, known-spell mask and default-autocast ID remain available in `base`; spell details must come from the installed spell table. No special attacks are inferred from a creature's name or appearance.

Gnolls currently have physical melee attacks and fire vulnerability. Golems have physical melee attacks, slower movement, natural absorption and school resistances. Imps have ranged fire attacks, caster/autocast data, fire resistance and water vulnerability. Hostile Archers use the existing physical ranged Archer definition. These are the existing mechanics, not new family abilities.

`Bot.commands` collects only living, non-hidden members of its team, in ascending unit-ID order, before slicing squads. Active squads retain the existing `(tick + squad * 7) % 125 === 1` schedule and seeded target generation. A wholly inactive team emits no commands and consumes no bot random numbers. Removing inactive members can change an active unit's squad index; fixed roster membership is not persisted.

Both AIs continue to issue the existing `move`/`order` vocabulary. Replay correctness is the Sim hash from the recorded command log; the Bot PRNG and MonsterAi pack state are not asserted to be part of that hash. Resuming live MonsterAi decisions requires restoring both the Sim snapshot and `MonsterAi.snapshot()` into the same static pack layout, as the existing save path does. No new simulation/save fields or balance changes are introduced.

Targeted verification: `npx vitest run tests/monster-ai-specifics.test.ts`. Parent integration owns unit-info wiring, full-suite checks and browser verification.
