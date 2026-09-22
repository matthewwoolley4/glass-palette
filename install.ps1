# Glass Palette: install as the Spicetify theme on Windows.
#   1. Install Spicetify once:  iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
#   2. Run this script:         powershell -ExecutionPolicy Bypass -File .\install.ps1
#   3. Quit Spotify fully (tray icon > Quit) and open it again.
# Safe to re-run any time: after pulling an update, and after Spotify updates itself and drops the theme.
# Python 3 is only needed to rebuild from src\. Without it this installs the prebuilt dist\GlassPalette, which is
# the same thing the Marketplace ships.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Spicetify works by patching files inside Spotify's own folder. The Microsoft Store copy lives in a read-only
# sandbox under WindowsApps, so no theme can ever be applied to it and the failure looks like nothing happening.
# Say so here rather than letting spicetify fail three steps later.
$storeSpotify = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Packages") -Filter "SpotifyAB.SpotifyMusic_*" -Directory -ErrorAction SilentlyContinue
$desktopSpotify = Join-Path $env:APPDATA "Spotify\Spotify.exe"
if ($storeSpotify -and -not (Test-Path $desktopSpotify)) {
  throw @"
This machine has the Microsoft Store version of Spotify, which cannot be themed: Spicetify has to edit files inside
Spotify's folder and the Store keeps those files read-only.

To fix it:
  1. Settings > Apps > Installed apps > Spotify > Uninstall
  2. Install the desktop app from https://www.spotify.com/download/windows
  3. Open it once and sign in
  4. Run this script again
"@
}

# the build step, which is optional
$python = $null
foreach ($name in @("python", "python3", "py")) {
  $candidate = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $candidate) { continue }
  # "python" with no Python installed is Windows' Store stub: it opens the Store and exits non-zero
  $version = & $candidate.Source --version 2>&1
  if ($LASTEXITCODE -eq 0 -and "$version" -match "Python 3") { $python = $candidate; break }
}
if ($python) {
  & $python.Source build.py
  if ($LASTEXITCODE -ne 0) { throw "build failed" }
} elseif (Test-Path (Join-Path $PSScriptRoot "dist\GlassPalette\user.css")) {
  Write-Host "No Python 3 on PATH, so installing the prebuilt theme in dist\GlassPalette. That is the shipped build;"
  Write-Host "Python is only needed if you want to change something in src\ and rebuild."
} else {
  throw "No Python 3 on PATH and no prebuilt dist\GlassPalette to install. Either get the full folder again, or install Python 3 from https://www.python.org/downloads/ (tick 'Add python.exe to PATH') and re-run this."
}

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
  throw "Spicetify is not on PATH. Install it with:  iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex  then open a new PowerShell window and run this again."
}

# The first time Spicetify runs it writes its config and says so on the console; let it do that here, or the message
# ends up inside the folder path below and the theme lands somewhere Spicetify never looks ("Theme not found").
spicetify config 2>$null | Out-Null
$userdata = (spicetify path userdata 2>$null | Select-Object -Last 1)
if ($userdata -and (Test-Path $userdata)) { $themes = Join-Path $userdata "Themes" }
else {
  $themes = Join-Path $env:LOCALAPPDATA "spicetify\Themes"
  if (-not (Test-Path $themes)) { $themes = Join-Path $env:APPDATA "spicetify\Themes" }
}

# Spotify writes its settings file (prefs) on its first launch, and Spicetify cannot apply anything without it.
if (-not (Test-Path (Join-Path $env:APPDATA "Spotify\prefs")) -and -not (spicetify config prefs_path 2>$null | Select-Object -Last 1)) {
  throw "Spotify has not been opened on this machine yet, so it has no settings file for Spicetify to work with. Open Spotify once, sign in, quit it, then run this again."
}
$dest = Join-Path $themes "GlassPalette"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot "dist\GlassPalette\*") $dest -Force
# spicetify on Windows takes one key + value per call
spicetify config current_theme GlassPalette | Out-Null
spicetify config color_scheme Glass | Out-Null
spicetify config inject_css 1 | Out-Null
spicetify config replace_colors 1 | Out-Null
spicetify config inject_theme_js 1 | Out-Null
$savedErrorPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
spicetify apply -n 2>$null
$applyExitCode = $LASTEXITCODE
# A plain apply fails when Spicetify's backup is older than the installed Spotify, which is what a Spotify
# auto-update leaves behind. Re-taking the backup against the new Spotify is the repair.
if ($applyExitCode -ne 0) { Write-Host "First apply did not succeed. Re-taking the backup against this Spotify and trying again..."; spicetify backup apply -n }
$ErrorActionPreference = $savedErrorPreference
if ($LASTEXITCODE -ne 0) { throw "spicetify apply failed with exit code $LASTEXITCODE. Run 'spicetify apply' on its own to see why." }
Write-Host ""
Write-Host "Glass Palette installed. Quit Spotify fully (tray icon > Quit) and open it again."
