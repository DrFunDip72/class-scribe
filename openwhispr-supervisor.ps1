$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateRoot = Join-Path $root ".openwhispr-state"
$logPath = Join-Path $stateRoot "supervisor.log"
$lockPath = Join-Path $stateRoot "supervisor.lock"
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$dockerCli = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$containerName = "openwhispr-speaches"
$healthUrl = "http://100.79.197.76:8000/v1/models"
$requiredModel = "Systran/faster-whisper-base.en"

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

function Write-SupervisorLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
        Move-Item -LiteralPath $logPath -Destination "$logPath.previous" -Force
    }
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -LiteralPath $logPath -Value "$timestamp $Message" -Encoding UTF8
}

function Test-DockerReady {
    if (-not (Test-Path -LiteralPath $dockerCli)) {
        return $false
    }

    try {
        & $dockerCli info --format "{{.ServerVersion}}" *> $null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Test-OpenWhisprReady {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 8
        return @($response.data | Where-Object { $_.id -eq $requiredModel }).Count -gt 0
    }
    catch {
        return $false
    }
}

try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
}
catch [System.IO.IOException] {
    exit 0
}

try {
    if (Test-OpenWhisprReady) {
        exit 0
    }
    if (-not (Test-Path -LiteralPath $dockerDesktop) -or -not (Test-Path -LiteralPath $dockerCli)) {
        Write-SupervisorLog "Docker Desktop or its CLI is missing."
        exit 2
    }

    if (-not (Test-DockerReady)) {
        Write-SupervisorLog "Docker is unavailable; starting Docker Desktop."
        Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null

        $dockerReady = $false
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            Start-Sleep -Seconds 2
            if (Test-DockerReady) {
                $dockerReady = $true
                break
            }
        }
        if (-not $dockerReady) {
            Write-SupervisorLog "Docker did not become ready before the recovery timeout."
            exit 3
        }
        Write-SupervisorLog "Docker is ready."
    }

    $containerId = (& $dockerCli container inspect --format "{{.Id}}" $containerName 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        Write-SupervisorLog "The OpenWhispr container is missing."
        exit 4
    }

    $containerState = (& $dockerCli container inspect --format "{{.State.Status}}" $containerName 2>$null)
    if ($containerState -ne "running") {
        Write-SupervisorLog "Starting the OpenWhispr container."
        & $dockerCli container start $containerName *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-SupervisorLog "The OpenWhispr container did not start."
            exit 5
        }
    }

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-OpenWhisprReady) {
            Write-SupervisorLog "OpenWhispr API is ready."
            exit 0
        }
        Start-Sleep -Seconds 2
    }

    Write-SupervisorLog "OpenWhispr API did not become ready before the recovery timeout."
    exit 6
}
finally {
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
}
