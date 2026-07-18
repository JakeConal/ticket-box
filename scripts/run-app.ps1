[CmdletBinding()]
param(
    [ValidateSet("platform", "checker", "all", "stop")]
    [string]$Target = "platform",
    [switch]$NoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Assert-LastExitCode {
    param([Parameter(Mandatory = $true)][string]$Action)

    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE."
    }
}

function Start-WslKeepAlive {
    & wsl.exe sh -lc "pgrep -f '^ticketbox-wsl-keepalive infinity$' >/dev/null"
    if ($LASTEXITCODE -eq 0) {
        return
    }

    Start-Process `
        -FilePath "wsl.exe" `
        -ArgumentList @("--exec", "bash", "-c", '"exec -a ticketbox-wsl-keepalive sleep infinity"') `
        -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 1
}

function Stop-WslKeepAlive {
    if (Get-Command "wsl.exe" -ErrorAction SilentlyContinue) {
        & wsl.exe sh -lc "pkill -f '^ticketbox-wsl-keepalive infinity$' >/dev/null 2>&1 || true"
    }
}

function Invoke-DockerCompose {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$KeepWslAlive
    )

    if (Get-Command "docker" -ErrorAction SilentlyContinue) {
        & docker compose @Arguments
        Assert-LastExitCode "Docker Compose command"
        return
    }

    Assert-Command "wsl.exe"
    if ($KeepWslAlive) {
        Start-WslKeepAlive
    }

    & wsl.exe docker version --format "{{.Server.Version}}" | Out-Null
    Assert-LastExitCode "Docker Engine check in WSL"

    if ($repoRoot -notmatch "^([A-Za-z]):\\(.*)$") {
        throw "Cannot translate repository path '$repoRoot' for WSL."
    }

    $drive = $Matches[1].ToLowerInvariant()
    $relativePath = $Matches[2].Replace("\", "/")
    $wslRepoRoot = "/mnt/$drive/$relativePath"

    $composeCommand = "cd '$wslRepoRoot' && docker compose " + ($Arguments -join " ")
    & wsl.exe sh -lc $composeCommand
    Assert-LastExitCode "Docker Compose command in WSL"
}

Push-Location $repoRoot

try {
    if ($Target -eq "stop") {
        Invoke-DockerCompose -Arguments @("down")
        Stop-WslKeepAlive
        Write-Host "TicketBox platform stopped."
        return
    }

    if ($Target -in @("platform", "all")) {
        $composeArguments = @("compose", "up", "-d")
        if (-not $NoBuild) {
            $composeArguments += "--build"
        }

        Invoke-DockerCompose -Arguments ($composeArguments | Select-Object -Skip 1) -KeepWslAlive

        Write-Host ""
        Write-Host "TicketBox platform is starting:"
        Write-Host "  Web:   http://localhost:8088"
        Write-Host "  Admin: http://localhost:8088/admin/login"
        Write-Host "  API:   http://localhost:8088/api/health"
    }

    if ($Target -in @("checker", "all")) {
        Assert-Command "node"
        Assert-Command "corepack"

        $checkerEnv = Join-Path $repoRoot "ticketbox-checker\.env"
        $checkerEnvExample = Join-Path $repoRoot "ticketbox-checker\.env.example"

        if (-not (Test-Path -LiteralPath $checkerEnv)) {
            Copy-Item -LiteralPath $checkerEnvExample -Destination $checkerEnv
            Write-Host "Created ticketbox-checker/.env from .env.example."
        }

        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "ticketbox-checker\node_modules"))) {
            & corepack pnpm install
            Assert-LastExitCode "Dependency installation"
        }

        Write-Host ""
        Write-Host "Opening TicketBox Checker on the Android emulator..."
        & corepack pnpm --filter ticketbox-checker android
        Assert-LastExitCode "Expo Android startup"
    }
}
finally {
    Pop-Location
}
