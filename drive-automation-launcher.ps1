$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $projectRoot ".venv-worker\Scripts\python.exe"
$automation = Join-Path $projectRoot "class_scribe_automation.py"
$mode = if ($args.Count -gt 0) { $args[0] } else { "run" }

if ($mode -notin @("run", "audit")) {
    throw "Automation mode must be run or audit."
}
if (-not (Test-Path -LiteralPath $python)) {
    throw "The worker Python environment is missing."
}
if (-not (Test-Path -LiteralPath $automation)) {
    throw "The Class Scribe automation script is missing."
}

Set-Location -LiteralPath $projectRoot
& $python $automation $mode
exit $LASTEXITCODE
