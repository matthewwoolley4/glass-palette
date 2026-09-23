#!/bin/sh
# Glass Palette Lights on macOS or Linux: install the light server and keep it running in the background from login.
#
#   curl -fsSL https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/extras/lights/install.sh | sh
#   sh install.sh --remove        take it all out again
#
# Before it: turn on "LAN Control" for each light in the Govee Home app (the light's settings page). After it: in
# Spotify, Settings > Glass Palette > "Send the song to your lights", then Find lights.
# Needs Node.js 18 or newer. It does not install Node for you: that is your call, and one command (below) if not.
set -e
VERSION="v1.1.2"
REPO="matthewwoolley4/glass-palette"
LABEL="com.glasspalette.lights"

if [ "$(uname)" = "Darwin" ]; then
  HOME_DIR="$HOME/Library/Application Support/glass-palette-lights"
  UNIT="$HOME/Library/LaunchAgents/$LABEL.plist"
  LOG="$HOME/Library/Logs/glass-palette-lights.log"
else
  HOME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/glass-palette-lights"
  UNIT="$HOME/.config/systemd/user/glass-palette-lights.service"
fi

if [ "$1" = "--remove" ]; then
  if [ "$(uname)" = "Darwin" ]; then launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  else systemctl --user disable --now glass-palette-lights.service 2>/dev/null || true; fi
  rm -f "$UNIT"; rm -rf "$HOME_DIR"
  echo "Glass Palette Lights removed. Your light list stays in ~/.config/glass-palette-lights; delete that folder too if you like."
  exit 0
fi

NODE="$(command -v node || true)"
[ -z "$NODE" ] && [ -x /opt/homebrew/bin/node ] && NODE=/opt/homebrew/bin/node
[ -z "$NODE" ] && [ -x /usr/local/bin/node ] && NODE=/usr/local/bin/node
if [ -z "$NODE" ] || [ "$("$NODE" -p 'parseInt(process.versions.node)')" -lt 18 ]; then
  echo "Glass Palette Lights needs Node.js 18 or newer, and this machine does not have it." >&2
  echo "  macOS:          brew install node        (or the installer from https://nodejs.org)" >&2
  echo "  Debian/Ubuntu:  sudo apt install nodejs" >&2
  echo "Then run this again." >&2
  exit 1
fi

# Something already answering where the light server lives: a second copy, or another light app. Do not fight it.
if curl -fsS -m 2 http://127.0.0.1:8197/status >/dev/null 2>&1 && ! curl -fsS -m 2 http://127.0.0.1:8197/status | grep -q '"glass-palette-lights"'; then
  echo "Another program is already answering on 127.0.0.1:8197, the light server's address. Stop it first, then run this again." >&2
  exit 1
fi

mkdir -p "$HOME_DIR"
HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/lights.js" ]; then
  cp "$HERE/lights.js" "$HOME_DIR/lights.js"                             # run from a copy of the project
else
  curl -fsSL "https://raw.githubusercontent.com/$REPO/$VERSION/extras/lights/lights.js" -o "$HOME_DIR/lights.js"
fi

if [ "$(uname)" = "Darwin" ]; then
  mkdir -p "$(dirname "$UNIT")" "$(dirname "$LOG")"
  cat > "$UNIT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$HOME_DIR/lights.js</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$UNIT"
else
  mkdir -p "$(dirname "$UNIT")"
  cat > "$UNIT" <<EOF
[Unit]
Description=Glass Palette Lights (the playing song on Govee lights)
After=network-online.target

[Service]
ExecStart="$NODE" "$HOME_DIR/lights.js"
Restart=on-failure

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now glass-palette-lights.service
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 2 http://127.0.0.1:8197/status 2>/dev/null | grep -q '"glass-palette-lights"'; then
    echo "Glass Palette Lights is running and starts by itself from now on."
    echo "Next, in Spotify: Settings > Glass Palette > turn on \"Send the song to your lights\", then press Find lights."
    echo "No lights found? Turn on LAN Control for each one in the Govee Home app. Take it out again with: sh install.sh --remove"
    exit 0
  fi
  sleep 1
done
echo "Installed, but it is not answering yet." >&2
[ -n "$LOG" ] && echo "What it said: $LOG" >&2 || echo "What it said: journalctl --user -u glass-palette-lights" >&2
exit 1
