# ==========================================================
# TiktokGameManager - Cloudflare Tunnel Self-Hosting Launcher
# ==========================================================

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  TiktokGameManager - Cloudflare Self-Hosting Setup  " -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Cari path cloudflared
$cloudflaredPath = $null
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cloudflaredPath = "cloudflared"
} elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"
}

if (-not $cloudflaredPath) {
    Write-Host "`n[!] 'cloudflared' belum terpasang di sistem." -ForegroundColor Red
    Write-Host "Menjalankan: winget install --id Cloudflare.cloudflared ..." -ForegroundColor Cyan
    winget install --id Cloudflare.cloudflared
    Write-Host "`n[OK] Silakan jalankan script ini kembali." -ForegroundColor Green
    pause
    exit
}

# 2. Build client terbaru
Write-Host "`n[*] Membangun bundle produksi client terbaru (npm run build)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[!] Gagal melakukan build client. Proses dibatalkan." -ForegroundColor Red
    pause
    exit
}

# 3. Jalankan server dan tunnel
Write-Host "`n[1/2] Menjalankan Server di port 3001..." -ForegroundColor Green
$serverJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start:prod" -PassThru

Start-Sleep -Seconds 2

Write-Host "`n[2/2] Membuka Cloudflare Quick Tunnel..." -ForegroundColor Green
Write-Host "Catat URL https://xxx.trycloudflare.com yang muncul di bawah ini untuk OBS Overlay / Akses Remote:`n" -ForegroundColor Yellow

& $cloudflaredPath tunnel --url http://localhost:3001
