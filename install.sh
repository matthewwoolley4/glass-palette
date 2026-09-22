#!/bin/sh
# Glass Palette: install as the Spicetify theme on macOS or Linux.
#   1. Install Spicetify once:  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
#   2. Run this script:         sh install.sh
#   3. Quit Spotify fully and open it again (or pass --restart to let Spicetify do it).
# Safe to re-run any time: after pulling an update, and after Spotify updates itself and drops the theme.
# Python 3 is only needed to rebuild from src/. Without it this installs the prebuilt dist/GlassPalette.
set -e
export PATH="$HOME/.spicetify:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"

# Spicetify edits files inside Spotify's own folder, so a sandboxed Spotify can never be themed. Say so up front
# rather than letting it fail three steps later looking like nothing happened.
if [ -d /snap/spotify ] && [ ! -d /opt/spotify ] && [ ! -d /usr/share/spotify ]; then
  echo "This is the Snap version of Spotify, which cannot be themed: Snap keeps its files read-only." >&2
  echo "Remove it (sudo snap remove spotify) and install the .deb or the Flatpak from https://www.spotify.com/download/linux, then run this again." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python3 build.py
elif [ -f dist/GlassPalette/user.css ]; then
  echo "No python3 on PATH, so installing the prebuilt theme in dist/GlassPalette. That is the shipped build;"
  echo "Python is only needed if you want to change something in src/ and rebuild."
else
  echo "No python3 on PATH and no prebuilt dist/GlassPalette to install. Either get the full folder again, or" >&2
  echo "install Python 3 (macOS: xcode-select --install; Debian/Ubuntu: sudo apt install python3) and re-run this." >&2
  exit 1
fi

command -v spicetify >/dev/null 2>&1 || {
  echo "Spicetify is not on PATH. Install it with:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh" >&2
  echo "then open a new terminal and run this again." >&2
  exit 1
}

T="$(spicetify path userdata 2>/dev/null || echo "$HOME/.config/spicetify")/Themes/GlassPalette"
mkdir -p "$T" && cp dist/GlassPalette/* "$T/"
spicetify config current_theme GlassPalette color_scheme Glass inject_css 1 replace_colors 1 inject_theme_js 1 >/dev/null
spicetify backup >/dev/null 2>&1 || true   # first run only; later runs already have one
# A plain apply fails when Spicetify's backup is older than the installed Spotify, which is exactly what a Spotify
# auto-update leaves behind. Re-taking the backup against the new Spotify is the repair.
if [ "$1" = "--restart" ]; then
  spicetify apply || { echo "First apply did not succeed. Re-taking the backup against this Spotify and trying again..."; spicetify backup apply; }
else
  spicetify apply -n || { echo "First apply did not succeed. Re-taking the backup against this Spotify and trying again..."; spicetify backup apply -n; }
  echo; echo "Glass Palette installed. Quit Spotify fully and open it again."
fi
