<#
    Buyer Hunter / 黔脉 QianPulse — unified entry point (Windows PowerShell).

    .\run.ps1 -Setup     install python + node deps
    .\run.ps1 -Build     build the decision store from the committed fixture
    .\run.ps1 -Export    bridge the store into the agent runtime feed + import agent outcomes back
    .\run.ps1 -Up        build + export + import, then run site + api + agent + demo in background
    .\run.ps1 -Down      stop the background services started by -Up
    .\run.ps1 -Test      pytest + agent npm test
    .\run.ps1 -Audit     cross-runtime audit -> docs\AUDIT_<date>.md
#>
[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$Build,
    [switch]$Export,
    [switch]$Up,
    [switch]$Down,
    [switch]$Test,
    [switch]$Audit,
    [int]$ApiPort = 8000,
    [int]$AgentPort = 3317,
    [int]$DemoPort = 4173,
    [int]$SitePort = 4180
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Test-PythonCommand([string]$Command, [string[]]$Arguments = @()) {
    if (-not $Command) { return $false }
    try {
        & $Command @Arguments --version *> $null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Resolve-Python {
    # Explicit configuration wins, and is also propagated to Node subprocesses.
    foreach ($configured in @($env:PY, $env:PYTHON_BIN)) {
        if ($configured -and (Test-PythonCommand $configured)) {
            return @{ Command = $configured; Arguments = @() }
        }
    }

    $pathPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pathPython -and (Test-PythonCommand $pathPython.Source)) {
        return @{ Command = $pathPython.Source; Arguments = @() }
    }

    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyLauncher -and (Test-PythonCommand $pyLauncher.Source @('-3'))) {
        return @{ Command = $pyLauncher.Source; Arguments = @('-3') }
    }

    # Last resort: Codex's user-scoped bundled Python runtime.
    $codexRoots = @(
        (Join-Path $env:USERPROFILE '.codex'),
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes')
    )
    $bundled = foreach ($codexRoot in $codexRoots) {
        if (Test-Path $codexRoot) {
            $found = Get-ChildItem -LiteralPath $codexRoot -Filter python.exe -File -Recurse -ErrorAction SilentlyContinue |
                Select-Object -First 1 -ExpandProperty FullName
            if ($found) { $found; break }
        }
    }
    if ($bundled -and (Test-PythonCommand $bundled)) {
        return @{ Command = $bundled; Arguments = @() }
    }

    throw 'Python not found. Set the PY environment variable to a Python executable and retry.'
}

$Python = Resolve-Python
$Py = $Python.Command
$PyArgs = @($Python.Arguments)
$env:PYTHON_BIN = $Py
$PidFile = Join-Path $Root '.run-pids.json'

function Invoke-Db {
    & $Py @PyArgs (Join-Path $Root 'pipeline\build_opportunity_store_v1.py')
    if ($LASTEXITCODE -ne 0) { throw "build_opportunity_store failed ($LASTEXITCODE)" }
}

function Invoke-Export {
    & $Py @PyArgs (Join-Path $Root 'scripts\export_opportunities_for_agent.py')
    if ($LASTEXITCODE -ne 0) { throw "export failed ($LASTEXITCODE)" }
}

function Invoke-Import {
    # reverse bridge: A6 outcomes + A2 targets -> decision store (idempotent;
    # re-runs after every rebuild because the builder does a full atomic replace)
    & $Py @PyArgs (Join-Path $Root 'scripts\import_agent_outcomes.py')
    if ($LASTEXITCODE -ne 0) { throw "import failed ($LASTEXITCODE)" }
}

if ($Setup) {
    & $Py @PyArgs -m pip install -r (Join-Path $Root 'requirements.txt')
    Push-Location (Join-Path $Root 'agent'); npm ci; Pop-Location
    Push-Location (Join-Path $Root 'demo'); npm ci; Pop-Location
    return
}

if ($Build)  { Invoke-Db; return }
if ($Export) { Invoke-Db; Invoke-Export; Invoke-Import; return }

if ($Test) {
    & $Py @PyArgs -m pytest -q
    $pyOk = $LASTEXITCODE -eq 0
    Push-Location (Join-Path $Root 'agent'); npm test; $nodeOk = $LASTEXITCODE -eq 0; Pop-Location
    if ($pyOk -and $nodeOk) { Write-Host "`nALL GREEN" -ForegroundColor Green }
    else { Write-Host "`nFAILURES (py=$pyOk node=$nodeOk)" -ForegroundColor Red; exit 1 }
    return
}

if ($Audit) {
    & $Py @PyArgs (Join-Path $Root 'scripts\audit.py')
    return
}

if ($Down) {
    # taskkill /T because the demo runs under cmd.exe -> npm -> vite; Stop-Process
    # would kill only the wrapper and orphan the vite server on $DemoPort.
    if (Test-Path $PidFile) {
        (Get-Content $PidFile -Raw | ConvertFrom-Json) | ForEach-Object {
            if (Get-Process -Id $_ -ErrorAction SilentlyContinue) {
                & taskkill.exe /F /T /PID $_ *> $null
                Write-Host "stopped pid $_ (+ children)"
            } else { Write-Host "pid $_ already gone" }
        }
        Remove-Item $PidFile
    } else { Write-Host 'no .run-pids.json' }
    # safety net: free any of the four ports still held (e.g. a re-parented child)
    foreach ($port in @($SitePort, $DemoPort, $ApiPort, $AgentPort)) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
                & taskkill.exe /F /T /PID $_ *> $null
                Write-Host "freed port $port (pid $_)"
            }
    }
    return
}

if ($Up) {
    Invoke-Db
    Invoke-Export
    Invoke-Import
    $site = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList ($PyArgs + @('-m','http.server',"$SitePort",'--bind','127.0.0.1','--directory',(Join-Path $Root 'site')))
    $api = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList ($PyArgs + @('-m','uvicorn','api.app:app','--host','127.0.0.1','--port',"$ApiPort"))
    $env:PORT = "$AgentPort"
    $agent = Start-Process -PassThru -WorkingDirectory (Join-Path $Root 'agent') 'node' `
        -ArgumentList 'server\bootstrap.js'
    # npm is npm.cmd on Windows; Start-Process needs a real executable, so go via cmd.
    $demo = Start-Process -PassThru -WorkingDirectory (Join-Path $Root 'demo') 'cmd.exe' `
        -ArgumentList '/c', "npm run dev -- --host 127.0.0.1 --port $DemoPort"
    @($site.Id, $api.Id, $agent.Id, $demo.Id) | ConvertTo-Json | Set-Content $PidFile -Encoding utf8
    Write-Host ""
    Write-Host "site  -> http://127.0.0.1:$SitePort   (pid $($site.Id))   <- front door"
    Write-Host "demo  -> http://127.0.0.1:$DemoPort   (pid $($demo.Id))   <- app / workbench"
    Write-Host "api   -> http://127.0.0.1:$ApiPort   (pid $($api.Id))"
    Write-Host "agent -> http://127.0.0.1:$AgentPort   (pid $($agent.Id))"
    Write-Host "`nstop with:  .\run.ps1 -Down"
    return
}

Write-Host "usage: .\run.ps1 [-Setup|-Build|-Export|-Up|-Down|-Test|-Audit]"
