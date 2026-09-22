#!/usr/bin/env python3
"""Glass Palette: after a Spotify update, find out which of the theme's hooks into Spotify still exist.

    python tools/compat.py                 find Spotify's app files, compare against the saved baseline
    python tools/compat.py --baseline      save today's result as the known-good baseline
    python tools/compat.py --xpui DIR      point it at Spotify's xpui folder yourself

The theme styles Spotify's own class names ("main-nowPlayingBar-right", "Root__main-view"), its data-testid
attributes and a few of its CSS variables ("--lyrics-color-active"). Spotify renames or drops some of these in
updates, and the theme then silently stops styling that part of the app. Spicetify unpacks Spotify's interface
into a folder of CSS and JavaScript (xpui), so this checks every hook the theme uses against those files directly:
no login, no network, and nothing on screen changes.

Some hooks are absent even on a good day (styles kept for older Spotify builds, or for views that load their code
separately), so the check is a comparison with a baseline taken on a known-good day. It only fails when a hook
that WAS in Spotify has gone, which is what an update breaking the theme looks like.

Writes tools/compat-baseline.json (--baseline) and prints the Spotify version it checked. Exit code 0 when nothing
known-good has gone, 1 when something has, 2 when Spotify's files could not be found.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist", "GlassPalette")
BASELINE = os.path.join(ROOT, "tools", "compat-baseline.json")
OURS = re.compile(r"^(office-glass|og-|og$)")          # classes the theme makes itself, not hooks into Spotify

XPUI_CANDIDATES = [
    "/Applications/Spotify.app/Contents/Resources/Apps/xpui",
    os.path.expanduser("~/Applications/Spotify.app/Contents/Resources/Apps/xpui"),
    os.path.expandvars(r"%APPDATA%\Spotify\Apps\xpui"),
    "/usr/share/spotify/Apps/xpui",
    "/opt/spotify/Apps/xpui",
    os.path.expanduser("~/.local/share/flatpak/app/com.spotify.Client/x86_64/stable/active/files/extra/share/spotify/Apps/xpui"),
    "/var/lib/flatpak/app/com.spotify.Client/x86_64/stable/active/files/extra/share/spotify/Apps/xpui",
]


def hooks():
    """Every class, data-testid and Spotify CSS variable the shipped theme refers to."""
    css = open(os.path.join(DIST, "user.css"), encoding="utf-8").read()
    js = open(os.path.join(DIST, "theme.js"), encoding="utf-8").read()
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r'url\("data:[^"]*"\)', "", css)                         # the embedded images and fonts
    # selectors only: the text before each "{", which is where class names are hooks rather than values
    selectors = " ".join(re.findall(r"([^{}]+)\{", css))
    found = {}
    for c in re.findall(r"\.(-?[A-Za-z_][\w-]*)", selectors):
        if not OURS.match(c):
            found["class " + c] = c
    for t in re.findall(r"""data-testid\s*[\^*$|~]?=\s*["']?([\w-]+)""", selectors + js):
        found["testid " + t] = t
    for v in re.findall(r"--(cinema-mode-[\w-]+|lyrics-color-[\w-]+)", selectors + js):
        found["var --" + v] = "--" + v
    for c in re.findall(r"""querySelector(?:All)?\(\s*['"]([^'"]+)['"]""", js):
        for k in re.findall(r"\.(-?[A-Za-z_][\w-]*)", c):
            if not OURS.match(k):
                found["class " + k] = k
    return dict(sorted(found.items()))


def spotify_text(xpui):
    parts = []
    for f in glob.glob(os.path.join(xpui, "**", "*"), recursive=True):
        if f.endswith((".css", ".js")) and os.path.isfile(f):
            rel = os.path.relpath(f, xpui).replace(os.sep, "/")
            # Spotify's own files only: Spicetify copies the theme (user.css, extensions/theme.js), every installed
            # extension and its own helpers into this folder, and any of those naming a class would make it look alive
            if rel in ("user.css", "colors.css") or rel.startswith(("extensions/", "helper/", "spicetify-routes")):
                continue
            with open(f, encoding="utf-8", errors="replace") as fh:
                parts.append(fh.read())
    return "\n".join(parts)


def spotify_version(xpui):
    import plistlib
    plist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(xpui))), "Info.plist")   # macOS app bundle
    if os.path.exists(plist):
        try:
            with open(plist, "rb") as fh:
                return plistlib.load(fh).get("CFBundleShortVersionString", "unknown")
        except Exception:
            pass
    for name in ("prefs",):                                              # Linux and Windows: Spotify notes it in prefs
        for p in (os.path.expanduser("~/.config/spotify/prefs"), os.path.expandvars(r"%APPDATA%\Spotify\prefs")):
            if os.path.exists(p):
                m = re.search(r'app\.last-launched-version="([^"]+)"', open(p, encoding="utf-8", errors="replace").read())
                if m:
                    return m.group(1)
    return "unknown"


def main():
    args = sys.argv[1:]
    xpui = args[args.index("--xpui") + 1] if "--xpui" in args else next((p for p in XPUI_CANDIDATES if os.path.isdir(p)), None)
    if not xpui or not os.path.isdir(xpui):
        print("Could not find Spotify's xpui folder. Run `spicetify apply` first, or pass --xpui DIR.")
        return 2
    text = spotify_text(xpui)
    if len(text) < 100000:
        print(f"{xpui} holds almost no CSS or JavaScript. Spicetify has not unpacked Spotify here; run `spicetify apply`.")
        return 2
    h = hooks()
    present = {k: (v in text) for k, v in h.items()}
    version = spotify_version(xpui)
    alive = sorted(k for k, ok in present.items() if ok)
    absent = sorted(k for k, ok in present.items() if not ok)

    if "--baseline" in args:
        with open(BASELINE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"spotify": version, "alive": alive}, fh, indent=0)
            fh.write("\n")
        print(f"Baseline saved: Spotify {version}, {len(alive)} of {len(h)} hooks present ({len(absent)} absent already).")
        return 0

    if not os.path.exists(BASELINE):
        print("No baseline yet. On a day the theme looks right, run: python tools/compat.py --baseline")
        return 2
    base = json.load(open(BASELINE, encoding="utf-8"))
    gone = [k for k in base["alive"] if k in present and not present[k]]
    new = [k for k in h if k not in set(base["alive"]) | set(absent)]
    print(f"Spotify {version} (baseline {base['spotify']}): {len(alive)} of {len(h)} hooks present.")
    for k in gone:
        print(f"GONE  {k}")
    if new:
        print(f"{len(new)} hooks added since the baseline are present: " + ", ".join(new[:8]) + (" ..." if len(new) > 8 else ""))
    print("FAIL: Spotify dropped hooks the theme relies on." if gone else "PASS: every hook that worked at the baseline is still in Spotify.")
    return 1 if gone else 0


if __name__ == "__main__":
    sys.exit(main())
