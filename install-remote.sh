#!/bin/sh
# Glass Palette one-line install for macOS / Linux:
#   curl -fsSL https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/install-remote.sh | sh
# Installs Spicetify if missing, downloads the theme to ~/.glass-palette, installs it, tells you to restart Spotify.
set -e
export PATH="$HOME/.spicetify:/opt/homebrew/bin:$PATH"
if ! command -v spicetify >/dev/null 2>&1; then
  echo "Installing Spicetify..."
  # Spicetify's installer ends by asking whether to add its Marketplace, reading the answer from the terminal. With no
  # terminal (an AI assistant or a script running this for you) that question fails AFTER Spicetify is installed, so
  # let it fail and check the result instead of stopping here. With a terminal you still get the question.
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh || true
  command -v spicetify >/dev/null 2>&1 || { echo "Spicetify did not install. See https://spicetify.app/docs/getting-started" >&2; exit 1; }
fi
# The release this installs. tools/release.py sets it; main is where work happens, a tag is what people get.
VERSION="v1.1.2"
DIR="$HOME/.glass-palette"; TMP="$(mktemp -d)"
curl -fsSL "https://github.com/matthewwoolley4/glass-palette/archive/refs/tags/$VERSION.tar.gz" | tar -xz -C "$TMP"
rm -rf "$DIR"; mv "$TMP"/glass-palette-* "$DIR"; rm -rf "$TMP"
echo "Glass Palette $VERSION"
sh "$DIR/install.sh"
