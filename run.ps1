<#
    Buyer Hunter / 黔脉 QianPulse — unified entry point (Windows PowerShell).

    .\run.ps1 -Setup     install python + node deps
    .\run.ps1 -Build     build the decision store from the committed fixture
    .\run.ps1 -Export    bridge the store into the agent runtime feed + import agent outcomes back
    .\run.ps1 -Up        build + export + import, then run site + api + agent in background
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
    [int]$SitePort = 4180
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Py = if ($env:PY) { $env:PY } else { 'python' }
$PidFile = Join-Path $Root '.run-pids.json'

function Invoke-Db {
    & $Py (Join-Path $Root 'pipeline\build_opportunity_store_v1.py')
    if ($LASTEXITCODE -ne 0) { throw "build_opportunity_store failed ($LASTEXITCODE)" }
}

function Invoke-Export {
    & $Py (Join-Path $Root 'scripts\export_opportunities_for_agent.py')
    if ($LASTEXITCODE -ne 0) { throw "export failed ($LASTEXITCODE)" }
}

function Invoke-Import {
    # reverse bridge: A6 outcomes + A2 targets -> decision store (idempotent;
    # re-runs after every rebuild because the builder does a full atomic replace)
    & $Py (Join-Path $Root 'scripts\import_agent_outcomes.py')
    if ($LASTEXITCODE -ne 0) { throw "import failed ($LASTEXITCODE)" }
}

if ($Setup) {
    & $Py -m pip install -r (Join-Path $Root 'requirements.txt')
    Push-Location (Join-Path $Root 'agent'); npm ci; Pop-Location
    return
}

if ($Build)  { Invoke-Db; return }
if ($Export) { Invoke-Db; Invoke-Export; Invoke-Import; return }

if ($Test) {
    & $Py -m pytest -q
    $pyOk = $LASTEXITCODE -eq 0
    Push-Location (Join-Path $Root 'agent'); npm test; $nodeOk = $LASTEXITCODE -eq 0; Pop-Location
    if ($pyOk -and $nodeOk) { Write-Host "`nALL GREEN" -ForegroundColor Green }
    else { Write-Host "`nFAILURES (py=$pyOk node=$nodeOk)" -ForegroundColor Red; exit 1 }
    return
}

if ($Audit) {
    & $Py (Join-Path $Root 'scripts\audit.py')
    return
}

if ($Down) {
    if (Test-Path $PidFile) {
        (Get-Content $PidFile -Raw | ConvertFrom-Json) | ForEach-Object {
            if (Get-Process -Id $_ -ErrorAction SilentlyContinue) {
                & taskkill.exe /F /T /PID $_ *> $null
                Write-Host "stopped pid $_ (+ children)"
            } else { Write-Host "pid $_ already gone" }
        }
        Remove-Item $PidFile
    } else { Write-Host 'no .run-pids.json' }
    # safety net: free any of the three ports still held (e.g. a re-parented child)
    foreach ($port in @($SitePort, $ApiPort, $AgentPort)) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
                & taskkill.exe /F /T /PID $_ *> $null
                Write-Host "freed port $port (pid $_)"
            }
    }
    return
}

function Assert-PortsFree {
    param([int[]]$Ports)
    $held = @()
    foreach ($port in $Ports) {
        $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty OwningProcess -Unique
        if ($owner) {
            $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
            $held += "  port $port held by pid $owner ($name)"
        }
    }
    if ($held.Count -gt 0) {
        Write-Host "Ports already in use - aborting (otherwise the stack silently serves a STALE build):" -ForegroundColor Red
        $held | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        Write-Host "`nRun first:  .\run.ps1 -Down" -ForegroundColor Yellow
        exit 1
    }
}

if ($Up) {
    # A stale listener silently wins the port and the freshly spawned process
    # dies on EADDRINUSE — the stack then serves an old build. Fail loudly.
    Assert-PortsFree @($SitePort, $ApiPort, $AgentPort)
    Invoke-Db
    Invoke-Export
    Invoke-Import
    $site = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList '-m','http.server',"$SitePort",'--bind','127.0.0.1','--directory',(Join-Path $Root 'site')
    $api = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList '-m','uvicorn','api.app:app','--host','127.0.0.1','--port',"$ApiPort"
    $env:PORT = "$AgentPort"
    $agent = Start-Process -PassThru -WorkingDirectory (Join-Path $Root 'agent') 'node' `
        -ArgumentList 'server\bootstrap.js'
    @($site.Id, $api.Id, $agent.Id) | ConvertTo-Json | Set-Content $PidFile -Encoding utf8
    Write-Host ""
    Write-Host "site  -> http://127.0.0.1:$SitePort   (pid $($site.Id))   <- front door"
    Write-Host "api   -> http://127.0.0.1:$ApiPort   (pid $($api.Id))"
    Write-Host "agent -> http://127.0.0.1:$AgentPort   (pid $($agent.Id))   <- workbench"
    Write-Host "`nstop with:  .\run.ps1 -Down"
    return
}

Write-Host "usage: .\run.ps1 [-Setup|-Build|-Export|-Up|-Down|-Test|-Audit]"
