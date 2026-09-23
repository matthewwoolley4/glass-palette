# Glass Palette Lights on Windows: install the light server and keep it running in the background from sign-in.
#
#   iwr -useb https://raw.githubusercontent.com/matthewwoolley4/glass-palette/main/extras/lights/install.ps1 | iex
#   & .\install.ps1 -Remove        take it all out again (from a copy of the project)
#
# Before it: turn on "LAN Control" for each light in the Govee Home app (the light's settings page). After it: in
# Spotify, Settings > Glass Palette > "Send the song to your lights", then Find lights.
# Needs Node.js 18 or newer. It does not install Node for you: that is your call, and one command (below) if not.
# No administrator rights: it starts from your own Startup folder, hidden, through a one-line script.
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$version = "v1.1.4"
$repo = "matthewwoolley4/glass-palette"
$dir = Join-Path $env:LOCALAPPDATA "glass-palette-lights"
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) "Glass Palette Lights.vbs"

function Stop-Lights {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*glass-palette-lights*lights.js*" } |
    ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
}

if ($Remove) {
  Stop-Lights
  Remove-Item -Force -ErrorAction SilentlyContinue $startup
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dir
  Write-Host "Glass Palette Lights removed. Your light list stays in $env:APPDATA\glass-palette-lights; delete that folder too if you like."
  return
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node -or [int](& $node -p "parseInt(process.versions.node)") -lt 18) {
  Write-Host "Glass Palette Lights needs Node.js 18 or newer, and this machine does not have it."
  Write-Host "  winget install OpenJS.NodeJS.LTS      (or the installer from https://nodejs.org)"
  Write-Host "Then open a new PowerShell window and run this again."
  return
}

# Something already answering where the light server lives: a second copy, or another light app. Do not fight it.
try {
  $s = Invoke-RestMethod -TimeoutSec 2 http://127.0.0.1:8197/status
  if ($s.app -ne "glass-palette-lights") { Write-Host "Another program is already answering on 127.0.0.1:8197, the light server's address. Stop it first, then run this again."; return }
} catch { }

New-Item -ItemType Directory -Force $dir | Out-Null
$here = if ($PSScriptRoot) { $PSScriptRoot } else { "" }
if ($here -and (Test-Path (Join-Path $here "lights.js"))) {
  Copy-Item -Force (Join-Path $here "lights.js") (Join-Path $dir "lights.js")          # run from a copy of the project
} else {
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/$repo/$version/extras/lights/lights.js" -OutFile (Join-Path $dir "lights.js")
}

# Hidden at sign-in: wscript runs node with no console window.
$js = Join-Path $dir "lights.js"
Set-Content -Encoding ASCII $startup ('CreateObject("WScript.Shell").Run """' + $node + '"" ""' + $js + '""", 0, False')
Stop-Lights
Start-Process wscript.exe -ArgumentList "`"$startup`""

Write-Host "Starting. If Windows asks whether Node.js may use your network, choose Allow on private networks:"
Write-Host "that is how the lights' answers get back to it."
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $s = Invoke-RestMethod -TimeoutSec 2 http://127.0.0.1:8197/status
    if ($s.app -eq "glass-palette-lights") {
      Write-Host "Glass Palette Lights is running and starts by itself from now on."
      Write-Host "Next, in Spotify: Settings > Glass Palette > turn on ""Send the song to your lights"", then press Find lights."
      Write-Host "No lights found? Turn on LAN Control for each one in the Govee Home app."
      return
    }
  } catch { }
}
Write-Host "Installed, but it is not answering yet. Run it by hand to see why:  node `"$js`""
