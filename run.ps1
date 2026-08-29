<#
    Buyer Hunter / 黔脉 QianPulse — unified entry point (Windows PowerShell).

    .\run.ps1 -Setup     install python + node deps
    .\run.ps1 -Build     build the decision store from the committed fixture
    .\run.ps1 -Export    bridge the store into the agent runtime feed
    .\run.ps1 -Up        build + export, then run site + api + agent + demo in background
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

if ($Setup) {
    & $Py -m pip install -r (Join-Path $Root 'requirements.txt')
    Push-Location (Join-Path $Root 'agent'); npm ci; Pop-Location
    Push-Location (Join-Path $Root 'demo'); npm ci; Pop-Location
    return
}

if ($Build)  { Invoke-Db; return }
if ($Export) { Invoke-Db; Invoke-Export; return }

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
            try { Stop-Process -Id $_ -Force -ErrorAction Stop; Write-Host "stopped pid $_" }
            catch { Write-Host "pid $_ already gone" }
        }
        Remove-Item $PidFile
    } else { Write-Host 'no .run-pids.json; nothing to stop' }
    return
}

if ($Up) {
    Invoke-Db
    Invoke-Export
    $site = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList '-m','http.server',"$SitePort",'--bind','127.0.0.1','--directory',(Join-Path $Root 'site')
    $api = Start-Process -PassThru -WorkingDirectory $Root $Py `
        -ArgumentList '-m','uvicorn','api.app:app','--host','127.0.0.1','--port',"$ApiPort"
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
