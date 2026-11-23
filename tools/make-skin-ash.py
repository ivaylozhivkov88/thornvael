#!/usr/bin/env python3
"""Generate deterministic 128x32 volcanic ash/basalt ground skin (4 seamless 32x32 tiles)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "terrain" / "skin-ash.png"
SEED = 20261124


def hnoise(x: int, y: int, seed: int) -> float:
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def clamp(v: float) -> int:
    return max(0, min(255, round(v)))


def make_strip() -> Image.Image:
    im = Image.new("RGBA", (128, 32))
    px = im.load()
    base = (48, 44, 46)  # dark volcanic ash & basalt
    for v in range(4):
        s = SEED + v * 97
        for y in range(32):
            for x in range(32):
                # Periodic 32x32 low-frequency + fine grain
                n1 = hnoise(x % 32, y % 32, s) - 0.5
                n2 = hnoise((x // 2) % 16, (y // 2) % 16, s + 13) - 0.5
                shift = n1 * 14.0 + n2 * 10.0
                # Occasional basalt pebble or warm cinder fleck
                r = hnoise(x, y, s + 71)
                if r > 0.965:
                    # Basalt shard highlight
                    px[v * 32 + x, y] = (clamp(base[0] + 18), clamp(base[1] + 16), clamp(base[2] + 18), 255)
                elif r < 0.012:
                    # Subtle cooled ember fleck
                    px[v * 32 + x, y] = (clamp(base[0] + 22), clamp(base[1] + 4), clamp(base[2] - 4), 255)
                else:
                    px[v * 32 + x, y] = (
                        clamp(base[0] + shift),
                        clamp(base[1] + shift * 0.95),
                        clamp(base[2] + shift * 0.9),
                        255,
                    )
    return im


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    make_strip().save(OUT, "PNG")
    print("Wrote", OUT)
