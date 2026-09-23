#!/usr/bin/env python3
# Glass Palette build: fonts/*.woff2 + src/*.css + src/runtime.js + color.ini
#   ->  dist/GlassPalette/{user.css, theme.js, color.ini}
# theme.js carries a fallback copy because the Marketplace app can strip a local theme's user.css link at runtime.
# The runtime injects it only when no live user.css link exists, so normal installs never paint two copies.
# The font is embedded (base64) so the theme is one self-contained folder: nothing to install, nothing to download.
import base64, io, json, os, shutil
here = os.path.dirname(os.path.abspath(__file__))
order = ["fullscreen.css", "app.css", "lyrics.css", "voices.css", "like.css", "details.css", "glasstext.css", "wall.css", "dock.css", "lists.css", "settings.css", "touch.css"]   # fullscreen first: it registers --gs / --gs2 and the base tokens
SCRIPTS = ["runtime.js", "settings.js", "touch.js", "lights.js"]   # settings.js owns stored preferences; touch.js owns finger behaviour; lights.js feeds the optional light server
FONTS = [  # (file, unicode-range) Manrope variable, weights 200 to 800
    ("manrope-latin-var.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"),
    ("manrope-latin-ext-var.woff2", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"),
]
faces = []
for name, rng in FONTS:
    path = os.path.join(here, "fonts", name)
    if not os.path.exists(path): print("font missing, skipped:", name); continue
    b64 = base64.b64encode(open(path, "rb").read()).decode("ascii")
    faces.append('@font-face { font-family: "Manrope"; font-style: normal; font-weight: 200 800; font-display: swap; '
                 'src: url("data:font/woff2;base64,%s") format("woff2"); unicode-range: %s; }' % (b64, rng))
# the stage image: assets/wall-raw.webp is a personal crop of the real wallpaper (not ours to ship, gitignored);
# assets/wall.webp is our own render (tools/render_wall.py) and is what the public build uses
import sys
wall = os.path.join(here, "assets", "wall-raw.webp")
personal = False
if "--public" in sys.argv or not os.path.exists(wall): wall = os.path.join(here, "assets", "wall.webp")   # --public: what gets committed and shipped
else: personal = True
wall_uri = "data:image/webp;base64," + base64.b64encode(open(wall, "rb").read()).decode("ascii") if os.path.exists(wall) else ""
css = "\n".join(faces) + "\n\n" + "\n\n".join(io.open(os.path.join(here, "src", f), encoding="utf-8").read() for f in order)
js = "\n\n".join(io.open(os.path.join(here, "src", f), encoding="utf-8").read() for f in SCRIPTS)
assert js.count("__CSS__") == 1
# --out lets tools/verify.py build into a scratch directory and compare, so anyone can confirm that the committed
# dist/ is exactly what this source produces without overwriting their copy of it.
out = os.path.join(here, "dist", "GlassPalette")
if "--out" in sys.argv: out = sys.argv[sys.argv.index("--out") + 1]
os.makedirs(out, exist_ok=True)
# The stage image is used twice (wall.css for the full-screen stage, lyrics.css for the page behind the words), and
# this stylesheet is itself carried a second time inside theme.js. Pasting the data URI at each use site therefore
# shipped the same image FOUR times: 665 KB, 64% of the entire theme. Declare it once and let both sites reference
# the custom property. Identical pixels, and the file stops being mostly one picture repeated.
assert "__WALL__" not in css, "a source file still pastes the wallpaper directly; use var(--og-wall)"
assert css.count("var(--og-wall)") == 3, "expected exactly the three wallpaper use sites (stage, lyrics, settings preview)"
if wall_uri: css = ':root { --og-wall: url("%s"); }\n\n' % wall_uri + css
# The credit line at the top of both shipped files, so a copy of just those files still says where it came from.
# The version is the one install-remote.sh pins, which tools/release.py sets before it runs this build.
import re
pinned = re.search(r'VERSION="(v[\d.]+)"', io.open(os.path.join(here, "install-remote.sh"), encoding="utf-8").read())
credit = "Glass Palette %sby matthewwoolley4, MIT licence, github.com/matthewwoolley4/glass-palette" % (pinned.group(1) + " " if pinned else "")
css = "/* %s */\n" % credit + css
io.open(os.path.join(out, "user.css"), "w", encoding="utf-8", newline="\n").write(css)
theme = "// %s\n" % credit + js.replace("__CSS__", json.dumps(css))
io.open(os.path.join(out, "theme.js"), "w", encoding="utf-8", newline="\n").write(theme)
shutil.copy(os.path.join(here, "color.ini"), os.path.join(out, "color.ini"))
# Report the size theme.js actually lands at, not the size of the source before the stylesheet is spliced into it.
# Printing len(js) here claimed 51 KB for a file that is really ten times that, which is the one number a reader
# would use to decide whether the shipped file matches the source they just read.
print("built dist/GlassPalette:", len(faces), "font faces,", len(css) // 1024, "KB css,",
      len(js) // 1024, "KB runtime source ->", len(theme) // 1024, "KB theme.js (it carries a copy of the css)")
# The plain build prefers the personal crop, and dist/ is a committed folder, so the two together are one careless
# `git add` away from publishing a wallpaper that is not ours to ship. Say so every single time.
if personal: print("  ^ built with assets/wall-raw.webp, the PERSONAL crop. Do NOT commit dist/ from this build.\n"
                   "    Run `python build.py --public` before committing or releasing.")
