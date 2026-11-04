# Hero equipment and skill presentation

Equipment (including empty slots) and inventory reuse the original `townicons.itemIcon` SVGs. Visible item names, stack counts, slot labels and existing `data-k` hooks remain on the same native buttons. Decorative SVGs are hidden from assistive technology; the text supplies each accessible name. Existing button styles retain minimum 44px targets. Selection and use/unequip actions keep their existing queued hero commands.

Each skill shows its level, a named native progress bar, numeric uses/threshold, remaining uses to the next level and the existing `SKILL_TIP` explanation in visible text. `skillProgress` reads the hero state and uses `skillNeed` and `SKILL_MAX` from `sim/hero.ts`; capped skills show a full bar and no next threshold. No new abilities or progression rules are introduced.

Validation: `npx vitest run tests/hero-presentation.test.ts` exercises the displayed remaining count against actual `heroUse` transitions for all three skills through the cap, and verifies read-only handling of capped restored state. Parent integration runs `e2e/hero-presentation.spec.ts`: item identity through unequip/equip with accessible icons and 44px targets, plus visible near-threshold/capped skill explanations. Browser tests are authored but not run by this worker.
