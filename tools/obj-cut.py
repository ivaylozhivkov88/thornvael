"""Cut the Gemini object sheets (3x2 grids on magenta) into one small atlas: public/objects/objects.png + objects.json.
Usage: python tools/obj-cut.py   (reads tools/.canva-sheets/obj-*.jpg)
Frames are named <group>/<name>, anchor = bottom centre (ground contact point)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tools" / ".canva-sheets"
OUT = ROOT / "public" / "objects"

# sheet -> (group, scale, names row-major)
SHEETS = {
    "obj-bones": ("bones", 0.10, ["pile", "ribcage", "skullspike", "tombstone", "sarcophagus", "candles"]),
    "obj-ruins": ("ruins", 0.12, ["column-broken", "column", "wall", "statue", "arch", "rubble"]),
    "obj-camp": ("camp", 0.12, ["tent", "fire", "banner", "rack", "crates", "palisade"]),
    "obj-rocks": ("rocks", 0.12, ["boulder-l", "boulder-m", "cluster", "slab", "spire", "crystal"]),
    "obj-trees-desert": ("desert", 0.12, ["palm-a", "palm-b", "dead", "thorn", "cactus", "stump"]),
    "obj-trees-volcanic": ("volcanic", 0.12, ["dead-a", "dead-b", "stump", "logs", "obsidian", "vent"]),
    "obj-trees-highland": ("highland", 0.12, ["pine-a", "pine-b", "oak", "gorse", "standing-stone", "log"]),
}


def key(im):
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    d = np.sqrt((255 - a[..., 0]) ** 2 + a[..., 1] ** 2 + (255 - a[..., 2]) ** 2)
    alpha = np.clip((d - 70) / 70, 0, 1)
    # despill: pull magenta fringe toward neutral on semi-transparent edge pixels
    spill = np.clip((a[..., 0] + a[..., 2]) / 2 - a[..., 1], 0, 255) * (alpha < 1)[..., None].squeeze(-1)
    a[..., 0] -= spill * 0.8
    a[..., 2] -= spill * 0.8
    rgba = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main():
    frames = []
    for stem, (group, scale, names) in SHEETS.items():
        p = SRC / f"{stem}.jpg"
        if not p.exists():
            print("skip", stem)
            continue
        im = key(Image.open(p))
        w, h = im.size
        cw, ch = w // 3, h // 2
        for i, name in enumerate(names):
            cell = im.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
            bb = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if not bb:
                print("empty", stem, name)
                continue
            spr = cell.crop(bb)
            spr = spr.resize((max(1, round(spr.width * scale)), max(1, round(spr.height * scale))), Image.LANCZOS)
            frames.append((f"{group}/{name}", spr))
    # shelf pack into 512 wide
    W = 512
    x = y = rowh = 0
    placed = {}
    for name, spr in sorted(frames, key=lambda f: -f[1].height):
        if x + spr.width + 1 > W:
            x, y, rowh = 0, y + rowh + 1, 0
        placed[name] = (x, y, spr)
        x += spr.width + 1
        rowh = max(rowh, spr.height)
    H = 1
    while H < y + rowh:
        H *= 2
    atlas = Image.new("RGBA", (W, H))
    meta = {}
    for name, (px, py, spr) in placed.items():
        atlas.paste(spr, (px, py))
        meta[name] = {"x": px, "y": py, "w": spr.width, "h": spr.height, "anchor": [spr.width // 2, spr.height - 2]}
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "objects.png", optimize=True)
    (OUT / "objects.json").write_text(json.dumps({"image": "objects.png", "size": [W, H], "frames": meta}, indent=1))
    print(len(meta), "frames", W, H, (OUT / "objects.png").stat().st_size, "bytes")
    atlas.save(SRC / "objects-preview.png")


if __name__ == "__main__":
    main()
