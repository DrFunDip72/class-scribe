[CmdletBinding()]
param(
    [switch]$NoElevate,
    [switch]$RestartRunning
)

$ErrorActionPreference = "Stop"
$taskName = "AudioTranscriberWorker"
$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $workerRoot "worker-launcher.ps1"
$stateRoot = Join-Path $workerRoot ".worker-state"
$installLog = Join-Path $stateRoot "task-install.log"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($NoElevate) {
        throw "Administrator rights are required to register the worker as a SYSTEM startup task."
    }

    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -NoElevate"
    if ($RestartRunning) {
        $arguments += " -RestartRunning"
    }
    $elevated = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    exit $elevated.ExitCode
}

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Worker launcher not found at $launcher"
}

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

try {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $wasRunning = $null -ne $existingTask -and $existingTask.State -eq "Running"

    $actionArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArguments -WorkingDirectory $workerRoot

    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
    $recoveryTrigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650)

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -Hidden `
        -MultipleInstances IgnoreNew `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable `
        -WakeToRun

    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    $triggers = @($startupTrigger, $logonTrigger, $recoveryTrigger)

    $task = New-ScheduledTask `
        -Action $action `
        -Description "Runs and supervises the outbound-only Class Scribe local AI queue worker at boot and on recurring recovery triggers." `
        -Principal $principal `
        -Settings $settings `
        -Trigger $triggers

    Register-ScheduledTask `
        -TaskName $taskName `
        -InputObject $task `
        -Force `
        -ErrorAction Stop | Out-Null

    if ($RestartRunning) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
    }
    elseif (-not $wasRunning) {
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
    }

    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -LiteralPath $installLog -Value "$timestamp Installed SYSTEM startup task." -Encoding UTF8
}
catch {
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -LiteralPath $installLog -Value "$timestamp Task installation failed." -Encoding UTF8
    throw
}
