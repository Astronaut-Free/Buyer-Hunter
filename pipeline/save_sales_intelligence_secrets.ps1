$ErrorActionPreference = "Stop"

function Save-HiddenUserSecret {
    param([Parameter(Mandatory = $true)][string]$Name)
    $secure = Read-Host "Paste $Name (input is hidden; press Enter to skip)" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        if (-not [string]::IsNullOrWhiteSpace($plain)) {
            [Environment]::SetEnvironmentVariable($Name, $plain.Trim(), "User")
            Write-Host "$Name saved to the Windows user environment."
        }
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        $plain = $null
    }
}

Save-HiddenUserSecret -Name "APOLLO_API_KEY"
Save-HiddenUserSecret -Name "VOLZA_API_TOKEN"
Save-HiddenUserSecret -Name "TRADEMO_API_KEY"
Save-HiddenUserSecret -Name "CLAY_WEBHOOK_TOKEN"

$trademoBase = Read-Host "TRADEMO_API_BASE_URL from vendor contract (press Enter to skip)"
if (-not [string]::IsNullOrWhiteSpace($trademoBase)) {
    [Environment]::SetEnvironmentVariable("TRADEMO_API_BASE_URL", $trademoBase.Trim(), "User")
}
$trademoHealth = Read-Host "TRADEMO_HEALTH_PATH from vendor contract (press Enter to skip)"
if (-not [string]::IsNullOrWhiteSpace($trademoHealth)) {
    [Environment]::SetEnvironmentVariable("TRADEMO_HEALTH_PATH", $trademoHealth.Trim(), "User")
}
$clayWebhook = Read-Host "CLAY_WEBHOOK_URL (press Enter to skip)"
if (-not [string]::IsNullOrWhiteSpace($clayWebhook)) {
    [Environment]::SetEnvironmentVariable("CLAY_WEBHOOK_URL", $clayWebhook.Trim(), "User")
}

Write-Host "Saved values were not written to the repository. Open a new terminal, then run:"
Write-Host "python .\pipeline\sales_intelligence_connectors_v1.py --health"
