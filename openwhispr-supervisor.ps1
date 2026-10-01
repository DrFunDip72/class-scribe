$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateRoot = Join-Path $root ".openwhispr-state"
$logPath = Join-Path $stateRoot "supervisor.log"
$lockPath = Join-Path $stateRoot "supervisor.lock"
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$dockerCli = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$containerName = "openwhispr-speaches"
$healthUrl = "http://100.79.197.76:8000/v1/models"
$healthBindAddress = "100.79.197.76"
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

function Wait-BindAddress {
    # compose.yaml publishes the API on the Tailscale address rather than every
    # interface. Docker resolves that host address once, when the container
    # starts, so the address has to exist before the container comes up.
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if (@(Get-NetIPAddress -IPAddress $healthBindAddress -ErrorAction SilentlyContinue).Count -gt 0) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
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

    if (-not (Wait-BindAddress)) {
        Write-SupervisorLog "The bind address $healthBindAddress never appeared; Tailscale is not up."
        exit 7
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
    else {
        # The container is up but the health check above still failed. On a boot
        # where the container beat Tailscale to the bind address, Docker dropped
        # the port publish and the API is only reachable from inside the
        # container. Starting an already-running container does not republish the
        # port, so recover with a restart now that the address exists.
        $uptimeSeconds = [double]::MaxValue
        try {
            $startedAt = [datetime](& $dockerCli container inspect --format "{{.State.StartedAt}}" $containerName 2>$null)
            $uptimeSeconds = ((Get-Date).ToUniversalTime() - $startedAt.ToUniversalTime()).TotalSeconds
        }
        catch {
            # An unreadable timestamp should not block recovery.
        }

        if ($uptimeSeconds -lt 60) {
            # A container this young is still booting. Fall through to the
            # readiness loop so a cold start is not mistaken for a lost binding
            # and restarted in a loop.
            Write-SupervisorLog "The container started recently; waiting for it to finish booting."
        }
        else {
            Write-SupervisorLog "The container is running but unreachable; restarting it to republish the port."
            & $dockerCli container restart $containerName *> $null
            if ($LASTEXITCODE -ne 0) {
                Write-SupervisorLog "The OpenWhispr container did not restart."
                exit 5
            }
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
