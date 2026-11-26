"""Paint the warrior doll's non-sword weapon layers (our own procedural art, MIT).
Drawn on the 597x800 doll canvas around the grip point, then cropped. Prints the percent boxes
used in src/doll.ts."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public/townart/doll'
W, H, K = 597, 800, 4
GRIP = (207, 427)
WOOD, WOOD_HI = (86, 56, 34), (134, 94, 56)
STEEL, STEEL_HI, DARK = (122, 124, 128), (196, 198, 204), (34, 28, 24)
WRAP = (70, 40, 26)


def s(points):
    return [(round((GRIP[0] + x) * K), round((GRIP[1] + y) * K)) for x, y in points]


def line(d, pts, width, fill, hi=None):
    d.line(s(pts), fill=DARK, width=(width + 3) * K, joint='curve')
    d.line(s(pts), fill=fill, width=width * K, joint='curve')
    if hi:
        d.line(s([(x - width * .22, y - width * .1) for x, y in pts]), fill=hi, width=max(1, width // 4) * K, joint='curve')


def poly(d, pts, fill, edge=None):
    d.polygon(s(pts), fill=fill)
    d.line(s(pts + pts[:1]), fill=DARK, width=2 * K, joint='curve')
    if edge:
        d.line(s(edge), fill=STEEL_HI, width=3 * K, joint='curve')


def grip(d, a, b):
    line(d, [a, b], 10, WRAP)


def bow(d):
    limb = [(-8, -190), (-30, -165), (-40, -110), (-24, -50), (0, 0), (-24, 55), (-42, 115), (-32, 170), (-10, 196)]
    d.line(s([limb[0], limb[-1]]), fill=(214, 205, 180), width=2 * K)
    line(d, limb, 9, WOOD, WOOD_HI)
    grip(d, (-3, -14), (-3, 18))


def axe(d):
    line(d, [(30, -34), (-105, 190)], 10, WOOD, WOOD_HI)
    grip(d, (10, -2), (-12, 34))
    poly(d, [(-72, 135), (-122, 118), (-140, 150), (-134, 196), (-92, 214), (-96, 178), (-90, 165)], STEEL,
         [(-122, 118), (-140, 150), (-134, 196), (-92, 214)])


def mace(d):
    line(d, [(26, -30), (-76, 140)], 10, WOOD, WOOD_HI)
    grip(d, (10, -2), (-12, 34))
    for dx, dy in ((-30, -6), (22, 24), (-24, 28), (14, -26)):
        poly(d, [(-80 + dx, 148 + dy), (-86, 140), (-72, 156)], STEEL)
    d.ellipse(s([(-105, 125), (-59, 171)]), fill=STEEL, outline=DARK, width=2 * K)
    d.ellipse(s([(-97, 132), (-80, 148)]), fill=STEEL_HI)


def spear(d):
    line(d, [(48, -300), (-62, 330)], 8, WOOD, WOOD_HI)
    poly(d, [(48, -300), (35, -318), (60, -385), (66, -314)], STEEL, [(35, -318), (60, -385)])
    grip(d, (3, -18), (-4, 22))


def dagger(d):
    line(d, [(20, -26), (-8, 14)], 9, WRAP)
    line(d, [(-22, -2), (10, 22)], 7, (150, 122, 70))
    poly(d, [(-16, 10), (0, 22), (-46, 96)], STEEL, [(-16, 10), (-46, 96)])


for name, draw in (('bow', bow), ('axe', axe), ('mace', mace), ('spear', spear), ('dagger', dagger)):
    im = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0))
    draw(ImageDraw.Draw(im))
    im = im.resize((W, H), Image.LANCZOS).filter(ImageFilter.SMOOTH)
    box = im.getbbox()
    im.crop(box).save(OUT / f'warrior-weapon-{name}.png', optimize=True)
    x0, y0, x1, y1 = box
    print(f"{name} x:{x0 / W * 100:.2f} y:{y0 / H * 100:.2f} w:{(x1 - x0) / W * 100:.2f} h:{(y1 - y0) / H * 100:.2f}")
