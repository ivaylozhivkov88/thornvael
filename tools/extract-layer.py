"""Cut one equipment layer out of an image-model edit of the nude base.
Usage: python tools/extract-layer.py base.png dressed.png out.png [slot]
Aligns the edit to the base (scale + shift), keeps pixels that differ, saves a full-canvas RGBA layer."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def not_green(rgb: np.ndarray) -> np.ndarray:
    r, g, b = [rgb[..., i].astype(int) for i in range(3)]
    return ~((g > 120) & (g - r > 60) & (g - b > 60))


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: python tools/extract-layer.py base.png dressed.png out.png [slot]")
    base = Image.open(sys.argv[1]).convert("RGBA")
    w, h = base.size
    bg = Image.new("RGBA", (w, h), (0, 255, 0, 255))
    bg.alpha_composite(base)
    base_rgb = np.array(bg.convert("RGB"))
    dressed_rgb = Image.open(sys.argv[2]).convert("RGB")
    dressed_rgb = dressed_rgb.resize((round(dressed_rgb.width * h / dressed_rgb.height), h), Image.Resampling.LANCZOS)

    def place(s: float, dx: int, dy: int) -> np.ndarray:
        im = dressed_rgb.resize((round(dressed_rgb.width * s), round(dressed_rgb.height * s)), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (w, h), (0, 255, 0))
        canvas.paste(im, (round((w - im.width) / 2 + dx), round((h - im.height) / 2 + dy)))
        return np.array(canvas)

    def score(p: np.ndarray) -> float:
        diff_arr = np.abs(p.astype(int) - base_rgb.astype(int)).sum(2)
        mask = not_green(base_rgb) | not_green(p)
        vals = np.sort(diff_arr[mask])
        keep = max(1, int(len(vals) * 0.4))
        return float(vals[:keep].mean() + (not_green(base_rgb) ^ not_green(p)).mean() * 100)

    best = (1e9, 1.0, 0, 0)
    for step_s, step_d, span_s, span_d in [(0.02, 8, 4, 3), (0.005, 2, 3, 3), (0.002, 1, 2, 2)]:
        _, s0, x0, y0 = best
        for i in range(-span_s, span_s + 1):
            for j in range(-span_d, span_d + 1):
                for k in range(-span_d, span_d + 1):
                    s, dx, dy = s0 + i * step_s, x0 + j * step_d, y0 + k * step_d
                    v = score(place(s, dx, dy))
                    if v < best[0]:
                        best = (v, s, dx, dy)

    aligned = place(*best[1:])
    diff = ndimage.gaussian_filter(np.abs(aligned.astype(float) - base_rgb.astype(float)).sum(2), 1.2)
    mask = (diff > 52) & not_green(aligned)
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, iterations=4)
    mask = ndimage.binary_fill_holes(mask) & not_green(aligned)
    lab, count = ndimage.label(mask)
    if count:
        sizes = ndimage.sum(mask, lab, range(1, count + 1))
        mask = np.isin(lab, 1 + np.where(sizes > max(240, sizes.max() * 0.06))[0])
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    rgb = aligned.copy()
    spill = rgb[..., 1] > np.maximum(rgb[..., 0], rgb[..., 2]).astype(int) + 25
    rgb[..., 1] = np.where(spill, np.maximum(rgb[..., 0], rgb[..., 2]), rgb[..., 1])
    out = Image.fromarray(rgb).convert("RGBA")
    out.putalpha(alpha)
    out.save(sys.argv[3])
    print(f"scale {best[1]:.3f} dx {best[2]} dy {best[3]} score {best[0]:.1f}")


if __name__ == "__main__":
    main()
