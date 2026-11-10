param([switch]$Headless)
. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-CuentasEnvironment
$adb = Join-Path $sdkPath 'platform-tools/adb.exe'
$avdName = 'CuentasClarasCompartida'
$avdManager = Join-Path $sdkPath 'cmdline-tools/latest/bin/avdmanager.bat'
$apk = Join-Path $projectRoot 'output/Cuentas-Claras.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw 'Genera primero la APK con npm run apk.' }
if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_AVD_HOME "$avdName.ini"))) {
  'no' | & $avdManager create avd --name $avdName --package 'system-images;android-35;default;x86_64' --device 'pixel_5'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el emulador. Revisa scripts/setup.ps1.' }
}
Invoke-Checked $adb @('start-server')
$serial = $null
$deviceRows = & $adb devices
foreach ($row in $deviceRows) {
  if ($row -match '^(emulator-\d+)\s+device$') {
    $candidate = $Matches[1]
    $name = & $adb -s $candidate emu avd name
    if ($name -contains $avdName) { $serial = $candidate; break }
  }
}
if (-not $serial) {
  $usedPorts = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
  $port = 5556
  while ($usedPorts -contains $port -or $usedPorts -contains ($port+1)) { $port += 2; if ($port -gt 5680) { throw 'No hay puerto libre para el emulador.' } }
  $serial = "emulator-$port"
  $arguments = @('-avd',$avdName,'-port',"$port",'-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-memory','2048','-cores','2')
  if ($Headless) { $arguments += '-no-window'; Start-Process -FilePath (Join-Path $sdkPath 'emulator/emulator.exe') -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'tmp/emulator.log') -RedirectStandardError (Join-Path $projectRoot 'tmp/emulator-error.log') | Out-Null }
  else { Start-Process -FilePath (Join-Path $sdkPath 'emulator/emulator.exe') -ArgumentList ($arguments + @('-scale','0.45')) | Out-Null }
}
$deadline = (Get-Date).AddMinutes(4)
do {
  Start-Sleep -Seconds 2
  # ADB puede no ver aun el proceso durante los primeros segundos de arranque.
  $savedPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $boot = & $adb -s $serial shell getprop sys.boot_completed 2>$null }
  finally { $ErrorActionPreference = $savedPreference }
  if ((Get-Date) -gt $deadline) { throw 'Android no ha arrancado. Revisa tmp/emulator-error.log y la disponibilidad de virtualizacion.' }
} until ($boot -match '^1')
@{serial=$serial;avd=$avdName} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'emulator.json') -Encoding UTF8
Invoke-Checked $adb @('-s',$serial,'shell','input','keyevent','224')
Invoke-Checked $adb @('-s',$serial,'shell','wm','dismiss-keyguard')
Invoke-Checked $adb @('-s',$serial,'install','-r',$apk)
Invoke-Checked $adb @('-s',$serial,'shell','am','start','-W','-n','es.cuentasclaras.app/.MainActivity')
Write-Host "App abierta en $serial. Para comprobarla: npm run smoke."
