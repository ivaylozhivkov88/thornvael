# Portrait prompts (Gemini image generation)

Reproducibility record for the generated portraits in `public/townart/`. The original chat prompts were
not archived at the time. The subject lines below are reconstructed from each asset's role and name, so
a re-run gives the same look and framing, not the same pixels. Output is original art, not a copy of any
existing game, studio or franchise. Use no third-party names in a prompt.

## Shared style (prepend to every prompt)

> Dark fantasy oil-painting portrait, hand-painted look, muted earth palette with one warm accent light,
> heavy chiaroscuro, grim and weathered mood, same style and same gilded frame edge as the other
> Thornvael portraits, 3:4 vertical bust portrait, centered subject, plain dark background, no text, no logo.

## Pipeline

1. Open a new image chat. Paste the shared style, then the subject line.
2. Download the full-size image.
3. Resize to 384x512 JPEG with Pillow (`Image.LANCZOS`, quality 88). Hero and merchant busts stay PNG.
4. Register the file in `game/assets.json` with license `own`, source
   `Gemini image generation (user subscription), original text prompt, resized with Pillow`.

## Subjects

| File | Subject line |
|---|---|
| portrait-warrior-m.png | Broad-shouldered human male warrior, scarred jaw, dented plate pauldrons, short dark beard |
| portrait-warrior-f.png | Human female warrior, braided hair, battered steel gorget, calm steady stare |
| portrait-mage-m.png | Gaunt human male mage, hooded dark-blue robes, faint blue glow under the eyes, ink-stained fingers |
| portrait-mage-f.png | Human female mage, silver streaks in dark hair, rune-stitched collar, candle-lit face |
| hero-valerius.png, hero-dain.png | Named warrior heroes, one veteran, one young, each in a distinct armor silhouette |
| hero-morrigan.png, hero-selena.png | Named mage heroes, one severe and one gentle, each with a distinct robe and focus |
| merchant-shop.png | Stout shopkeeper behind a cluttered counter, lantern light, leather apron |
| merchant-tavern.png | Weary innkeeper wiping a mug, rolled sleeves, warm hearth glow |
| npc-hale.jpg, npc-commander.jpg, npc-scout.jpg | Garrison officer, hard-faced field commander, hooded border scout |
| npc-groktar.jpg | Heavy-browed orcish warband veteran, tusks, bone-trimmed mail |
| npc-orlen.jpg, npc-sabik.jpg, npc-quillon.jpg, npc-aldren.jpg | Four distinct town figures: village elder, desert guide, scribe, old knight |
| friend-archer.jpg, friend-golem.jpg, friend-imp.jpg | Hired archer in a green cloak, patchwork stone golem with a lit core, small cheerful ember imp |
| frame-hero-warrior.jpg, frame-hero-mage.jpg | Empty ornate gilded portrait frames in the warrior and mage color schemes |
| frame-morvessa.jpg, frame-gorrathul.jpg, frame-vesperion.jpg, frame-ashkarath.jpg | Act boss portraits, one per boss, each with its own element and silhouette |
| frame-briar-hound.jpg | Thorn-covered feral hound snarling, glowing eyes |
| mon/gnoll.jpg, mon/sand-raider.jpg, mon/doom-knight.jpg | Hyena-faced raider, desert bandit with a veil, black-armored knight with a cracked helm |
| mon/flintback.jpg, mon/glasswing.jpg, mon/rootbound.jpg | Stone-plated beast, crystal-winged insect, root-tangled walking corpse |
| mon/cinderling.jpg, mon/cinderhorn.jpg | Small ember-skinned runner, large horned ash brute |
| mon/ironbark.jpg, mon/stormtree.jpg | Iron-barked treant, lightning-split ancient tree |
| mon/dune-scarab.jpg, mon/claw-viper.jpg, mon/quill-fiend.jpg, mon/maggot-swarm.jpg | Giant sand scarab, clawed viper, spined fiend, writhing maggot mass |
| mon/azgalor.jpg, mon/ignis-khor.jpg, mon/lilithia.jpg, mon/malakar.jpg | Four original demon lords: horned tyrant, flame lord, pale seductress with wings, robed necromancer |

## Doll layers

`doll/*` are paper-doll layers made from the same base bust with a prompt of the form
"same character and pose, only the <slot> in place, transparent background", then keyed out.
Layers of the same slot share one subject line per body (m or f).
