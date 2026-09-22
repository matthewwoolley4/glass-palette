#!/bin/sh
# Glass Palette one-line install for macOS / Linux:
#   curl -fsSL https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/install-remote.sh | sh
# Installs Spicetify if missing, downloads the theme to ~/.glass-palette, installs it, tells you to restart Spotify.
set -e
export PATH="$HOME/.spicetify:/opt/homebrew/bin:$PATH"
command -v spicetify >/dev/null 2>&1 || { echo "Installing Spicetify..."; curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh; }
DIR="$HOME/.glass-palette"; TMP="$(mktemp -d)"
curl -fsSL https://github.com/matthewwoolley4/glass-palette/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP"
rm -rf "$DIR"; mv "$TMP/glass-palette-main" "$DIR"; rm -rf "$TMP"
sh "$DIR/install.sh"
