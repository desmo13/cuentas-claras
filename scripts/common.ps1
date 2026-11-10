$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments = @())
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Ha fallado $Command (codigo $LASTEXITCODE)." }
}

function Initialize-CuentasEnvironment {
  $configFile = Join-Path $toolsRoot 'environment.json'
  $config = if (Test-Path -LiteralPath $configFile) { Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json } else { $null }
  $script:sdkPath = if ($config -and $config.sdk) { $config.sdk } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $toolsRoot 'android-sdk' }
  $javaPath = if ($config -and $config.java) { $config.java } else { $env:JAVA_HOME }
  if ($javaPath) { $env:JAVA_HOME = $javaPath; $env:PATH = (Join-Path $javaPath 'bin') + ';' + $env:PATH }
  $localNode = Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'node-v*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($localNode) { $env:PATH = $localNode.FullName + ';' + $env:PATH }
  $env:ANDROID_HOME = $sdkPath
  $env:ANDROID_SDK_ROOT = $sdkPath
  $env:ANDROID_AVD_HOME = Join-Path $toolsRoot 'avd'
  $env:ANDROID_USER_HOME = Join-Path $toolsRoot 'android-user'
  $env:GRADLE_USER_HOME = if ($env:CUENTAS_GRADLE_HOME) { $env:CUENTAS_GRADLE_HOME } else { Join-Path $toolsRoot 'gradle' }
  $env:TEMP = Join-Path $projectRoot 'tmp'
  $env:TMP = $env:TEMP
  foreach ($dir in @($toolsRoot,$env:ANDROID_AVD_HOME,$env:ANDROID_USER_HOME,$env:TEMP)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Set-Location -LiteralPath $projectRoot
}

function Get-OwnEmulator {
  $recordPath = Join-Path $toolsRoot 'emulator.json'
  if (-not (Test-Path -LiteralPath $recordPath)) { throw 'Abre primero el emulador con npm run emulator.' }
  $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  if ($record.serial -notmatch '^emulator-\d+$') { throw 'Serial de emulador no valido.' }
  $adb = Join-Path $sdkPath 'platform-tools/adb.exe'
  $actual = & $adb -s $record.serial emu avd name
  if ($LASTEXITCODE -ne 0 -or $actual -notcontains 'CuentasClarasCompartida') { throw 'El emulador registrado no es el de este proyecto. Ejecuta npm run emulator.' }
  return [string]$record.serial
}
