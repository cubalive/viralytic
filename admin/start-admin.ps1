# start-admin.ps1 — arranca el ADMIN (dashboard local + túnel público) y mantiene
# getviralytic.com apuntando a él. Pensado para correr al iniciar sesión (Tarea de Windows).
$ErrorActionPreference = 'SilentlyContinue'
$admin = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo  = Split-Path -Parent $admin
Set-Location $admin

# 1) Dashboard local (8090) si no está arriba
$up = $false
try { $up = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:8090/' ).StatusCode -ge 200 } catch {}
if (-not $up) {
  Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'dashboard/server.mjs' -WorkingDirectory $admin
  Start-Sleep -Seconds 4
}

# 2) Túnel cloudflared -> captura la URL pública
$log = Join-Path $admin 'data\tunnel.log'
if (Test-Path $log) { Remove-Item $log -Force }
Start-Process -WindowStyle Hidden -FilePath 'cloudflared' `
  -ArgumentList 'tunnel','--no-autoupdate','--url','http://localhost:8090' `
  -RedirectStandardError $log -RedirectStandardOutput (Join-Path $admin 'data\tunnel.out')

# espera a que aparezca la URL (hasta ~40s)
$url = $null
for ($i=0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  $txt = (Get-Content $log -Raw -ErrorAction SilentlyContinue) + (Get-Content (Join-Path $admin 'data\tunnel.out') -Raw -ErrorAction SilentlyContinue)
  $m = [regex]::Match($txt, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($m.Success) { $url = $m.Value; break }
}
if (-not $url) { Write-Host 'No se obtuvo URL del túnel'; exit 1 }
Write-Host "Túnel: $url"

# 3) Si la URL cambió, re-apunta getviralytic.com (Vercel) y redeploya
$store = Join-Path $admin 'data\tunnel_url.txt'
$prev = (Get-Content $store -Raw -ErrorAction SilentlyContinue)
if ($prev) { $prev = $prev.Trim() }
if ($prev -ne $url) {
  Set-Content -Path $store -Value $url -Encoding ascii
  Set-Location $repo
  cmd /c "npx vercel env rm ADMIN_TUNNEL_URL production --yes" 2>$null
  $url | cmd /c "npx vercel env add ADMIN_TUNNEL_URL production" 2>$null
  cmd /c "npx vercel --prod --yes" 2>$null
  Write-Host "getviralytic.com re-apuntado a $url"
} else {
  Write-Host "URL sin cambios; no hace falta redeploy"
}
