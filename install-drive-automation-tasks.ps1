#Requires -RunAsAdministrator
param([switch]$StartAndVerify)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateRoot = Join-Path $projectRoot ".worker-state"
$installLog = Join-Path $stateRoot "drive-automation-task-install.log"
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
Start-Transcript -Path $installLog -Force | Out-Null
trap {
    Write-Error $_
    Stop-Transcript | Out-Null
    exit 1
}

$launcher = Join-Path $projectRoot "drive-automation-launcher.ps1"
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "drive-automation-launcher.ps1 is missing."
}

$ownerUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$desktopPrincipal = New-ScheduledTaskPrincipal -UserId $ownerUser -LogonType Interactive -RunLevel Limited
$systemPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 5)

$runAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" run" -WorkingDirectory $projectRoot
$hourlyStart = (Get-Date).AddMinutes(2)
$hourlyTrigger = New-ScheduledTaskTrigger -Once -At $hourlyStart -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $ownerUser
Unregister-ScheduledTask -TaskName "ClassScribeDriveAutomation" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName "ClassScribeDriveDesktopAutomation" `
    -Description "Imports URecorder through the owner's Google Drive desktop session, queues Class Scribe, and exports completed notes to GitHub." `
    -Action $runAction `
    -Trigger @($hourlyTrigger, $logonTrigger) `
    -Principal $desktopPrincipal `
    -Settings $settings `
    -Force | Out-Null

$auditAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" audit" -WorkingDirectory $projectRoot
$auditTrigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Thursday -At "8:00 AM"
Register-ScheduledTask `
    -TaskName "ClassScribeGitHubAudit" `
    -Description "Checks weekly class-note coverage in the four public course repositories." `
    -Action $auditAction `
    -Trigger $auditTrigger `
    -Principal $systemPrincipal `
    -Settings $settings `
    -Force | Out-Null

Write-Host "Installed ClassScribeDriveDesktopAutomation for $ownerUser and ClassScribeGitHubAudit as SYSTEM." -ForegroundColor Green

if ($StartAndVerify) {
    Start-ScheduledTask -TaskName "ClassScribeDriveDesktopAutomation"
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName "ClassScribeDriveDesktopAutomation"
    } while ($task.State -ne "Ready" -and (Get-Date) -lt $deadline)
    $info = Get-ScheduledTaskInfo -TaskName "ClassScribeDriveDesktopAutomation"
    [pscustomobject]@{
        TaskName = "ClassScribeDriveDesktopAutomation"
        State = $task.State.ToString()
        LastRunTime = $info.LastRunTime.ToString("o")
        LastTaskResult = $info.LastTaskResult
        NextRunTime = $info.NextRunTime.ToString("o")
        Principal = $ownerUser
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot "drive-automation-task-status.json") -Encoding UTF8
    if ($task.State -ne "Ready" -or $info.LastTaskResult -ne 0) {
        throw "The unattended verification run failed."
    }
    Write-Host "The unattended verification run passed." -ForegroundColor Green
}

Stop-Transcript | Out-Null
