param([string]$SdkPath, [string]$JavaPath, [switch]$SkipAndroid)
. (Join-Path $PSScriptRoot 'common.ps1')
New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-OfficialZip {
  param([string]$Url,[string]$Name,[string]$Sha256)
  $archive = Join-Path $toolsRoot $Name
  if (-not (Test-Path -LiteralPath $archive)) {
    Write-Host "Descargando $Name desde una fuente oficial..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Url -OutFile $archive -UseBasicParsing
  }
  if ($Sha256 -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) { throw "La descarga $Name no supera la comprobacion SHA256." }
  return $archive
}

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeOk = $false
if ($nodeCmd) { $v = [version]((& $nodeCmd.Source --version).TrimStart('v')); $nodeOk = $v -ge [version]'22.18.0' }
if (-not $nodeOk) {
  $localNode = Join-Path $toolsRoot 'node-v24.9.0-win-x64'
  if (-not (Test-Path -LiteralPath (Join-Path $localNode 'node.exe'))) {
    $archive = Get-OfficialZip 'https://nodejs.org/dist/v24.9.0/node-v24.9.0-win-x64.zip' 'node.zip' '6873514c3e6a012917cc6f95ce48a6289253370d025f1b69db290d70feebfa6e'
    Expand-Archive -LiteralPath $archive -DestinationPath $toolsRoot -Force
  }
  $env:PATH = $localNode + ';' + $env:PATH
}

if (-not $SkipAndroid) {
  $existingConfig = Join-Path $toolsRoot 'environment.json'
  $previous = if (Test-Path -LiteralPath $existingConfig) { Get-Content -LiteralPath $existingConfig -Raw | ConvertFrom-Json } else { $null }
  if (-not $JavaPath -and $previous) { $JavaPath = $previous.java }
  if (-not $JavaPath) { $JavaPath = $env:JAVA_HOME }
  if (-not $JavaPath) {
    $candidates = @()
    foreach ($base in @((Join-Path $env:ProgramFiles 'Java'),(Join-Path $env:ProgramFiles 'Eclipse Adoptium'),$toolsRoot)) {
      if (Test-Path -LiteralPath $base) { $candidates += Get-ChildItem -LiteralPath $base -Directory -Filter 'jdk-21*' }
    }
    if ($candidates.Count) { $JavaPath = $candidates[0].FullName }
  }
  $javaOk = $false
  if ($JavaPath -and (Test-Path -LiteralPath (Join-Path $JavaPath 'bin/java.exe'))) { $javaOk = ((& (Join-Path $JavaPath 'bin/java.exe') --version) -join ' ') -match '\b21\.' }
  if (-not $javaOk) {
    $release = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows'
    $package = $release[0].binary.package
    $archive = Get-OfficialZip $package.link 'jdk21.zip' $package.checksum
    Expand-Archive -LiteralPath $archive -DestinationPath $toolsRoot -Force
    $JavaPath = (Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'jdk-21*' | Select-Object -First 1).FullName
  }
  if (-not $SdkPath -and $previous) { $SdkPath = $previous.sdk }
  if (-not $SdkPath) { $SdkPath = $env:ANDROID_HOME }
  if (-not $SdkPath -and $env:LOCALAPPDATA) {
    $studioSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
    if (Test-Path -LiteralPath (Join-Path $studioSdk 'cmdline-tools/latest/bin/sdkmanager.bat')) { $SdkPath = $studioSdk }
  }
  if (-not $SdkPath) { $SdkPath = Join-Path $toolsRoot 'android-sdk' }
  New-Item -ItemType Directory -Force -Path $SdkPath | Out-Null
  $SdkPath = (Resolve-Path -LiteralPath $SdkPath).Path
  $JavaPath = (Resolve-Path -LiteralPath $JavaPath).Path
  @{sdk=$SdkPath;java=$JavaPath} | ConvertTo-Json | Set-Content -LiteralPath $existingConfig -Encoding UTF8
  Initialize-CuentasEnvironment
  $manager = Join-Path $sdkPath 'cmdline-tools/latest/bin/sdkmanager.bat'
  if (-not (Test-Path -LiteralPath $manager)) {
    $archive = Get-OfficialZip 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' 'android-commandline.zip' '98b565cb657b012dae6794cefc0f66ae1efb4690c699b78a614b4a6a3505b003'
    $unpack = Join-Path $toolsRoot 'commandline-unpack'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpack -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $sdkPath 'cmdline-tools/latest') | Out-Null
    Copy-Item -Path (Join-Path $unpack 'cmdline-tools/*') -Destination (Join-Path $sdkPath 'cmdline-tools/latest') -Recurse -Force
  }
  if (-not (Test-Path -LiteralPath (Join-Path $sdkPath 'licenses/android-sdk-license'))) {
    Write-Host 'Android necesita que revises y aceptes sus licencias para instalar sus herramientas.'
    Invoke-Checked $manager @("--sdk_root=$sdkPath",'--licenses')
    if (-not (Test-Path -LiteralPath (Join-Path $sdkPath 'licenses/android-sdk-license'))) { throw 'Las licencias siguen pendientes.' }
  }
  $packages = [ordered]@{
    'platform-tools'='platform-tools/adb.exe';'platforms;android-36'='platforms/android-36/android.jar';
    'build-tools;36.0.0'='build-tools/36.0.0/aapt.exe';'ndk;27.1.12297006'='ndk/27.1.12297006/source.properties';
    'cmake;3.22.1'='cmake/3.22.1/bin/cmake.exe';'emulator'='emulator/emulator.exe';
    'system-images;android-35;default;x86_64'='system-images/android-35/default/x86_64/system.img'
  }
  $missing = @($packages.Keys | Where-Object { -not (Test-Path -LiteralPath (Join-Path $sdkPath $packages[$_])) })
  if ($missing.Count) { Invoke-Checked $manager (@("--sdk_root=$sdkPath") + $missing) }
  $ninjaPath = Join-Path $sdkPath 'cmake/3.22.1/bin/ninja.exe'
  $ninjaVersion = [version]((& $ninjaPath --version).Trim())
  if ($ninjaVersion -lt [version]'1.12.0') {
    $localSdk = Join-Path $toolsRoot 'android-sdk'
    if ($sdkPath -ne $localSdk) { throw 'El SDK externo tiene Ninja antiguo. Repite setup con -SdkPath .tools/android-sdk para preparar uno local sin modificar el compartido.' }
    $release = Invoke-RestMethod 'https://api.github.com/repos/ninja-build/ninja/releases/tags/v1.13.2'
    $asset = $release.assets | Where-Object { $_.name -eq 'ninja-win.zip' } | Select-Object -First 1
    $hash = if ($asset.digest) { $asset.digest -replace '^sha256:','' } else { '' }
    $archive = Get-OfficialZip $asset.browser_download_url 'ninja.zip' $hash
    $unpack = Join-Path $toolsRoot 'ninja-unpack'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpack -Force
    Copy-Item -LiteralPath (Join-Path $unpack 'ninja.exe') -Destination $ninjaPath -Force
  }
} else { Initialize-CuentasEnvironment }
Invoke-Checked 'npm.cmd' @('ci','--no-audit','--no-fund')
Invoke-Checked 'npm.cmd' @('run','check')
Write-Host 'Preparacion terminada. Siguiente: npm run apk (o scripts/node.ps1 run apk si Node es local).'
