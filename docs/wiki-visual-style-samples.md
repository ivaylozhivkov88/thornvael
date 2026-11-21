# Wiki & Game Icon Visual Style Guide

This document establishes the artistic style standards and provenance for individual icons in Thornvael.

## 1. Icon Dimensions & Format
- **Dimensions**: Exactly 64x64 pixels (`RGBA`).
- **Background**: 100% transparent. Edge pixels must have zero (or near-zero, alpha <= 10) opacity.
- **Rendering Pipeline**: Procedural 4x supersampling (rendered at 256x256, downsampled to 64x64 via PIL `Image.LANCZOS`, saved with `optimize=True`).

## 2. Visual Aesthetic (Classic Retro ARPG)
- **Dark Retro Contour**: Defined dark silhouette outline (`(24, 18, 20, 255)` / `(22, 18, 20, 255)`).
- **Deep Muted Palettes**: Earthy metal tones (iron, steel, bronze, gold), natural cured woods, ivory bones, aged vellum.
- **High-Contrast Specular Highlights**: Sharp reflective highlights (`(240, 250, 255)`) defining metallic edges and gem facets.
- **Ground Drop Shadow**: Subtle translucent contact shadow at the base (`(12, 10, 14, 110)`).

## 3. Spell Icons (`public/spellicons/`)
Previously, `public/spellicons/` contained only:
- `spellicons.png` + `spellicons.json`: An 18-frame sprite atlas intended for unit overhead status effect overlays (`status/*`) and generic school badges (`school/*`).

Now, individual 64x64 PNG icons (`public/spellicons/<id>.png`) are generated for spells, each featuring distinctive school-specific magical glow accents:
- **Air School**: Electric-azure / cyan core (`(130, 215, 255)` to `(240, 252, 255)`).
- **Marksman / Physical**: Ash wood, tempered steel, sharp fletching, warm amber tracking sparks.
- **Wild / Earth School**: Jade-green venom, mossy foliage, toxic spore puffs (`(95, 185, 75)`).
- **Bone (Necromancer)**: Calcified ivory, skeletal armatures, eerie spectral cyan spirit rime (`(130, 235, 220)`).
- **Debt (Necromancer / Astral)**: Imperial merchant gold, royal amethyst / violet aura (`(175, 95, 245)`).
- **Grave (Necromancer / Cold)**: Chilled tomb rime, frost-covered crypt slate, ghostly silver fog (`(95, 220, 210)`).

## 4. Unique Item Icons (`public/itemicons/<id>.png`)
The 20 most visible unique items across all 4 acts now have dedicated, custom-crafted 64x64 PNG icons instead of falling back to standard base item icons:
1. `uniq-tollkeeper-bill` (Tollkeeper's Receipt)
2. `uniq-mordred-tallow-wand` (Candle of the Sunken Sanctum)
3. `uniq-ravenwatch-gate-door` (Splinter of the Bailey)
4. `uniq-greywood-poacher-bow` (Tax-Collector's Recurve)
5. `uniq-krag-jawbone` (Quarryman's Grievance)
6. `uniq-undervault-lantern-helm` (Miner's Canary Cage)
7. `uniq-morvessa-spindle` (Widow's Loom-Weight)
8. `uniq-quarry-overseer-maul` (Indenture Breaker)
9. `uniq-wardstone-shard-focus` (Splinter of the Third Monolith)
10. `uniq-bram-axle-shield` (Iron Wheel of Wagon Four)
11. `uniq-sera-bone-saw` (Healer Sera's Amputation Saw)
12. `uniq-sunken-castellan-plate` (Barnacle-Crusted Brigandine)
13. `uniq-lyra-last-arbalest` (Turnkey of the North Gate)
14. `uniq-stormtree-amber-staff` (Lightning-Split Bough)
15. `uniq-drowned-choir-bell` (Clapper of the Submerged Nave)
16. `uniq-vesperion-organ-pipe` (Hollow Reed of Vesperion)
17. `uniq-anvilmaw-slag-maul` (Tongs of the Cinderforge)
18. `uniq-redglass-fletched-bow` (Caldera Glass Greatbow)
19. `uniq-hollow-monarch-blade` (Abdication)
20. `uniq-ashkarath-crown-shard` (Cinder-King's Halberd-Horn)

Contact sheet review proofs are archived at `.art-build/spell-icons-contact.png` and `.art-build/unique-icons-contact.png`.
