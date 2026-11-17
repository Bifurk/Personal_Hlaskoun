#!/usr/bin/env python3
"""Převod vygenerovaných obrázků do aplikace: img/pics/SLOVO.webp (512×512, průhledné pozadí).

  python3 -I tools/obrazky/prevod.py <složka s PNG> [<výstupní složka>]

- odstraní poloprůhledné pozadí (šachovnici, kterou generátory kreslí místo průhlednosti),
- ponechá jen hlavní objekt (odstraní kousky sousedních obrázků na okrajích),
- ořízne, vycentruje do čtverce s okrajem 8 % a zmenší/zvětší na 512 px.
"""
import os, sys, unicodedata
from collections import deque
import numpy as np
from PIL import Image

SIZE, MARGIN, ALPHA_MIN = 512, 0.08, 64


def components(mask):
    h, w = mask.shape; lab = np.zeros((h, w), np.int32); n = 0; sizes = {}
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; q = deque([(y0, x0)]); lab[y0, x0] = n; cnt = 0
        while q:
            y, x = q.popleft(); cnt += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; q.append((yy, xx))
        sizes[n] = cnt
    return lab, sizes


def convert(src, dst):
    im = np.array(Image.open(src).convert("RGBA"))
    a = im[..., 3].astype(np.int32)
    a[a < ALPHA_MIN] = 0                                       # šachovnice / poloprůhledný šum pryč
    lab, sizes = components(a > 0)
    if not sizes: raise SystemExit("prázdný obrázek: " + src)
    big = max(sizes.values()); h, w = a.shape
    keep = np.zeros_like(a, bool)
    for k, s in sizes.items():
        ys, xs = np.nonzero(lab == k)
        touches = ys.min() == 0 or xs.min() == 0 or ys.max() == h - 1 or xs.max() == w - 1
        # ponechat hlavní objekt a jeho větší části; malé kusy na okraji (sousední obrázky) a drobný šum zahodit
        if s == big or (s >= big * 0.04 and not (touches and s < big * 0.25)):
            keep |= lab == k
    im[..., 3] = np.where(keep, a, 0)
    out = Image.fromarray(im)
    out = out.crop(out.getchannel("A").getbbox())
    side = int(max(out.size) / (1 - 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(out, ((side - out.width) // 2, (side - out.height) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    canvas.save(dst, "WEBP", quality=88, method=6)


def main():
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "../../img/pics")
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.lower().endswith(".png"): continue
        name = unicodedata.normalize("NFC", os.path.splitext(f)[0]).upper()
        convert(os.path.join(src, f), os.path.join(dst, name + ".webp"))
        print(name)


if __name__ == "__main__":
    main()
