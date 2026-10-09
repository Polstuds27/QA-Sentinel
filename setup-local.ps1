#Requires -Version 5.1
<#
  QA Sentinel - new-machine setup (Windows 10/11, PowerShell).
  Installs everything the local backend needs: Node check, Ollama, qwen2.5:3b,
  OLLAMA_ORIGINS for the browser, and client dependencies.
  Whisper base (~150 MB) downloads itself on first transcription (internet once).
  Usage: right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File setup-local.ps1
#>
$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "OK: $msg" -ForegroundColor Green }
function Need($msg) { Write-Host "MISSING: $msg" -ForegroundColor Yellow }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

Step "1/5 Node.js (need v20+)"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Need "Node.js not found - install LTS from https://nodejs.org, then re-run this script."
  exit 1
}
$ver = (& node --version) -replace "v", ""
if ([version]$ver -lt [version]"20.0.0") { Need "Node $ver too old - install Node 20+."; exit 1 }
Ok "Node $(& node --version) / npm $(& npm --version)"

Step "2/5 Ollama"
if (-not (Test-Path $ollamaExe)) {
  Write-Host "Installing Ollama via winget (one-time download)..."
  winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
  if (-not (Test-Path $ollamaExe)) { Need "Ollama install failed - install manually from https://ollama.com/download."; exit 1 }
}
Ok "Ollama $(& $ollamaExe --version 2>$null | Select-Object -First 1)"

Step "3/5 OLLAMA_ORIGINS (browser permission)"
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "http://localhost:5173", "User")
$env:OLLAMA_ORIGINS = "http://localhost:5173"
Ok "OLLAMA_ORIGINS=http://localhost:5173 (user env)"

Step "4/5 Ollama server + qwen2.5:3b (~1 GB, one-time download)"
$up = $false
try { Invoke-WebRequest -Uri "http://127.0.0.1:11434/" -TimeoutSec 5 -UseBasicParsing | Out-Null; $up = $true } catch { $up = $false }
if (-not $up) {
  Write-Host "Starting ollama serve in the background..."
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep -Seconds 8
}
& $ollamaExe pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { Need "Model pull failed - check internet and re-run."; exit 1 }
Ok "qwen2.5:3b ready"
& $ollamaExe list

Step "5/5 Frontend dependencies"
Push-Location (Join-Path $root "client")
npm install
Ok "npm install done"
Write-Host "Downloading the speech models into client/public/models (about 300 MB, one time)..."
npm run models
Pop-Location
Ok "speech models installed - the app now runs with no internet"

Write-Host "`nAll set. Run the app:" -ForegroundColor Cyan
Write-Host "  1. ollama serve   (keep this terminal open; or leave the Ollama tray app running)"
Write-Host "  2. cd client; npm run dev   -> http://localhost:5173"
Write-Host "  3. Flip 'Local AI' on, upload audio, Transcribe & score."
Write-Host "Docs: docs/BACKEND_CAPSULE.md (handoff) , docs/LOCAL_AI_PLAN.md (measured results)."
