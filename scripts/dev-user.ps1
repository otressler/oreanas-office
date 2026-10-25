<#
.SYNOPSIS
Creates a local account on the development backend (scripts/dev.ps1), without Google or an admin.

.DESCRIPTION
Asks the backend's development-only invite endpoint (/api/testing/invites, mapped only in
the Development and E2E environments) for an invite and registers through the normal
/api/auth/register, so the usual password rules apply. Run it while dev.ps1 is up. An
account that exists already is left alone. Dev accounts are never admin: only the
configured admin address signing in with Google is (knowledge/decisions/auth.md).

.EXAMPLE
pwsh scripts/dev-user.ps1
Creates "Oreana" (oreana@dev.local, password dev-passwort).

.EXAMPLE
pwsh scripts/dev-user.ps1 -Name Mira,Brom
Creates mira@dev.local and brom@dev.local, both with the default password.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    # Display names, also comma-separated; each gets <name>@dev.local unless -Email is
    # given (one name only).
    [string[]] $Name = @('Oreana'),
    [string] $Email,
    # At least 8 characters.
    [string] $Password = 'dev-passwort',
    [string] $BaseUrl = 'http://localhost:5080'
)
$ErrorActionPreference = 'Stop'

# From the command line "-Name Mira,Brom" arrives as one string.
$Name = @($Name -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if ($Email -and $Name.Count -gt 1) {
    throw '-Email works with a single -Name only.'
}

try {
    $invite = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/testing/invites"
}
catch {
    throw "No invite from $BaseUrl. Is scripts/dev.ps1 running (Development environment)? $($_.Exception.Message)"
}
$token = ($invite.url -split '/')[-1]

foreach ($displayName in $Name) {
    $address = if ($Email) { $Email } else { "$($displayName.ToLowerInvariant())@dev.local" }
    $body = @{ inviteToken = $token; displayName = $displayName; email = $address; password = $Password } |
        ConvertTo-Json
    try {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/auth/register" -ContentType 'application/json' -Body $body |
            Out-Null
        Write-Host "Created $displayName <$address>, password: $Password"
    }
    catch {
        $code = try { ($_.ErrorDetails.Message | ConvertFrom-Json).code } catch { $null }
        if ($code -eq 'emailTaken') {
            Write-Host "$address exists already; left as it is."
        }
        else {
            throw "Registering $address failed: $($_.ErrorDetails.Message ?? $_.Exception.Message)"
        }
    }
}
