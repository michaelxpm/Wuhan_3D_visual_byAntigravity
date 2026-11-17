$env:Path += ';C:\Program Files\nodejs'
Set-Location D:\coding\2611-3D-wuhan-visual--map-byAntigravity\web
$vite = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'node_modules/vite/bin/vite.js','--port','5178','--strictPort' -PassThru -WindowStyle Hidden
Start-Sleep 4
try { & 'C:\Program Files\nodejs\node.exe' shot.mjs $args[0] } finally { Stop-Process -Id $vite.Id -Force }
