. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-CuentasEnvironment
Invoke-Checked 'npm.cmd' $args
