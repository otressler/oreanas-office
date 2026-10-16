# Runs the tests in tiers. Use a lighter tier while working and `-Tier full` before
# handing work back; full is what CI runs.
#   unit   No Docker, about a minute: the backend's pure tests (Category=Unit) and Vitest.
#   quick  The backend tests without the Slow ones (real-time waits), and Vitest.
#   full   Like CI: every backend test, lint, Vitest, the build and Playwright (mocked API).
# Vitest runs alongside the backend tests in unit and quick.
param(
    [ValidateSet('unit', 'quick', 'full')]
    [string] $Tier = 'quick'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$web = Join-Path $root 'src/web'

function Invoke-Step([string] $Name, [scriptblock] $Step) {
    Write-Host "== $Name" -ForegroundColor Cyan
    & $Step
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed (exit code $LASTEXITCODE)"
    }
}

$backendFilter = switch ($Tier) {
    'unit' { '--filter-trait', 'Category=Unit' }
    'quick' { '--filter-not-trait', 'Category=Slow' }
    'full' { @() }
}

Push-Location $root
try {
    if ($Tier -eq 'full') {
        Invoke-Step 'Backend tests' { dotnet test }
        Invoke-Step 'Lint' { npm --prefix $web run lint }
        Invoke-Step 'Unit tests' { npm --prefix $web test }
        Invoke-Step 'Build web app' { npm --prefix $web run build }
        # Serves the build from the step above instead of building again, as CI does.
        $env:E2E_PREBUILT = '1'
        try {
            Invoke-Step 'End-to-end tests' { npm --prefix $web run test:e2e }
        }
        finally {
            Remove-Item Env:E2E_PREBUILT
        }
        return
    }

    # The last output line is Vitest's exit code.
    $vitest = Start-ThreadJob { npm --prefix $using:web test 2>&1; $LASTEXITCODE }
    try {
        Invoke-Step "Backend tests ($Tier)" { dotnet test @backendFilter }
    }
    finally {
        $output = @(Receive-Job $vitest -Wait -AutoRemoveJob)
        Write-Host '== Unit tests (Vitest)' -ForegroundColor Cyan
        $output | Select-Object -SkipLast 1 | Out-Host
    }
    if ($output[-1] -ne 0) {
        throw "Unit tests (Vitest) failed (exit code $($output[-1]))"
    }
}
finally {
    Pop-Location
}
