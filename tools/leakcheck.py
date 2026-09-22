#!/usr/bin/env python3
"""Glass Palette: fail before anything private reaches the public repository.

    python tools/leakcheck.py            every tracked file
    python tools/leakcheck.py --staged   only what is about to be committed (the pre-commit hook)

Three kinds of leak, all checked with the standard library and no network:

1. Secrets. API keys and tokens in the shapes the big providers issue them, private keys, and any line that assigns
   a long opaque string to something called a key, token, secret or password. The theme itself needs none of these:
   it uses the token Spotify already put in the page, and the optional light and keyboard services are addresses on
   your own machine, never keys.
2. Where you live on a network or a disk. Private LAN addresses (192.168.x, 10.x, 172.16 to 31.x), home directory
   paths with a user name in them, and email addresses other than GitHub's noreply form.
3. Your own words. A file named .leakcheck.local, which is gitignored and so never published, holds one term per
   line: your name, your room, your machine names. Any tracked text that contains one fails. The list stays on your
   machine; only the check is public.

It also refuses the private wallpaper outright (assets/wall-raw.webp, gitignored) and any image carrying EXIF or
XMP metadata, which is where a camera or a phone writes the device, the owner and the location.

Exit code 0 when clean, 1 when anything is found, so the pre-commit hook and CI can both gate on it.
Set the hook up once per clone:  git config core.hooksPath tools/hooks
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXT = re.compile(r"\.(css|js|json|md|py|sh|ps1|ini|txt|yml|yaml|html|svg)$|^\.gitignore$|^LICENSE$", re.I)
IMAGE = re.compile(r"\.(jpe?g|png|webp)$", re.I)

SECRETS = [
    ("AWS access key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("GitHub token", r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    ("OpenAI / Anthropic key", r"\bsk-(ant-)?[A-Za-z0-9_\-]{20,}\b"),
    ("Slack token", r"\bxox[abprs]-[A-Za-z0-9\-]{10,}\b"),
    ("Google API key", r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    ("private key", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Govee key header", r"(?i)Govee-API-Key['\"]?\s*[:=]\s*['\"]?[0-9a-f]{8}-"),
    ("assigned secret", r"(?i)\b[\w-]*(api[_-]?key|secret|token|passw(or)?d)[\w-]*\b\s*[:=]\s*['\"][A-Za-z0-9_\-+/=.]{20,}['\"]"),
    ("Spotify login blob", r"(?i)autologin\.(blob|username)\s*="),
]
PLACES = [
    ("private LAN address", r"\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b"),
    ("home directory path", r"(?i)\b[A-Z]:[\x5c/]+Users[\x5c/]+(?!Public\b)[A-Za-z0-9._-]+|/Users/(?!Shared\b)[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+"),
    ("email address", r"\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b|example\.(com|org)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
]


def tracked(staged):
    if staged:
        out = subprocess.check_output(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"], cwd=ROOT, text=True)
    else:
        out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return [f for f in out.splitlines() if f]


def read(f, staged):
    # the staged copy is what gets committed, which is not always what is on disk
    if staged:
        return subprocess.check_output(["git", "show", ":" + f], cwd=ROOT)
    with open(os.path.join(ROOT, f), "rb") as fh:
        return fh.read()


def own_terms():
    path = os.path.join(ROOT, ".leakcheck.local")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        terms = [t.strip() for t in fh if t.strip() and not t.startswith("#")]
    # whole words only, so a term like "Ann" does not trip on "announce" and a name does not trip on the repo's own URL
    return [(t, re.compile(r"(?i)(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])")) for t in terms]


def main():
    staged = "--staged" in sys.argv
    files = tracked(staged)
    terms = own_terms()
    found = []
    for f in files:
        name = os.path.basename(f)
        if "wall-raw" in name:
            found.append((f, 0, "the private wallpaper", name))
            continue
        data = read(f, staged)
        if IMAGE.search(f):
            if b"Exif\x00\x00" in data[:65536] or b"http://ns.adobe.com/xap/" in data[:65536]:
                found.append((f, 0, "image metadata (EXIF/XMP)", "strip it before committing"))
            continue
        if not TEXT.search(name) and not TEXT.search(f):
            continue
        text = data.decode("utf-8", errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            # dist/ holds a base64 image on one very long line; the secret shapes still apply, the rest is noise
            for label, rx in SECRETS + PLACES:
                m = re.search(rx, line)
                if m:
                    found.append((f, n, label, m.group(0)[:12] + "..."))
            for term, rx in terms:
                if rx.search(line):
                    found.append((f, n, "your own term", term))
    for f, n, label, hint in found:
        print(f"LEAK  {f}:{n}  {label}  ({hint})")
    scope = "staged files" if staged else "tracked files"
    local = f", {len(terms)} of your own terms" if terms else ", no .leakcheck.local (add one to check your own words)"
    print(f"{'FAIL' if found else 'PASS'}: {len(files)} {scope} checked{local}, {len(found)} found")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
