# start-admin.ps1 — arranca el ADMIN: dashboard local (8090) + túnel con NOMBRE de
# Cloudflare (admin.getviralytic.com, URL fija). Pensado para correr al iniciar sesión.
# Ya NO re-apunta Vercel: el hostname es permanente.
$ErrorActionPreference = 'SilentlyContinue'
$admin = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $admin

# 1) Dashboard local (8090) si no está arriba
$up = $false
try { $up = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:8090/').StatusCode -ge 200 } catch {}
if (-not $up) {
  Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'dashboard/server.mjs' -WorkingDirectory $admin
  Start-Sleep -Seconds 4
}

# 2) Túnel con nombre (si no hay cloudflared corriendo)
$running = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $running) {
  $tok = (Get-Content (Join-Path $admin '.tunnel_token') -Raw).Trim()
  $exe = Join-Path $admin 'tools\cloudflared.exe'
  Start-Process -WindowStyle Hidden -FilePath $exe `
    -ArgumentList @('tunnel','--no-autoupdate','run','--token',$tok) `
    -RedirectStandardError (Join-Path $admin 'data\named-tunnel.log') `
    -RedirectStandardOutput (Join-Path $admin 'data\named-tunnel.out')
  Write-Host 'Túnel con nombre arrancado -> admin.getviralytic.com'
} else {
  Write-Host 'cloudflared ya está corriendo'
}
