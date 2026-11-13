# Thornvael Art Bible

One visual language for every asset (terrain, units, town, UI, VFX). Reference: hero-select (`campfire-bg.webp`) and the classic 1999 retro pre-rendered look.

- **Look:** pre-rendered 3D. Soft global illumination, rich material detail (moss, grit, wet stone, worn leather and iron), painterly but never cartoon, no outlines, no pixel-art dithering, no flat vector fills.
- **View:** top-down 3/4 (camera ~55° above the ground), orthographic. Ground tiles are shot nearly top-down; objects and units show their front and top.
- **Light:** ONE key light from the **top-left** (shadows fall down-right, short and soft). Warm torch/sunset key (~`#ffb066`), cool blue-teal shadow fill (~`#1c2a3a`). Rim light warm-orange on the left edges of objects. Bake nothing that contradicts this.
- **Palette:** dark and low-saturation. Mid-tones are earthy: moss `#3b4a2c`, dirt `#5a4632`, stone `#5b5d5c`, marsh `#3f4a30`, water `#25424c`. Highlights never pure white (max `#e8d2a8`). Shadows never pure black (min `#0d1117`). Accent colours (red, gold, magic blue/green/violet) are rare and small, and they glow.
- **Value structure:** ground stays in the mid-dark band so units (brighter, warmer, higher contrast) read on top. No strong high-frequency noise in ground tiles.
- **Terrain tiles:** seamless, uniform lighting (no baked directional shadows or vignette, since the game adds slope shading), no text, no UI, no objects, no single landmark that betrays repetition.
- **Atmosphere:** subtle cool haze with depth, warm fire glow pools, dust motes and embers in VFX. Water: dark teal, soft caustics, pale shore foam.
- **Technical:** WebP preferred, each file < 1 MB, new art < 6 MB total. Power-of-two tiles. Original generated art only; never copy third-party copyrighted assets.

## v2 additions (2026-11-14)

- **Painted layer (portraits, scenes, paperdoll):** dark-fantasy oil-painting look, one gilded thin frame edge, 3:4 vertical bust framing, warm key from the left, cool teal fill, soft vignette. Original designs only; prompts describe our own characters and creatures, never a named franchise. Shipped at 384x512 JPG (q82), provenance per file in `assets.json`.
- **Outline rule:** none on terrain, objects and painted art. Units and VFX get a 1 px dark rim only when they would otherwise melt into the ground. Never a bright outline.
- **Scale:** 1 tile = 32 px at zoom 1. Hero about 1.6 tiles tall, common enemy 1.2-1.6, boss 2.5-3. Selection ring radius follows unit footprint; health bar width 1.2x footprint.
- **Tier colour language** (items, UI, floaters): common grey-white `#c9c5bb`, magic blue `#6f8fe8`, rare gold `#e0b84a`, unique orange-brown `#c07a3a`, set green `#58b36a`, mystic violet `#a070e0`. Glow is additive and small; tier is never signalled by shape alone.
- **Paperdoll:** base body on flat grey `#808080`, overlay layers cut by diffing consecutive edits, placed in percent of the base image. One layer per look, not per item; unique items get their own layer key (`slot:Item Name`) and fall back to the generic look. Tier is a tint, never a new layer.
- **UI frames:** dark stone/leather panels, gold hairline border (`#b08a3c`), parchment text `#e8d2a8`, 44-48 px touch targets, no text over busy art without a dark scrim.
- **Motion:** hit-stop 45 ms on crits, floaters rise and fade over ~900 ms, screen shake trauma decays exponentially; nothing flashes faster than 3 Hz.
