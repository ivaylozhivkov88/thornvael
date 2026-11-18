"""Turn a flat-magenta 5-view concept row (front, front-left, left, back-left, back) into a contract unit.

Usage: python tools/sheet-to-unit.py <sheet.jpg|png> <unit> [crop=x0,y0,x1,y1]
Writes tools/.mesh-out/<unit>/<anim>_<dd>_<nn>.png (+ _m.png) for tools/pack-atlas.py.
Own code. Views are mirrored to 16 directions; clips are procedural (bob, lunge, leg swing, fall).
"""
import math
import os
import sys

import numpy as np
from PIL import Image

CELL, FEET_X, FEET_Y = 96, 48, 81
ANIMS = {"stand": 4, "walk": 8, "attack": 4, "cast": 4, "hurt": 2, "die": 4}
TARGET_H = 66  # tallest view, cell px (contract: 48..70)
WORK = 288
PIV = (WORK // 2, WORK * 3 // 4)


def key_magenta(im):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g  # magenta-ness
    edge = np.concatenate([m[:6].ravel(), m[-6:].ravel(), m[:, :6].ravel(), m[:, -6:].ravel()])
    bgm = float(np.clip(np.median(edge), 60, 200))  # adapts to pale-pink backgrounds
    hi, lo = 0.62 * bgm, 0.36 * bgm
    alpha = np.clip((hi - m) / (hi - lo), 0, 1)
    # despill edge pixels toward green so no pink fringe remains
    spill = np.clip(m, 0, None) * (alpha > 0)
    r2, b2 = r - spill * 0.8, b - spill * 0.8
    out = np.dstack([np.clip(r2, 0, 255), g, np.clip(b2, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def despeckle(img):
    from scipy import ndimage
    a = np.asarray(img).copy()
    lab, n = ndimage.label(a[..., 3] > 40)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep = [i + 1 for i, z in enumerate(sizes) if z >= sizes.max() * 0.04]
        a[~np.isin(lab, keep)] = 0
    out = Image.fromarray(a, "RGBA")
    return out.crop(out.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())


def split_views(rgba, n=5):
    al = (np.asarray(rgba)[..., 3] > 40).sum(axis=0)
    W = len(al)
    cuts = [0]
    for i in range(1, n):
        c = W * i // n
        lo, hi = max(cuts[-1] + 20, c - W // 12), min(W - 20, c + W // 12)
        cuts.append(lo + int(np.argmin(al[lo:hi])))
    cuts.append(W)
    views = []
    for x0, x1 in zip(cuts, cuts[1:]):
        sub = rgba.crop((x0, 0, x1, rgba.height))
        views.append(despeckle(sub))
    return views


def make_mask(color):
    """RGB mask: eyes -> team (R), pale claws/fangs/thorn-lights -> armour (G), dorsal ridge -> level (B)."""
    c = np.asarray(color).astype(np.float32)
    r, g, b, a = c[..., 0], c[..., 1], c[..., 2], c[..., 3]
    solid = a > 128
    mask = np.zeros(c.shape, np.uint8)
    h, w = a.shape
    eyes = solid & (r > 120) & (r - g > 60) & (r - b > 60)
    if eyes.sum() < 3:  # fallback: reddest few pixels in the upper part (eyes / glow)
        red = np.where(solid, r - (g + b) / 2, -999)
        red[int(h * 0.5):] = -999
        idx = np.argsort(red, axis=None)[-5:]
        eyes = np.zeros_like(solid)
        eyes.flat[idx] = True
    lum = (r + g + b) / 3
    thr = np.percentile(lum[solid & ~eyes], 94) if (solid & ~eyes).any() else 255
    pale = solid & ~eyes & (lum >= thr)
    ridge = np.zeros_like(solid)
    for x in range(w):
        ys = np.where(solid[:, x])[0]
        if len(ys):
            ridge[ys[0]:ys[0] + max(3, int(h * 0.07)) , x] = True
    ridge &= solid & ~eyes & ~pale
    mask[ridge] = (0, 0, 255, 255)
    mask[pale] = (0, 255, 0, 255)
    mask[eyes] = (255, 0, 0, 255)
    return Image.fromarray(mask, "RGBA")


def fit_scale(views):
    """Per-view scale: equalise sqrt(area) so front/side views read as one animal; cap height and width."""
    ar = [math.sqrt((np.asarray(v)[..., 3] > 40).sum()) for v in views]
    ref = max(ar)
    ks = [ref / x for x in ar]
    k0 = min(TARGET_H / max(v.height * k for v, k in zip(views, ks)), 76 / max(v.width * k for v, k in zip(views, ks)))
    out = [k * k0 for k in ks]
    return [max(k, 51.0 / v.height) if v.height * k < 51 else k for v, k in zip(views, out)]


def place(img):
    """Put a view on the WORK canvas with its feet at the pivot."""
    cv = Image.new("RGBA", (WORK, WORK), (0, 0, 0, 0))
    cv.paste(img, (PIV[0] - img.width // 2, PIV[1] - img.height))
    return cv


def legs_swing(cv, phase, amp, vertical):
    """Shear the lower third of the figure: left/right halves swing in antiphase."""
    a = np.asarray(cv).copy()
    ys, xs = np.where(a[..., 3] > 40)
    if not len(ys):
        return cv
    top, bot, cx = ys.min(), ys.max(), int(xs.mean())
    split = bot - (bot - top) * 0.34
    out = a.copy()
    out[int(split):] = 0
    for half, sgn in ((0, 1.0), (1, -1.0)):
        x0, x1 = (0, cx) if half == 0 else (cx, WORK)
        for y in range(int(split), bot + 1):
            t = (y - split) / max(1.0, bot - split)
            if vertical:
                continue
            dx = int(round(amp * math.sin(phase) * sgn * t))
            seg = a[y, x0:x1]
            xa, xb = x0 + dx, x1 + dx
            sa, sb = max(0, -xa), len(seg) - max(0, xb - WORK)
            if sb > sa:
                out[y, max(0, xa):min(WORK, xb)] = np.where(seg[sa:sb, 3:4] > 0, seg[sa:sb], out[y, max(0, xa):min(WORK, xb)])
        if vertical:
            lift = int(round(amp * 0.6 * max(0.0, math.sin(phase) * sgn)))
            band = a[int(split):bot + 1, x0:x1]
            ya = int(split) - lift
            out[ya:ya + band.shape[0], x0:x1] = np.where(band[..., 3:4] > 0, band, out[ya:ya + band.shape[0], x0:x1])
    return Image.fromarray(out, "RGBA")


def xform(cv, sx=1.0, sy=1.0, rot=0.0, tx=0.0, ty=0.0):
    """Scale/rotate about the feet pivot, then translate. rot>0 moves the top to the right."""
    th = math.radians(rot)
    c, s = math.cos(th), math.sin(th)
    # forward: p' = R*S*(p-piv) + piv + t ; PIL wants the inverse mapping.
    ia, ib = c / sx, s / sx
    ic, id_ = -s / sy, c / sy
    px, py = PIV
    # inverse of R*S: S^-1 * R^-1
    a_ = c / sx
    b_ = s / sx
    d_ = -s / sy
    e_ = c / sy
    cx_ = px - (a_ * (px + tx) + b_ * (py + ty))
    cy_ = py - (d_ * (px + tx) + e_ * (py + ty))
    return cv.convert("RGBa").transform(cv.size, Image.AFFINE, (a_, b_, cx_, d_, e_, cy_), Image.BICUBIC).convert("RGBA")


def bbox_ok(cv):
    bb = cv.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bb:
        return 1.0
    l, t, r, b = bb
    f = 1.0
    for ext, room in ((PIV[0] - l, FEET_X - 3), (r - PIV[0], CELL - FEET_X - 3), (PIV[1] - t, FEET_Y - 3), (b - PIV[1], CELL - FEET_Y - 3)):
        if ext > room and ext > 0:
            f = min(f, max(0.2, room / ext))
    return f


def to_cell(cv):
    box = (PIV[0] - FEET_X, PIV[1] - FEET_Y, PIV[0] - FEET_X + CELL, PIV[1] - FEET_Y + CELL)
    return cv.crop(box)


def tint(cell, rgb, k):
    a = np.asarray(cell).astype(np.float32)
    m = a[..., 3:4] > 0
    a[..., :3] = np.where(m, a[..., :3] * (1 - k) + np.array(rgb, np.float32) * k, a[..., :3])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


def frame(cv_c, cv_m, d, anim, n):
    th = math.radians(d * 22.5)
    fx, fy = -math.sin(th), math.cos(th)  # facing on screen (0 S, 4 W, 8 N, 12 E)
    front_back = d in (0, 8) or d in (1, 15, 7, 9)
    p = dict(sx=1.0, sy=1.0, rot=0.0, tx=0.0, ty=0.0)
    col = None
    if anim == "stand":
        b = math.sin(2 * math.pi * n / 4) * 0.018
        p.update(sy=1 + b, sx=1 - b * 0.5)
    elif anim == "walk":
        ph = 2 * math.pi * n / 8
        p.update(ty=-abs(math.sin(ph)) * 2.8, rot=3.0 * math.sin(ph) * (1 if abs(fx) > 0.3 else 0.5))
        cv_c = legs_swing(cv_c, ph, 7.0, front_back)
        cv_m = legs_swing(cv_m, ph, 7.0, front_back)
    elif anim == "attack":
        q = (0.15, 1.0, 0.55, 0.0)[n]
        p.update(tx=fx * 9 * q, ty=fy * 5 * q - 1.5 * q, sx=1 + 0.07 * q, sy=1 + 0.07 * q, rot=9 * q * fx)
    elif anim == "cast":
        q = (0.3, 1.0, 1.0, 0.5)[n]
        p.update(sy=1 + 0.07 * q, sx=1 - 0.03 * q, rot=-5 * q * fx, ty=-1.5 * q)
        col = ((255, 235, 190), 0.16 * q)
    elif anim == "hurt":
        q = (1.0, 0.45)[n]
        p.update(tx=-fx * 5 * q, ty=-fy * 3 * q, sy=1 - 0.05 * q, sx=1 + 0.05 * q, rot=-8 * q * fx)
        col = ((255, 50, 40), 0.38 * q)
    elif anim == "die":
        q = (0.25, 0.55, 0.85, 1.0)[n]
        bb0 = cv_c.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        wide = bb0 and (bb0[2] - bb0[0]) > 1.0 * (bb0[3] - bb0[1])
        if wide:  # long low body (quadruped side view): collapse onto the ground, tip slightly
            p.update(rot=(10 if fx >= 0 else -10) * q, sy=1 - 0.45 * q, sx=1 + 0.10 * q)
        else:
            p.update(rot=(82 if fx >= 0 else -82) * q, sy=1 - 0.10 * q, sx=1 + 0.05 * q)
        col = ((20, 10, 10), 0.18 * q)
    out = []
    for cv in (cv_c, cv_m):
        t = xform(cv, **p)
        out.append(t)
    if anim == "die":  # lying body: re-seat on the ground line, centred on the feet column
        bb = out[0].getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb:
            dx, dy = PIV[0] - (bb[0] + bb[2]) // 2, PIV[1] - bb[3]
            out = [o.transform(o.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy)) for o in out]
    f = bbox_ok(out[0])
    if f < 1.0:
        p["sx"] *= f
        p["sy"] *= f
        out = [xform(cv, **p) for cv in (cv_c, cv_m)]
    c, m = to_cell(out[0]), to_cell(out[1])
    ca = np.asarray(c)[..., 3] > 8
    ma = np.asarray(m).copy()
    ma[~ca] = 0
    ma[..., 3] = np.where(ma[..., 3] > 128, 255, 0)
    ma[ma[..., 3] == 0] = 0
    m = Image.fromarray(ma, "RGBA")
    if col:
        c = tint(c, *col)
    return c, m


def auto_crop(im):
    """Crop to the tallest horizontal band that holds the subject strip (background may be a gradient)."""
    a = np.asarray(im).astype(int)
    med = np.median(a, axis=1, keepdims=True)  # per-row background colour
    diff = np.abs(a - med).sum(axis=2) > 60
    rows = diff.sum(axis=1) > max(6, im.width * 0.004)
    best, cur = (0, 0), None
    for y, on in enumerate(list(rows) + [False]):
        if on and cur is None:
            cur = y
        elif not on and cur is not None:
            if y - cur > best[1] - best[0]:
                best = (cur, y)
            cur = None
    y0, y1 = best
    pad = 12
    return im.crop((0, max(0, y0 - pad), im.width, min(im.height, y1 + pad)))


def main():
    sheet, unit = sys.argv[1], sys.argv[2]
    im = Image.open(sheet).convert("RGB")
    for a in sys.argv[3:]:
        if a == "crop=auto":
            im = auto_crop(im)
        elif a.startswith("crop="):
            im = im.crop(tuple(int(v) for v in a[5:].split(",")))
    views = split_views(key_magenta(im))
    k = fit_scale(views)
    cols, masks = [], []
    for v, kk in zip(views, k):
        v = v.resize((max(1, round(v.width * kk)), max(1, round(v.height * kk))), Image.LANCZOS)
        m = make_mask(v)
        cols.append(v)
        masks.append(m)
    base = {0: 0, 2: 1, 4: 2, 6: 3, 8: 4, 10: ("m", 3), 12: ("m", 2), 14: ("m", 1)}
    cardinal = {1: 0, 3: 4, 5: 4, 7: 8, 9: 8, 11: 12, 13: 12, 15: 0}
    out_dir = os.path.join(os.path.dirname(__file__), ".mesh-out", unit)
    os.makedirs(out_dir, exist_ok=True)
    for d in range(16):
        src = base[d] if d in base else base[cardinal[d]]
        if isinstance(src, tuple):
            c, m = cols[src[1]].transpose(Image.FLIP_LEFT_RIGHT), masks[src[1]].transpose(Image.FLIP_LEFT_RIGHT)
        else:
            c, m = cols[src], masks[src]
        cv_c, cv_m = place(c), place(m)
        for anim, n in ANIMS.items():
            for i in range(n):
                fc, fm = frame(cv_c, cv_m, d, anim, i)
                fc.save(os.path.join(out_dir, "%s_%02d_%02d.png" % (anim, d, i)))
                fm.save(os.path.join(out_dir, "%s_%02d_%02d_m.png" % (anim, d, i)))
    print("wrote", out_dir, "views:", [(v.width, v.height) for v in cols])


if __name__ == "__main__":
    main()
