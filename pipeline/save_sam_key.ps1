$ErrorActionPreference = 'Stop'

$secureKey = Read-Host 'Paste SAM API Key (input is hidden)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey.Length -lt 10) {
        throw 'The API key is empty or unexpectedly short. Nothing was saved.'
    }

    [Environment]::SetEnvironmentVariable('SAM_API_KEY', $plainKey, 'User')
    Write-Host 'SAM_API_KEY saved successfully to the Windows user environment.' -ForegroundColor Green
    Write-Host 'The key was not written to the repository.' -ForegroundColor Green
}
finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    Remove-Variable plainKey -ErrorAction SilentlyContinue
    Remove-Variable secureKey -ErrorAction SilentlyContinue
}
