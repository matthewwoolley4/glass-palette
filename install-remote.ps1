# Glass Palette one-line install for Windows:
#   iwr -useb https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/install-remote.ps1 | iex
# Installs Spicetify if missing, downloads the theme to %LOCALAPPDATA%\GlassPalette, installs it, tells you to restart Spotify.
$ErrorActionPreference = "Stop"
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Spicetify..."; Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression
  $env:PATH = "$env:LOCALAPPDATA\spicetify;$env:PATH"
}
$dir = Join-Path $env:LOCALAPPDATA "GlassPalette"
$zip = Join-Path $env:TEMP "glass-palette.zip"
Invoke-WebRequest -UseBasicParsing "https://github.com/matthewwoolley4/glass-palette/archive/refs/heads/main.zip" -OutFile $zip
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive $zip (Join-Path $env:TEMP "glass-palette-x") -Force
Move-Item (Join-Path $env:TEMP "glass-palette-x\glass-palette-main") $dir
Remove-Item (Join-Path $env:TEMP "glass-palette-x") -Recurse -Force; Remove-Item $zip -Force
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "install.ps1")
