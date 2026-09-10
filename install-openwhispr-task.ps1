[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$taskName = "OpenWhisprServerSupervisor"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$supervisor = Join-Path $root "openwhispr-supervisor.ps1"
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $supervisor)) {
    throw "OpenWhispr supervisor not found at $supervisor"
}

$actionArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArguments -WorkingDirectory $root
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$recoveryTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
    -Hidden `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -WakeToRun
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited

$task = New-ScheduledTask `
    -Action $action `
    -Description "Keeps Docker Desktop and the private-Tailscale OpenWhispr Speaches API available after sign-in." `
    -Principal $principal `
    -Settings $settings `
    -Trigger @($logonTrigger, $recoveryTrigger)

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
