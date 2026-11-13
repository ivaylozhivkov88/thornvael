"""Cut a paperdoll overlay layer: diff a 'wearing one piece' render against the base body.
usage: python make-doll-layers.py base.jpg look.jpg out.png [threshold]
Output: transparent PNG (cropped to mask bbox, plus offset json) containing the look's pixels
inside the changed region (holes filled, edge feathered)."""
import sys, json
import numpy as np
from PIL import Image, ImageChops, ImageFilter
from scipy import ndimage as ndi

base, look, out = sys.argv[1:4]
thr = int(sys.argv[4]) if len(sys.argv) > 4 else 36
a = Image.open(base).convert('RGB'); b = Image.open(look).convert('RGB').resize(a.size)
d = np.asarray(ImageChops.difference(a, b).convert('L')) > thr
d = ndi.binary_closing(d, iterations=6)
d = ndi.binary_fill_holes(d)
d = ndi.binary_opening(d, iterations=3)
lab, n = ndi.label(d)
if n:
    sizes = ndi.sum(d, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 0.03 * sizes.max()]
    d = np.isin(lab, keep)
d = ndi.binary_dilation(d, iterations=3)
m = Image.fromarray((d * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2.5))
rgba = b.copy(); rgba.putalpha(m)
bb = m.point(lambda v: 255 if v > 8 else 0).getbbox()
rgba = rgba.crop(bb)
rgba.thumbnail((448, 600))
rgba.save(out, optimize=True)
json.dump({'bbox': bb, 'src': list(a.size), 'scale': rgba.size[0] / (bb[2] - bb[0])}, open(out + '.json', 'w'))
print(out, rgba.size, bb)
