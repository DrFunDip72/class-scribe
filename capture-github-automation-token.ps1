$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$secretRoot = Join-Path $projectRoot ".worker-secrets"
$tokenPath = Join-Path $secretRoot "github-course-export.token"
$expectedOwner = "DrFunDip72"
$repositories = @("HRM-391", "PSE-390", "STRAT-392", "PHIL-201")

New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null

Write-Host "Class Scribe GitHub automation setup" -ForegroundColor Cyan
Write-Host "Paste the fine-grained token below. It will not be displayed."
$secureToken = Read-Host "GitHub token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "No token was entered."
    }

    $headers = @{
        Authorization = "Bearer $token"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "Class-Scribe-Automation"
    }

    $profile = Invoke-RestMethod -Method Get -Uri "https://api.github.com/user" -Headers $headers
    if ($profile.login -ne $expectedOwner) {
        throw "The token belongs to '$($profile.login)', not '$expectedOwner'."
    }

    foreach ($repository in $repositories) {
        $null = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$expectedOwner/$repository" -Headers $headers
    }

    [IO.File]::WriteAllText($tokenPath, $token, [Text.UTF8Encoding]::new($false))
    icacls $tokenPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" "SYSTEM:(F)" "Administrators:(F)" | Out-Null

    Write-Host ""
    Write-Host "Success: repository access was verified and the token was stored securely." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path -LiteralPath $tokenPath) {
        Remove-Item -LiteralPath $tokenPath -Force
    }
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $token = $null
}

Write-Host ""
Read-Host "Press Enter to close"
