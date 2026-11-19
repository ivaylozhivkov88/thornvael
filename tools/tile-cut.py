"""Cut a Canva texture swatch into 4 seamless 32px ground tiles -> public/terrain/skin-<name>.png (128x32 strip).
Usage: python tools/tile-cut.py tools/.canva-sheets/tile-sand.png sand
Seamless: each crop is cross-faded with a half-shifted copy of itself (wrap blend), then downscaled."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def seamless(a):
    h, w = a.shape[:2]
    shifted = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y, x = np.mgrid[0:h, 0:w]
    # weight 1 in the centre, 0 at the edges -> edges come from the shifted copy (which is continuous there)
    wy = 1 - np.abs(y / (h - 1) * 2 - 1)
    wx = 1 - np.abs(x / (w - 1) * 2 - 1)
    m = np.clip(np.minimum(wy, wx) * 2, 0, 1)[..., None] ** 0.7
    return a * m + shifted * (1 - m)


def main(src, name):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    s = min(w // 4, h // 2)  # crop edge: 4 crops across, centred band
    y0 = (h - s) // 2
    x0 = (w - s * 4) // 2
    out = Image.new("RGBA", (128, 32))
    for i in range(4):
        c = im.crop((x0 + i * s, y0, x0 + (i + 1) * s, y0 + s))
        a = seamless(np.asarray(c, dtype=np.float32))
        t = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((32, 32), Image.LANCZOS)
        out.paste(t.convert("RGBA"), (i * 32, 0))
    dst = ROOT / "public" / "terrain" / f"skin-{name}.png"
    out.save(dst, optimize=True)
    prev = out.resize((512, 128), Image.NEAREST)
    big = Image.new("RGBA", (512, 256))
    for ty in range(2):
        for tx in range(16):
            big.paste(out.crop(((tx % 4) * 32, 0, (tx % 4) * 32 + 32, 32)), (tx * 32, ty * 32 + 64 * 0))
    big.save(ROOT / "tools" / ".canva-sheets" / f"skin-{name}-preview.png")
    print("wrote", dst, dst.stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
