$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'telegram-webhook.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -or ($ast.ParamBlock.Parameters.Name.VariablePath.UserPath -join ',') -ne 'Register,FromClipboard') { throw 'Invalid syntax or credential argument exposed' }

# All input, clipboard and HTTP operations are mocked. No real secret or API call.
function Read-Host {
    param($Prompt, [switch]$AsSecureString)
    $global:TelegramWebhookTest.prompts++
    if ($AsSecureString) {
        $value = if ($Prompt -like '*token*') { '123456:fake_test_token' } else { 'fake_test_secret' }
        return ConvertTo-SecureString $value -AsPlainText -Force
    }
    return ''
}
function Get-Clipboard {
    param([switch]$Raw)
    $global:TelegramWebhookTest.reads++
    if ($global:TelegramWebhookTest.reads -eq 1) { return "123456:fake_test_token`r`n" }
    return "fake_test_secret`r`n"
}
function Set-Clipboard {
    param($Value)
    if ($null -ne $Value) { throw 'Clipboard was not cleared' }
    $global:TelegramWebhookTest.clears++
}
function Invoke-RestMethod {
    param($Method, $Uri, $TimeoutSec, $ContentType, $Body)
    $global:TelegramWebhookTest.http++
    if ($Uri -notlike 'https://api.telegram.org/bot123456:fake_test_token/*') { throw 'Unexpected token source' }
    if ($global:TelegramWebhookTest.fail) { throw "HTTP failure containing $Uri fake_test_secret" }
    if ($Method -eq 'Post') {
        $bodyData = $Body | ConvertFrom-Json
        if ($bodyData.secret_token -ne 'fake_test_secret' -or $bodyData.url -ne 'https://mutanocontas.vercel.app/api/telegram/webhook' -or ($bodyData.allowed_updates -join ',') -ne 'message,callback_query' -or $bodyData.drop_pending_updates -ne $false) { throw 'Invalid registration payload' }
        $global:TelegramWebhookTest.posts++
        return @{ ok = $true; result = $true }
    }
    return @{ ok = $true; result = @{ url = 'https://mutanocontas.vercel.app/api/telegram/webhook'; allowed_updates = @('message', 'callback_query'); pending_update_count = 2 } }
}

$savedToken = $env:TG_BOT_TOKEN
$savedSecret = $env:TG_WEBHOOK_SECRET
try {
    foreach ($mode in @('masked', 'environment', 'mixed', 'clipboard', 'clipboard-check', 'clipboard-error')) {
        $env:TG_BOT_TOKEN = $null
        $env:TG_WEBHOOK_SECRET = $null
        $global:TelegramWebhookTest = @{ prompts = 0; reads = 0; clears = 0; http = 0; posts = 0; fail = ($mode -eq 'clipboard-error') }
        $options = @{ Register = ($mode -ne 'clipboard-check'); FromClipboard = $mode.StartsWith('clipboard') }
        if ($mode -eq 'environment' -or $mode -eq 'mixed') { $env:TG_BOT_TOKEN = '123456:fake_test_token' }
        if ($mode -eq 'environment') { $env:TG_WEBHOOK_SECRET = 'fake_test_secret' }
        if ($mode.StartsWith('clipboard')) { $env:TG_BOT_TOKEN = 'wrong'; $env:TG_WEBHOOK_SECRET = 'wrong' }
        $output = & $target @options
        if (($output -join "`n") -match 'fake_test_token|fake_test_secret') { throw "Secret leaked in $mode" }
        $state = $global:TelegramWebhookTest
        $expectedPosts = if ($mode -in @('clipboard-error', 'clipboard-check')) { 0 } else { 1 }
        if ($state.posts -ne $expectedPosts) { throw "Wrong HTTP writes in $mode" }
        if ($mode.StartsWith('clipboard')) {
            $expectedReads = if ($mode -in @('clipboard-error', 'clipboard-check')) { 1 } else { 2 }
            if ($state.clears -ne 1 -or $state.reads -ne $expectedReads -or $state.prompts -ne $expectedReads) { throw "Wrong clipboard lifecycle in $mode" }
        } elseif ($state.clears -ne 0 -or $state.reads -ne 0) { throw 'Unexpected clipboard access' }
        if ($mode -eq 'environment' -and $state.prompts -ne 0) { throw 'Environment mode prompted for input' }
        if ($mode -eq 'mixed' -and $state.prompts -ne 1) { throw 'Missing masked fallback' }
        if ($mode -eq 'clipboard-error') {
            if (($output -join '') -notlike '*Falha ao verificar*') { throw 'Missing safe failure notice' }
        } elseif ($options.Register -and ($output -join '') -notlike '*Verificado:*') { throw "Missing verification in $mode" }
        Write-Output "PASS: $mode"
    }
} finally {
    $env:TG_BOT_TOKEN = $savedToken
    $env:TG_WEBHOOK_SECRET = $savedSecret
    Remove-Variable TelegramWebhookTest -Scope Global -ErrorAction SilentlyContinue
}
