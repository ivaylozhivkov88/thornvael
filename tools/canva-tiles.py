"""Batch: one Canva texture swatch per biome ground (Haiku drives Canva, like canva-batch.py).
Usage: python tools/canva-tiles.py [name ...]   -> tools/.canva-sheets/tile-<name>.png (+ .done)"""
import json, os, subprocess, sys, time
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "tools", ".canva-sheets"); os.makedirs(out, exist_ok=True)
TILES = {
 "sand": "dry desert sand with fine wind ripples and a few tiny pebbles, warm ochre tones",
 "ash": "volcanic black ash ground with faint glowing orange cracks and cooled lava crust, dark charcoal tones",
 "crypt": "worn dark grey-blue stone flagstones of an ancient crypt floor with fine cracks and dust, no gaps wider than a hairline",
 "highland": "dry tussock grass and thin soil of windswept highlands, muted olive and tan tones",
 "snow": "trampled snow with faint blue shadows and ice specks, cold white-blue tones",
 "ruinstone": "cracked weathered paving of ruins with moss in the seams, dull grey and green tones",
}
MCP = "mcp__b34dec87-cd15-46ad-834c-54a9175ba4f4"
TPL = ("Use ONLY the Canva MCP tools. Steps: 1) generate-image aspectRatio LANDSCAPE_2_1 with prompt: "
 "\"Seamless top-down game ground texture filling the entire frame edge to edge: {d}. Flat even lighting from above, no perspective, "
 "no objects, no border, no vignette, no text, no shadows, painted dark-fantasy RPG style, low contrast, uniform detail across the whole image.\" "
 "2) poll get-generate-image-job every 20s until SUCCESS (retry on connector error), take the MEDIA id. "
 "3) create-design with references [MEDIA id], brief 'Place this image full-bleed as the only content, no text, no changes, landscape.' (retry once on internal_error); "
 "poll get-create-design-async-job honouring wait_seconds until completed. 4) export-design png export_quality pro. "
 "5) download the URL with curl to {p}. Reply with only OK or FAIL.")
todo = sys.argv[1:] or list(TILES)
for u in todo:
    p = os.path.join(out, "tile-" + u + ".png").replace("\\", "/")
    if os.path.exists(p): continue
    for n in range(3):
        r = subprocess.run(["claude", "-p", TPL.format(d=TILES[u], p=p), "--model", "haiku", "--allowedTools", MCP, "Bash",
            "--permission-mode", "bypassPermissions"], capture_output=True, text=True, cwd=root)
        print(u, "claude:", r.stdout.strip()[-80:], flush=True)
        if os.path.exists(p): break
        time.sleep(60)
    if not os.path.exists(p): print("STOPPED at", u); sys.exit(1)
    time.sleep(400)  # cooldown between Canva calls
print("DONE", todo)
