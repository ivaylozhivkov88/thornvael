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
