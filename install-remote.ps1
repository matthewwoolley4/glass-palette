# Glass Palette one-line install for Windows:
#   iwr -useb https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/install-remote.ps1 | iex
# Installs Spicetify if missing, downloads the theme to %LOCALAPPDATA%\GlassPalette, installs it, tells you to restart Spotify.
$ErrorActionPreference = "Stop"
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Spicetify..."
  # Spicetify's installer ends by asking whether to add its Marketplace. With no one at the keyboard (an AI assistant
  # or a script running this for you) that question throws AFTER Spicetify is installed, so catch it and check the
  # result instead of stopping here. At a normal PowerShell prompt you still get the question.
  try { Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression }
  catch { Write-Host "Spicetify's installer stopped at a question: $($_.Exception.Message)" }
  $env:PATH = "$env:LOCALAPPDATA\spicetify;$env:PATH"
  if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) { throw "Spicetify did not install. See https://spicetify.app/docs/getting-started" }
}
# The release this installs. tools/release.py sets it; main is where work happens, a tag is what people get.
$version = "v1.1.3"
$dir = Join-Path $env:LOCALAPPDATA "GlassPalette"
$zip = Join-Path $env:TEMP "glass-palette.zip"
Invoke-WebRequest -UseBasicParsing "https://github.com/matthewwoolley4/glass-palette/archive/refs/tags/$version.zip" -OutFile $zip
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive $zip (Join-Path $env:TEMP "glass-palette-x") -Force
Move-Item (Get-ChildItem (Join-Path $env:TEMP "glass-palette-x") -Directory | Select-Object -First 1).FullName $dir
Write-Host "Glass Palette $version"
Remove-Item (Join-Path $env:TEMP "glass-palette-x") -Recurse -Force; Remove-Item $zip -Force
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "install.ps1")
