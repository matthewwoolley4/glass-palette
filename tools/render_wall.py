#!/usr/bin/env python3
"""Renders Glass Palette's own stage image: six frosted glass capsules on black, each holding a colour that saturates
through its middle, cream at the crown, black at the foot, a chrome rim lit from the top right, faint refraction streaks
and film grain. Output assets/wall.webp (1800 x 928, teal base hue 186 degrees so runtime.js's hue-rotate maths holds).

    python tools/render_wall.py            # writes assets/wall.webp
    python tools/render_wall.py --preview  # also writes a PNG next to it for a look

Everything here is ours: no photograph, no third-party render."""
import argparse, math, os
import numpy as np
from PIL import Image, ImageFilter

W, H = 1800, 928
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets")

def hsv(h, s, v):
    h = (h % 360) / 60.0; c = v * s; x = c * (1 - abs(h % 2 - 1)); m = v - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h) % 6]
    return np.array([r + m, g + m, b + m])

def capsule_mask(w, h, r):
    """anti-aliased rounded-rectangle (stadium) mask, values 0..1"""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = np.clip(xx, r, w - 1 - r); cy = np.clip(yy, r, h - 1 - r)
    d = np.hypot(xx - cx, yy - cy)
    return np.clip(r - d + 0.5, 0, 1)

def render(base_hue=186.0, seed=7):
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), dtype=np.float32) + np.array([4, 6, 8]) / 255.0   # the ground, sampled to match the theme
    cap_w, cap_h, r = 262, 700, 131
    n = 6; step = 236; x0 = (W - (step * (n - 1) + cap_w)) // 2; ytop = (H - cap_h) // 2 + 8
    # each capsule: its own hue offset, where its colour sits, how milky its crown is (studied from the wallpaper)
    specs = [(-14, 0.60, 0.97), (-6, 0.66, 0.90), (0, 0.56, 0.86), (4, 0.63, 0.92), (10, 0.54, 0.96), (16, 0.68, 0.99)]
    cream = np.array([238, 232, 222]) / 255.0
    yy = np.linspace(0, 1, cap_h)[:, None]
    xx = np.linspace(0, 1, cap_w)[None, :]
    mask = capsule_mask(cap_w, cap_h, r)
    # soft shadows on the ground first (painting them after a capsule drew a line across its crown)
    for i in range(n):
        sh = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(30))
        sh = np.asarray(sh).astype(np.float32) / 255.0 * 0.6
        x = x0 + i * step; ys = ytop + 40
        tgt = img[ys:ys + cap_h, x:x + cap_w]; tgt *= (1 - sh[:tgt.shape[0], :tgt.shape[1], None])
    # draw back to front: the leftmost sits in front, so paint from the right
    for i in reversed(range(n)):
        dh, band, milk = specs[i]
        col = hsv(base_hue + dh, 0.80, 1.0)
        # vertical body: cream crown -> colour band -> deep colour -> black foot
        t = yy[..., None]                                                          # (h, 1, 1) so colours broadcast to (h, w, 3)
        body = np.zeros((cap_h, cap_w, 3), dtype=np.float32)
        k_cream = np.clip(1 - (t / (band * 0.82)), 0, 1) ** 1.15 * milk             # crown milk: near white at the top, gone by the band
        k_col = np.exp(-((t - band) ** 2) / (2 * 0.13 ** 2))                        # the colour, brightest at the band
        k_dark = np.clip((t - band - 0.06) / 0.24, 0, 1) ** 1.2                      # the foot goes to black
        base = col * (0.42 + 0.58 * k_col)
        body[:] = base * (1 - k_cream) + (cream * 0.92 + col * 0.08) * k_cream
        body *= (1 - 0.97 * k_dark)
        # horizontal shading: darker edges, a bright vertical highlight left of centre, a faint one on the right
        edge = 1 - 0.28 * (np.abs(xx - 0.5) * 2) ** 2.2
        hi = 0.22 * np.exp(-((xx - 0.34) ** 2) / (2 * 0.06 ** 2)) + 0.08 * np.exp(-((xx - 0.80) ** 2) / (2 * 0.03 ** 2))
        body *= edge[..., None]; body += (hi[..., None] * (0.6 + 0.4 * (1 - k_dark)))
        # refraction streaks: a few soft vertical lines
        streak = np.zeros((1, cap_w), dtype=np.float32)
        for sx in rng.uniform(0.12, 0.88, 5): streak += 0.05 * np.exp(-((xx - sx) ** 2) / (2 * 0.006 ** 2))
        body += streak[..., None] * (1 - k_dark) * 0.8
        # chrome rim: bright ring with a dark bevel just inside, lit from the top right
        inner = capsule_mask(cap_w - 18, cap_h - 18, r - 9); ring = np.zeros_like(mask); ring[9:-9, 9:-9] = inner
        rim = np.clip(mask - ring, 0, 1)
        bevel_in = np.zeros_like(mask); b2 = capsule_mask(cap_w - 24, cap_h - 24, r - 12); bevel_in[12:-12, 12:-12] = b2
        bevel = np.clip(ring - bevel_in, 0, 1)
        light = 0.42 + 0.58 * np.clip((xx * 0.7 + (1 - yy) * 0.7) - 0.15, 0, 1) + 0.35 * np.exp(-((xx - 0.02) ** 2) / (2 * 0.02 ** 2)) * (1 - yy) ** 0.5   # lit top right, a specular down the left edge
        rim_col = (np.array([1.0, 0.98, 0.94]) * light[..., None])
        body = body * (1 - rim[..., None]) + rim_col * rim[..., None]
        body = body * (1 - 0.70 * bevel[..., None])
        # the glass is not fully opaque: the capsule behind shows a little through the crown
        alpha = mask * (0.86 + 0.14 * k_dark[:, :, 0])
        x = x0 + i * step
        region = img[ytop:ytop + cap_h, x:x + cap_w]
        img[ytop:ytop + cap_h, x:x + cap_w] = region * (1 - alpha[..., None]) + body * alpha[..., None]
    # a faint coloured haze above the row, like light spilling on the black
    yy2, xx2 = np.mgrid[0:H, 0:W].astype(np.float32)
    haze = np.exp(-(((xx2 - W / 2) / (W * 0.32)) ** 2 + ((yy2 - H * 0.42) / (H * 0.30)) ** 2))
    img += hsv(base_hue, 0.6, 1.0) * haze[..., None] * 0.035
    # film grain
    img += (rng.standard_normal((H, W, 1)) * 0.012)
    img = np.clip(img, 0, 1)
    return Image.fromarray((img * 255 + 0.5).astype(np.uint8))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--preview", action="store_true"); ap.add_argument("--out", default=os.path.join(OUT, "wall.webp"))
    a = ap.parse_args()
    im = render()
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    # Quality 74, not 86. This image is embedded as base64 inside the theme, where it was 64% of everything shipped,
    # and WebP has a sharp size cliff just here: 86 costs 125 KB, 78 costs 77 KB, 74 costs 35 KB. The picture barely
    # moves across that cliff (mean absolute difference 1.9 of 255 per channel against the 86 render) and it is never
    # seen straight: the stage hue-rotates it to the song, saturates it, feathers its edges away and sits text over
    # it. Going below 74 saves little and starts to band. Re-render with --preview and look before changing this.
    im.save(a.out, "WEBP", quality=74, method=6)
    if a.preview: im.save(os.path.splitext(a.out)[0] + "-preview.png")
    print("wrote", a.out, os.path.getsize(a.out) // 1024, "KB")
