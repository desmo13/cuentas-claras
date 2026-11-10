param([string]$Architectures = 'arm64-v8a,armeabi-v7a,x86_64')
. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-CuentasEnvironment
if (-not (Test-Path -LiteralPath (Join-Path $sdkPath 'platforms/android-36/android.jar'))) { throw 'Prepara primero las herramientas con scripts/setup.ps1.' }
if (-not $env:JAVA_HOME) { throw 'Falta Java 21. Ejecuta scripts/setup.ps1.' }
$env:NODE_ENV = 'production'
# Se regenera sin --clean y luego se restaura siempre la misma clave local.
Invoke-Checked 'npx.cmd' @('expo','prebuild','--platform','android','--no-install')
$signingRoot = Join-Path $toolsRoot 'signing'
$keyPath = Join-Path $signingRoot 'debug.keystore'
New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
if (-not (Test-Path -LiteralPath $keyPath)) {
  Invoke-Checked (Join-Path $env:JAVA_HOME 'bin/keytool.exe') @('-genkeypair','-keystore',$keyPath,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Cuentas claras development,O=Development,C=ES')
}
Copy-Item -LiteralPath $keyPath -Destination (Join-Path $projectRoot 'android/app/debug.keystore') -Force
$wrapper = Join-Path $projectRoot 'android/gradle/wrapper/gradle-wrapper.properties'
$wrapperText = [IO.File]::ReadAllText($wrapper)
[IO.File]::WriteAllText($wrapper, ($wrapperText -replace 'gradle-[0-9.]+-bin.zip','gradle-8.14.3-bin.zip'))
$mappedDrive = $null
$sdkBuildPath = $sdkPath
$localProperties = Join-Path $projectRoot 'android/local.properties'
$oldProperties = if (Test-Path -LiteralPath $localProperties) { [IO.File]::ReadAllText($localProperties) } else { '' }
$otherProperties = ($oldProperties -split "`r?`n" | Where-Object { $_ -notmatch '^sdk\.dir=' }) -join "`n"
try {
  if ($sdkPath -match ' ') {
    foreach ($letter in @('R','S','T','U','V','W','X','Y','Z')) {
      if (-not (Test-Path ($letter + ':\'))) {
        & subst.exe ($letter + ':') $sdkPath
        if ($LASTEXITCODE -eq 0) { $mappedDrive = $letter + ':'; $sdkBuildPath = $mappedDrive + '\'; break }
      }
    }
    if (-not $mappedDrive) { throw 'No hay una letra de unidad libre para la ruta Android con espacios.' }
  }
  $env:ANDROID_HOME = $sdkBuildPath; $env:ANDROID_SDK_ROOT = $sdkBuildPath
  [IO.File]::WriteAllText($localProperties, $otherProperties + "`nsdk.dir=" + $sdkBuildPath.Replace('\','/') + "`n")
  Push-Location -LiteralPath (Join-Path $projectRoot 'android')
  try { Invoke-Checked '.\gradlew.bat' @(':app:assembleRelease',"-PreactNativeArchitectures=$Architectures",'--console=plain','--max-workers=2') } finally { Pop-Location }
} finally {
  if ($mappedDrive) { & subst.exe $mappedDrive /d }
  [IO.File]::WriteAllText($localProperties, $otherProperties + "`nsdk.dir=" + $sdkPath.Replace('\','/') + "`n")
  $env:ANDROID_HOME = $sdkPath; $env:ANDROID_SDK_ROOT = $sdkPath
}
$outputPath = Join-Path $projectRoot 'output'
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk') -Destination (Join-Path $outputPath 'Cuentas-Claras.apk') -Force
Write-Host (Join-Path $outputPath 'Cuentas-Claras.apk')
