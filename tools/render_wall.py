#!/usr/bin/env python3
"""Renders Glass Palette's own stage image: six thick glass slabs shaped like stadiums, stood in a row on black so
each one hides part of the one behind it. Each slab is frosted: its fill runs from a pale neutral crown through a
saturated colour to black at the foot, and whatever sits behind it shows through blurred. The rims are bevelled
glass lit by two soft lights, the slab's thickness shows as a second edge a little up and to the left, and the whole
frame gets a touch of lens fringing, bloom and film grain so it reads as a photograph rather than a vector drawing.

Output assets/wall.webp (1800 x 928, teal base hue 186 degrees so runtime.js's hue-rotate maths holds).

    python tools/render_wall.py            # writes assets/wall.webp
    python tools/render_wall.py --preview  # also writes a PNG next to it for a look

Everything here is ours: no photograph, no third-party render, no sampled pixels. Same seed, same bytes."""
import argparse, os
import numpy as np
from PIL import Image

W, H = 1800, 928
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets")
F = np.float32


# ---------------------------------------------------------------- small helpers

def hsv(h, s, v):
    """one colour from hue in degrees, saturation and value, as an RGB triple in 0..1"""
    h = (h % 360) / 60.0; c = v * s; x = c * (1 - abs(h % 2 - 1)); m = v - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h) % 6]
    return np.array([r + m, g + m, b + m], dtype=F)

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def _box(a, r, axis):
    """running mean of width 2r+1 along one axis, edges held"""
    pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(F)

def blur(a, sigma):
    """gaussian blur approximated by three box passes each way (numpy only, so it is exact and repeatable)"""
    r = max(1, int(round((np.sqrt(4 * sigma * sigma + 1) - 1) / 2)))
    for axis in (0, 1):
        for _ in range(3): a = _box(a, r, axis)
    return a

def stadium(px, py, hw, hh):
    """signed distance to an upright stadium centred on the origin (negative inside), plus its outward normal"""
    r = hw
    qx = np.abs(px); qy = np.maximum(np.abs(py) - (hh - r), 0)
    ln = np.sqrt(qx * qx + qy * qy) + 1e-6
    return ln - r, np.sign(px) * qx / ln, np.sign(py) * qy / ln

def soft_field(rng, u, v, n=5, scale=1.0):
    """a slow, smooth wobble built from a few random sine waves; used to bend the colour bands so no two
    capsules share a straight horizontal edge"""
    f = np.zeros_like(u)
    for _ in range(n):
        kx, ky = rng.uniform(0.6, 2.2, 2) * scale
        ph = rng.uniform(0, 2 * np.pi)
        f += np.sin(kx * u * np.pi + ky * v * np.pi + ph)
    return f / n


# ---------------------------------------------------------------- the render

def render(base_hue=186.0, seed=7):
    rng = np.random.default_rng(seed)
    glint_rng = np.random.default_rng(seed + 1000)
    yy, xx = np.mgrid[0:H, 0:W].astype(F)
    img = np.zeros((H, W, 3), dtype=F) + np.array([3, 4, 6], dtype=F) / 255.0   # near black ground, a hair cool

    n, cap_w, cap_h = 6, 330, 744
    step = 258                                          # 72 px of each capsule sits behind the next
    x0 = (W - (step * (n - 1) + cap_w)) / 2 + cap_w / 2  # centre of the first capsule
    cy = H / 2 + 6
    hw, hh = cap_w / 2, cap_h / 2

    # Crowns and rims are exactly neutral on purpose. The stage hue-rotates the whole image to the song, and any
    # colour bias in the white parts rotates with it: a warm cream turns mint under a violet song and lavender under
    # a gold one. So "warm" and "cool" crowns differ only in brightness and contrast, never in chroma.
    cream = np.array([0.84, 0.84, 0.84], dtype=F)       # the milky crown, neutral white
    rim_tint = np.array([1.0, 1.0, 1.0], dtype=F)       # glass edges, neutral

    # per capsule: hue offset, where the crown ends, where the foot starts, crown warmth (-1 cool .. +1 warm, which
    # only means dimmer and softer .. brighter and crisper),
    # tilt of the colour bands, and how much colour the middle holds
    # (the offsets lean 3 degrees cool of v2 so the measured hue of the whole image still lands on 186)
    specs = [(-9, 0.28, 0.62, -0.2, 0.10, 1.00),
             (-1, 0.34, 0.66, +0.3, -0.06, 0.85),
             (-5, 0.40, 0.60, +0.7, 0.04, 0.70),
             (+3, 0.30, 0.70, -0.6, -0.08, 0.95),
             (-3, 0.36, 0.64, 0.0, 0.08, 0.90),
             (+5, 0.42, 0.58, +0.5, -0.04, 0.80)]

    # two soft lights, in image space (x right, y down, z toward the viewer): a broad key above and to the right,
    # a dimmer fill from the low left
    def unit(v): v = np.array(v, dtype=F); return v / np.linalg.norm(v)
    key_h = unit(unit([0.35, -0.85, 0.45]) + unit([0, 0, 1]))     # half vectors for Blinn specular
    fill_h = unit(unit([-0.85, 0.35, 0.40]) + unit([0, 0, 1]))

    for i in range(n):                                  # paint left to right: each capsule stands in front of the last
        dh, t1, t2, warmth, tilt, body = specs[i]
        cx = x0 + i * step
        # the slab's back face: nudged up and to the left, and a touch smaller, which gives the thickness and a
        # slight perspective (the outer slabs show a little more of their side)
        off_x = -13.0 - 4.0 * abs(i - 2.5) / 2.5
        off_y = -6.0
        shrink = 0.988

        # work in a box around this capsule only
        bx0, bx1 = int(cx - hw - 30), int(cx + hw + 30)
        by0, by1 = int(cy - hh - 30), int(cy + hh + 30)
        X = xx[by0:by1, bx0:bx1] - cx; Y = yy[by0:by1, bx0:bx1] - cy
        region = img[by0:by1, bx0:bx1]

        d_f, nx, ny = stadium(X, Y, hw, hh)                                     # front face
        d_b, _, _ = stadium((X - off_x) / shrink, (Y - off_y) / shrink, hw, hh)
        d_b = d_b * shrink                                                       # back face
        d_s = d_f.copy()                                                         # whole slab: sweep front to back
        for k in range(1, 13):
            t = k / 12
            s = 1 + (shrink - 1) * t
            dk, _, _ = stadium((X - off_x * t) / s, (Y - off_y * t) / s, hw, hh)
            d_s = np.minimum(d_s, dk * s)

        a_front = np.clip(0.5 - d_f, 0, 1)
        a_slab = np.clip(0.5 - d_s, 0, 1)

        # what is behind, seen through frosted glass: heavily blurred and dimmed
        behind = blur(region.copy(), 16)
        behind_sharp = blur(region.copy(), 2)          # edges behind still read as lines through the glass

        # --- the frosted fill
        u = X / hw                                     # -1 left edge .. +1 right edge
        v = (Y + hh) / cap_h                           # 0 top .. 1 foot
        wob = soft_field(rng, u, v, 5, 0.9) * 0.05
        vb = v + tilt * u + wob                        # bent band coordinate
        main = hsv(base_hue + dh, 0.80, 0.58 * body + 0.10)
        deep = hsv(base_hue + dh + 12, 0.85, 0.20)
        crown = cream * (1 + 0.07 * warmth)

        spread = 0.21 - 0.04 * warmth                                   # warm crowns end a little more crisply
        k_crown = smoothstep(t1 + spread, t1 - spread - 0.01, vb)                 # 1 at the top, gone below the crown
        k_deep = smoothstep(t2 - 0.12, t2 + 0.10, vb)                  # colour sinks into deep colour
        k_black = smoothstep(t2 - 0.02, t2 + 0.30, vb)                 # then to black at the foot
        # the colour hugs one side a little more than the other, like light coming through at an angle
        side = 0.82 + 0.18 * np.clip(-u * np.sign(tilt + 1e-3), -1, 1)
        fill = main[None, None] * side[..., None]
        fill = fill * (1 - k_deep[..., None]) + deep * k_deep[..., None]
        fill = fill * (1 - k_black[..., None]) + np.array([0.008, 0.010, 0.014], dtype=F) * k_black[..., None]
        fill = fill * (1 - k_crown[..., None]) + crown * (0.70 + 0.26 * np.clip(1 - v / (t1 + 0.2), 0, 1))[..., None] * k_crown[..., None]
        # a wide soft glow where the key light passes through the glass: brighter right of centre in the crown
        glow = np.exp(-((u - 0.25) ** 2) / (2 * 0.45 ** 2)) * np.exp(-((v - 0.18) ** 2) / (2 * 0.22 ** 2))
        fill += (glow * 0.05)[..., None] * rim_tint
        # frosting is never perfectly even: a slow, faint unevenness in brightness, mostly felt in the pale crown
        mottle = soft_field(rng, u * 1.7, v * 2.3, 6, 1.0)
        fill *= (1 + 0.05 * mottle * (0.4 + 0.6 * k_crown))[..., None]
        # thick glass bends the light near its sides: a soft darker lens band a little way in from the rim
        lens = np.exp(-((d_f + 42) / 20.0) ** 2) * (0.35 + 0.65 * smoothstep(0.2, 0.7, v))
        fill *= (1 - 0.22 * lens)[..., None]
        # glass gathers light at its edges: a soft brighter band just inside the rim, strongest in the crown
        pipe = np.exp(d_f / 14.0) * (d_f < 0)
        fill += (pipe * (0.05 + 0.10 * (1 - v)))[..., None] * (crown * 0.6 + fill * 0.6)
        # the frosting lets the scene behind through, more in the dark foot where the fill has less of its own light
        trans = 0.22 + 0.30 * k_black
        fill = fill * (1 - 0.35 * trans[..., None]) + (behind * 0.55 + behind_sharp * 0.45) * trans[..., None]
        # the back edge of the slab, seen softly through the frosted face
        ghost = np.exp(-(d_b / 9.0) ** 2) * (d_f < -4)
        fill += (ghost * 0.10)[..., None] * rim_tint

        # glass never catches light evenly all the way round: a slow random field along the rim breaks the
        # highlights into brighter runs and darker gaps (its own random stream, so the rest matches v2 exactly)
        glint = np.clip(0.55 + 1.5 * soft_field(glint_rng, X / 95.0, Y / 95.0, 4, 1.0), 0.10, 1.7)

        # --- the side of the slab (visible between the back edge and the front edge)
        side_a = np.clip(a_slab - a_front, 0, 1)
        facing = np.clip(-(nx * off_x + ny * off_y) / np.hypot(off_x, off_y), 0, 1)   # how squarely the side faces us
        back_line = np.exp(-(d_b / 1.6) ** 2)
        front_line = np.exp(-(np.maximum(d_f, 0) / 1.8) ** 2)
        side_col = behind_sharp * 0.40 + rim_tint * (0.12 + 0.30 * facing)[..., None]
        side_col += rim_tint * (back_line * (0.70 + 0.50 * facing) * (0.55 + 0.45 * glint) + front_line * 0.45)[..., None]

        # --- the bevelled front rim: a rounded edge whose normal tips outward toward the silhouette
        bw = 9.0
        s = np.clip(-d_f / bw, 0, 1)                   # 0 at the outer edge .. 1 where the bevel meets the face
        rgb_rim = []
        for shift in (0.35, 0.0, -0.35):                 # red, green, blue each see the edge a hair apart: fringing
            ss = np.clip((-d_f + shift) / bw, 0, 1)
            th = (1 - ss) ** 1.3 * 1.45                # tilt angle of the bevel surface
            nz = np.cos(th); sx = np.sin(th) * nx; sy = np.sin(th) * ny
            spec_k = np.clip(sx * key_h[0] + sy * key_h[1] + nz * key_h[2], 0, 1) ** 90
            spec_f = np.clip(sx * fill_h[0] + sy * fill_h[1] + nz * fill_h[2], 0, 1) ** 40
            fres = (1 - nz) ** 2
            val = 0.16 * (0.6 + 0.4 * glint) + (2.0 * spec_k + 0.85 * spec_f) * glint + 0.70 * fres
            val += 0.50 * glint * np.exp(-(ss / 0.14) ** 2)          # the very edge of the glass catches light
            val *= 1 - 0.20 * np.exp(-((ss - 0.78) / 0.10) ** 2)     # the dark line where the bevel turns into the face
            rgb_rim.append(val)
        rim = np.stack(rgb_rim, -1) * rim_tint
        rim_a = (s < 1) * a_front
        rim_a = np.clip(rim_a * (1 - smoothstep(0.85, 1.0, s)), 0, 1)

        # --- composite: side first, then the face, then the rim over the face's edge
        out = region * (1 - side_a[..., None]) + side_col * side_a[..., None]
        out = out * (1 - a_front[..., None]) + fill * a_front[..., None]
        out = out * (1 - rim_a[..., None]) + (rim + fill * 0.15) * rim_a[..., None]
        img[by0:by1, bx0:bx1] = out

    # a whisper of the colour spilling onto the black under the row, so the slabs feel lit rather than pasted on
    spill = np.exp(-(((xx - W / 2) / (W * 0.40)) ** 2 + ((yy - (cy + hh)) / 60.0) ** 2))
    img += hsv(base_hue, 0.7, 1.0) * (spill * 0.025)[..., None]

    # photographic finishing: bloom on the brights, a gentle lens fringe toward the corners, then grain
    bright = np.clip(img - 0.62, 0, None)
    img += blur(bright, 8) * 0.22 + blur(bright, 30) * 0.16
    img = lens_fringe(img, 0.0011)
    lum = img.mean(-1, keepdims=True)
    grain = rng.standard_normal((H, W, 1)).astype(F) * 0.009 + rng.standard_normal((H, W, 3)).astype(F) * 0.003
    img += grain * (0.6 + 0.8 * np.sqrt(np.clip(lum, 0, 1)))
    img = np.clip(img, 0, 1)
    img = img ** (1 / 1.04)                          # the tiniest lift, like a print curve
    return Image.fromarray((img * 255 + 0.5).astype(np.uint8))

def lens_fringe(img, k):
    """lateral chromatic aberration: red is scaled out from the centre a fraction, blue in, so bright edges carry
    a faint warm and cool fringe that grows toward the corners"""
    out = img.copy()
    for ch, scale in ((0, 1 + k), (2, 1 - k)):
        ys = (np.arange(H, dtype=F) - H / 2) / scale + H / 2
        xs = (np.arange(W, dtype=F) - W / 2) / scale + W / 2
        y0 = np.clip(np.floor(ys).astype(int), 0, H - 2); fy = (ys - y0)[:, None]
        x0 = np.clip(np.floor(xs).astype(int), 0, W - 2); fx = (xs - x0)[None, :]
        c = img[..., ch]
        top = c[y0][:, x0] * (1 - fx) + c[y0][:, x0 + 1] * fx
        bot = c[y0 + 1][:, x0] * (1 - fx) + c[y0 + 1][:, x0 + 1] * fx
        out[..., ch] = top * (1 - fy) + bot * fy
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--preview", action="store_true"); ap.add_argument("--out", default=os.path.join(OUT, "wall.webp"))
    a = ap.parse_args()
    im = render()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    # Quality 74. This image is embedded as base64 inside the theme, so every KB counts, and WebP has a sharp size
    # cliff just above here. The stage hue-rotates it to the song, saturates it, feathers its edges and sits text
    # over it, so the small loss is never seen straight. Re-render with --preview and look before changing this.
    im.save(a.out, "WEBP", quality=74, method=6)
    if a.preview: im.save(os.path.splitext(a.out)[0] + "-preview.png")
    print("wrote", a.out, os.path.getsize(a.out) // 1024, "KB")
