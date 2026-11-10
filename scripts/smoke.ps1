. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-CuentasEnvironment
$serial = Get-OwnEmulator
$adb = Join-Path $sdkPath 'platform-tools/adb.exe'
$package = 'es.cuentasclaras.app'
$output = Join-Path $projectRoot 'output/smoke'
New-Item -ItemType Directory -Force -Path $output | Out-Null
Invoke-Checked $adb @('-s',$serial,'shell','input','keyevent','224')
Invoke-Checked $adb @('-s',$serial,'shell','wm','dismiss-keyguard')
# force-stop no borra SQLite ni reinstala la app.
Invoke-Checked $adb @('-s',$serial,'shell','am','force-stop',$package)
Invoke-Checked $adb @('-s',$serial,'shell','am','start','-W','-n',"$package/.MainActivity")
Start-Sleep -Seconds 4
Invoke-Checked $adb @('-s',$serial,'shell','uiautomator','dump','/sdcard/cuentas-smoke.xml')
Invoke-Checked $adb @('-s',$serial,'pull','/sdcard/cuentas-smoke.xml',(Join-Path $output 'screen.xml'))
$xml = [IO.File]::ReadAllText((Join-Path $output 'screen.xml'))
foreach ($label in @('Cuentas claras','Resumen','Gastos','Ingresos')) { if ($xml -notmatch [regex]::Escape($label)) { throw "No aparece $label; inspecciona output/smoke/screen.xml." } }
$resumed = (& $adb -s $serial shell dumpsys activity activities) -join "`n"
if ($resumed -notmatch '(?:mResumedActivity|topResumedActivity)[^\r\n]*es\.cuentasclaras\.app') { throw 'La app no esta en primer plano.' }
Invoke-Checked $adb @('-s',$serial,'shell','screencap','-p','/sdcard/cuentas-smoke.png')
Invoke-Checked $adb @('-s',$serial,'pull','/sdcard/cuentas-smoke.png',(Join-Path $output 'screen.png'))
$appPid = (& $adb -s $serial shell pidof -s $package).Trim()
if ($appPid -notmatch '^\d+$') { throw 'No se encuentra el proceso de la app.' }
$log = (& $adb -s $serial logcat -d -v brief "--pid=$appPid") -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'No se han podido leer los registros de la app.' }
[IO.File]::WriteAllText((Join-Path $output 'logcat.txt'),$log)
if ($log -match 'FATAL EXCEPTION|Fatal signal \d+|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)') { throw 'Hay errores fatales en output/smoke/logcat.txt.' }
Write-Host 'Smoke correcto: arranque y reapertura sin borrar datos, navegacion visible y sin errores fatales. Captura en output/smoke/screen.png.'
