#!/usr/bin/env python3
"""Glass Palette: prove the theme you are about to install is the source you just read.

    python tools/verify.py

The files a Spicetify or Marketplace install actually loads are the three in dist/GlassPalette/. They are committed,
so nobody has to run a build to use the theme, which also means nobody can see at a glance whether they match src/.
This rebuilds from src/ into a scratch directory and compares the result byte for byte. A PASS means the shipped
files contain nothing that is not in the source tree: no extra line, no different image, no injected anything.

It needs only the Python standard library, no network, and it writes nothing outside a temporary directory.

Exit code 0 on PASS, 1 on FAIL, so CI can gate on it.
"""
import hashlib
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FILES = ("user.css", "theme.js", "color.ini")


def sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def main():
    shipped = os.path.join(ROOT, "dist", "GlassPalette")
    missing = [f for f in FILES if not os.path.exists(os.path.join(shipped, f))]
    if missing:
        print("FAIL: dist/GlassPalette is missing", ", ".join(missing))
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        # --public is what a release is built with: our own rendered wallpaper, never a local personal crop.
        r = subprocess.run([sys.executable, os.path.join(ROOT, "build.py"), "--public", "--out", tmp],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("FAIL: the build did not run\n" + (r.stderr or r.stdout))
            return 1

        print("Rebuilt from src/ and compared to the committed dist/GlassPalette:\n")
        ok = True
        for f in FILES:
            a, b = os.path.join(shipped, f), os.path.join(tmp, f)
            if not os.path.exists(b):
                print(f"  {f:10} FAIL  the build did not produce this file")
                ok = False
                continue
            ha, hb = sha(a), sha(b)
            same = ha == hb
            ok &= same
            size = os.path.getsize(a)
            print(f"  {f:10} {'match' if same else 'DIFFERS'}  {size:>9,} bytes  sha256 {ha}")
            if not same:
                print(f"  {'':10}          rebuilt is {os.path.getsize(b):,} bytes, sha256 {hb}")

    print()
    if ok:
        print("PASS. Every shipped file is exactly what src/ produces.")
        print("Nothing in the files you install comes from anywhere but this repository.")
        return 0
    print("FAIL. A shipped file does not match the source.")
    print("Do not trust dist/ until this passes. Rebuild with `python build.py --public` and check the diff.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
