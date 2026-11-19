# Gemini brief: seamless ground textures (Thornvael biomes)

One image per prompt, wait ~2 min between prompts. Save each as `tools/.canva-sheets/tile-<name>.png` (name in bold below).
Then run: `python tools/tile-cut.py tools/.canva-sheets/tile-<name>.png <name>` (cuts 4 seamless 32px tiles into `public/terrain/skin-<name>.png`).

Common rules (already inside every prompt): top-down, flat even light, no objects, no border, no text, no shadows, low contrast, uniform detail, landscape 2:1.

**sand** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: dry desert sand with fine wind ripples and a few tiny pebbles, warm ochre tones. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.

**ash** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: volcanic black ash ground with faint glowing orange cracks and cooled lava crust, dark charcoal tones. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.

**crypt** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: worn dark grey-blue stone flagstones of an ancient crypt floor with fine cracks and dust, hairline gaps only. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.

**highland** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: dry tussock grass and thin soil of windswept highlands, muted olive and tan tones. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.

**snow** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: trampled snow with faint blue shadows and ice specks, cold white-blue tones. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.

**ruinstone** — Generate an image, landscape 2:1. Seamless top-down game ground texture filling the entire frame edge to edge: cracked weathered paving of ruins with moss in the seams, dull grey and green tones. Flat even lighting from above, no perspective, no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.
