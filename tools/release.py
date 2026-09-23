#!/usr/bin/env python3
"""Glass Palette: point every install at one tagged release, so a push to main is not a release.

    python tools/release.py v1.1.0

Everything people install from reads this version, and nothing reads main:
- manifest.json: the Marketplace uses a field that starts with https exactly as written, so user.css, color.ini and
  theme.js all point at jsdelivr pinned to the tag (@v1.1.0). The manifest itself is read from main, which is fine:
  it only says which release to load. (The preview image and README stay on main; they are only pictures and text.)
- install-remote.sh and install-remote.ps1: download that tag's archive instead of the main branch.
- extras/lights/install.sh and install.ps1: download that tag's light server.

It edits those three files and rebuilds dist/ with --public, then prints the commands that make it real. It does not
commit, tag or push: that stays a person's decision. One catch worth knowing: people who installed from the
Marketplace before the manifest was pinned keep the addresses it had then (main) until they reinstall.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "matthewwoolley4/glass-palette"
CDN = "https://cdn.jsdelivr.net/gh/" + REPO + "@{v}/dist/GlassPalette/{f}"


def edit(path, pattern, repl):
    p = os.path.join(ROOT, path)
    s = open(p, encoding="utf-8").read()
    n = re.subn(pattern, repl, s)
    if n[1] != 1:
        sys.exit(f"{path}: expected exactly one version line to change, found {n[1]}")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(n[0])


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"v\d+\.\d+\.\d+", sys.argv[1]):
        sys.exit("usage: python tools/release.py vMAJOR.MINOR.PATCH   (for example v1.1.0)")
    v = sys.argv[1]
    tags = subprocess.run(["git", "tag", "--list", v], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if tags:
        sys.exit(f"{v} already exists. Releases are never moved; pick the next version.")

    mp = os.path.join(ROOT, "manifest.json")
    m = json.load(open(mp, encoding="utf-8"))
    m[0]["usercss"] = CDN.format(v=v, f="user.css")
    m[0]["schemes"] = CDN.format(v=v, f="color.ini")
    m[0]["include"] = [CDN.format(v=v, f="theme.js")]
    with open(mp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(m, indent=2, ensure_ascii=False) + "\n")

    edit("install-remote.sh", r'VERSION="v\d+\.\d+\.\d+"', f'VERSION="{v}"')
    edit("install-remote.ps1", r'\$version = "v\d+\.\d+\.\d+"', f'$version = "{v}"')
    edit("extras/lights/install.sh", r'VERSION="v\d+\.\d+\.\d+"', f'VERSION="{v}"')
    edit("extras/lights/install.ps1", r'\$version = "v\d+\.\d+\.\d+"', f'$version = "{v}"')
    subprocess.run([sys.executable, os.path.join(ROOT, "build.py"), "--public"], cwd=ROOT, check=True)

    print(f"""
Pinned to {v}. Check it, then make it real:

  python tools/verify.py
  python tools/leakcheck.py
  git add -A && git commit -m "Release {v}"
  git tag {v}
  git push origin main {v}

Push main and the tag together: the manifest points at {v} from the moment main lands. After the push, the
install-test workflow runs on the tag against clean macOS and Linux machines.""")


if __name__ == "__main__":
    main()
