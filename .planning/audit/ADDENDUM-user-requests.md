# Addendum for 00-EXECUTIVE-SUMMARY.md (from the user, 2026-11-24)

Include this task in the master backlog, Wave 1 (S2, size: large, Gemini-capable):

**ITEM-ICON-UNIFY: replace the old procedural 64px item icons with the painterly 128px set**
- Problem: `public/itemicons/` mixes two styles. Old layer (commits 3900edd, ed9a720, e.g. flint-stiletto, steel-gauntlets, wizard-hat, yew-wand, amber-focus-wand): small flat cartoon icons with a drop shadow and dots. New layer (from doll_prompts.json via gemini/item-images, e.g. tower, targe, buckler): realistic painterly dark-fantasy, 128px.
- Fix: finish the 261 prompts on branch gemini/item-images (currently ~15 done, 429 quota limits the pace), then regenerate every remaining old-style icon in the new style: same size 128px, transparent background, no shadow, one item (gloves/boots: single item, ensure it reads as a glove/boot). Replace only after the new file exists so the inventory never has gaps. Regenerate chapter1-manifest.json (npm run manifest) after the swap.
- Done when: no icon in public/itemicons is smaller than 128px or has the old shadow style; check:repo and tests pass.
- Depends on: gemini/item-images branch merge (only on the user's explicit say).
