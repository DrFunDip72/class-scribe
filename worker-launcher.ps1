$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$workerPython = Join-Path $workerRoot ".venv-worker\Scripts\python.exe"
$workerScript = Join-Path $workerRoot "worker.py"

if ((Test-Path -LiteralPath $ollamaExe) -and -not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
}

if ((Test-Path -LiteralPath $workerPython) -and (Test-Path -LiteralPath $workerScript)) {
    & $workerPython $workerScript
}
