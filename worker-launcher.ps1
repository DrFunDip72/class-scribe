$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ownerProfile = Split-Path -Parent (Split-Path -Parent $workerRoot)
$ollamaExe = Join-Path $ownerProfile "AppData\Local\Programs\Ollama\ollama.exe"
$ollamaModels = Join-Path $ownerProfile ".ollama\models"
$workerPython = Join-Path $workerRoot ".venv-worker\Scripts\python.exe"
$workerScript = Join-Path $workerRoot "worker.py"
$stateRoot = Join-Path $workerRoot ".worker-state"
$launcherLog = Join-Path $stateRoot "worker-launcher.log"
$launcherLock = Join-Path $stateRoot "worker-launcher.lock"
$ollamaTagsUrl = "http://127.0.0.1:11434/api/tags"

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

function Write-LauncherLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    if ((Test-Path -LiteralPath $launcherLog) -and (Get-Item -LiteralPath $launcherLog).Length -gt 1MB) {
        Move-Item -LiteralPath $launcherLog -Destination "$launcherLog.previous" -Force
    }
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -LiteralPath $launcherLog -Value "$timestamp $Message" -Encoding UTF8
}

function Test-OllamaReady {
    try {
        $null = Invoke-RestMethod -Uri $ollamaTagsUrl -Method Get -TimeoutSec 5
        return $true
    }
    catch {
        return $false
    }
}

try {
    $lockStream = [System.IO.File]::Open(
        $launcherLock,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
}
catch [System.IO.IOException] {
    exit 0
}

try {
    if (-not (Test-Path -LiteralPath $workerPython)) {
        Write-LauncherLog "Worker virtual environment is missing."
        exit 2
    }
    if (-not (Test-Path -LiteralPath $workerScript)) {
        Write-LauncherLog "Worker script is missing."
        exit 2
    }
    if (-not (Test-Path -LiteralPath $ollamaExe)) {
        Write-LauncherLog "Ollama executable is missing."
        exit 2
    }

    # A SYSTEM task has a different user profile. Point Ollama at the owner's
    # existing local model store so an unattended boot does not redownload it.
    if (Test-Path -LiteralPath $ollamaModels) {
        $env:OLLAMA_MODELS = $ollamaModels
    }
    $env:OLLAMA_HOST = "127.0.0.1:11434"
    Set-Location -LiteralPath $workerRoot
    Write-LauncherLog "Supervisor started."

    while ($true) {
        if (-not (Test-OllamaReady)) {
            Write-LauncherLog "Starting Ollama."
            try {
                Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden | Out-Null
            }
            catch {
                Write-LauncherLog "Ollama launch failed; retrying."
            }

            $ready = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Seconds 2
                if (Test-OllamaReady) {
                    $ready = $true
                    break
                }
            }
            if (-not $ready) {
                Write-LauncherLog "Ollama did not become ready; retrying."
                Start-Sleep -Seconds 15
                continue
            }
        }

        Write-LauncherLog "Starting queue worker."
        try {
            & $workerPython $workerScript
            $workerExitCode = $LASTEXITCODE
            Write-LauncherLog "Queue worker exited with code $workerExitCode; restarting."
        }
        catch {
            Write-LauncherLog "Queue worker launch failed; restarting."
        }
        Start-Sleep -Seconds 15
    }
}
finally {
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
}
