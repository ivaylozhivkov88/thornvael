"""Own code. Build the necromancer hero set from our own ash-weaver sprite frames:
hue-shift the red/orange magic to necrotic green, then add a procedural green burst to attack/cast frames.
Output: tools/.mesh-out/necromancer/ (then pack with tools/pack-atlas.py)."""
import colorsys, math, os, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, ".mesh-out", "ash-weaver")
OUT = os.path.join(HERE, ".mesh-out", "necromancer")
CELL, S = 96, 4


def recolor(im):
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    s = np.where(mx > 0, d / (mx + 1e-6), 0)
    warm = ((h < 0.17) | (h > 0.93)) & (s > 0.35)
    nh = np.where(warm, 0.33 + (h % 1.0) * 0.1, h)
    ns = np.where(warm, np.minimum(1.0, s * 0.9), s)
    # hsv -> rgb
    i = np.floor(nh * 6).astype(int) % 6
    f = nh * 6 - np.floor(nh * 6)
    p, q, t = mx * (1 - ns), mx * (1 - f * ns), mx * (1 - (1 - f) * ns)
    rgb = np.stack([
        np.choose(i, [mx, q, p, p, t, mx]),
        np.choose(i, [t, mx, mx, q, p, p]),
        np.choose(i, [p, p, t, mx, mx, q])], -1)
    out = np.dstack([rgb, al])
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")


def burst(d, amt):
    th = math.radians(d * 22.5)
    fx, fy = -math.sin(th), math.cos(th)
    cx, cy = 48 + fx * 20, 44 + fy * 7
    im = Image.new("RGBA", (CELL * S, CELL * S), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    R = amt * 9
    for k, (rad, col) in enumerate(((1.0, (20, 120, 50, 110)), (0.68, (40, 200, 90, 170)), (0.36, (170, 255, 190, 230)))):
        rr = R * rad
        g.ellipse([(cx - rr) * S, (cy - rr) * S, (cx + rr) * S, (cy + rr) * S], fill=col)
    for a in range(5):  # wisps
        ang = a * 1.26 + d * 0.4
        x2, y2 = cx + math.cos(ang) * R * 1.5, cy + math.sin(ang) * R * 1.1
        g.line([(cx * S, cy * S), (x2 * S, y2 * S)], fill=(60, 220, 110, 150), width=int(1.2 * S))
    im = im.filter(ImageFilter.GaussianBlur(0.6 * S))
    return im.resize((CELL, CELL), Image.LANCZOS)


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    amts = {"attack": (0.35, 0.7, 1.0, 0.3), "cast": (0.35, 0.7, 1.0, 0.3)}
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith(".png"):
            continue
        src = os.path.join(SRC, fn)
        if fn.endswith("_m.png"):
            shutil.copy(src, os.path.join(OUT, fn))
            continue
        clip, d, n = fn[:-4].split("_")
        im = recolor(Image.open(src))
        if clip in amts:
            im = Image.alpha_composite(im, burst(int(d), amts[clip][int(n)]))
        im.save(os.path.join(OUT, fn))
    print("necromancer frames done")


if __name__ == "__main__":
    main()
