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

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
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
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask `
    -TaskName "ClassScribeDriveAutomation" `
    -Description "Imports Monday/Wednesday URecorder audio, queues Class Scribe, and exports completed notes to GitHub." `
    -Action $runAction `
    -Trigger @($hourlyTrigger, $startupTrigger) `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

$auditAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" audit" -WorkingDirectory $projectRoot
$auditTrigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Thursday -At "8:00 AM"
Register-ScheduledTask `
    -TaskName "ClassScribeGitHubAudit" `
    -Description "Checks weekly class-note coverage in the four public course repositories." `
    -Action $auditAction `
    -Trigger $auditTrigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

Write-Host "Installed ClassScribeDriveAutomation and ClassScribeGitHubAudit." -ForegroundColor Green

if ($StartAndVerify) {
    Start-ScheduledTask -TaskName "ClassScribeDriveAutomation"
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName "ClassScribeDriveAutomation"
    } while ($task.State -ne "Ready" -and (Get-Date) -lt $deadline)
    $info = Get-ScheduledTaskInfo -TaskName "ClassScribeDriveAutomation"
    [pscustomobject]@{
        TaskName = "ClassScribeDriveAutomation"
        State = $task.State.ToString()
        LastRunTime = $info.LastRunTime.ToString("o")
        LastTaskResult = $info.LastTaskResult
        NextRunTime = $info.NextRunTime.ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot "drive-automation-task-status.json") -Encoding UTF8
    if ($task.State -ne "Ready" -or $info.LastTaskResult -ne 0) {
        throw "The unattended verification run failed."
    }
    Write-Host "The unattended verification run passed." -ForegroundColor Green
}

Stop-Transcript | Out-Null
