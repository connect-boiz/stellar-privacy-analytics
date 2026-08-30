param(
    [string]$Owner = "danieloche635-bit",
    [string]$Repo = "ignition-pay",
    [string]$Path,
    [string]$Content,
    [string]$Branch,
    [string]$Message = "chore: update $Path",
    [string]$Sha = ""
)

$bytes = [System.Text.Encoding]::UTF8.GetBytes($Content)
$b64 = [Convert]::ToBase64String($bytes)

$body = @{
    message = $Message
    content = $b64
    branch = $Branch
}

if ($Sha) {
    $body.sha = $Sha
}

$tmpFile = [System.IO.Path]::GetTempFileName()
$body | ConvertTo-Json -Compress | Set-Content -Path $tmpFile -Encoding UTF8

$result = gh api "repos/$Owner/$Repo/contents/$Path" --method PUT --input $tmpFile --jq '.content.sha' 2>&1

Remove-Item $tmpFile -Force
Write-Output $result
