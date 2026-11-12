param([switch]$Register)

# Secrets are entered masked, kept in memory, and never printed or passed as CLI args.
$ErrorActionPreference = 'Stop'
$webhookUrl = 'https://mutanocontas.vercel.app/api/telegram/webhook'
$telegramToken = $null
$webhookSecret = $null
try {
    $telegramToken = [System.Net.NetworkCredential]::new('', (Read-Host 'Token do bot (entrada oculta)' -AsSecureString)).Password
    if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'invalid_token' }
    $apiUrl = 'https://api.telegram.org/bot' + $telegramToken
    $before = Invoke-RestMethod -Method Get -Uri ($apiUrl + '/getWebhookInfo') -TimeoutSec 15
    if (-not $before.ok) { throw 'webhook_info_failed' }
    Write-Output ('Antes: ' + (@{ production_url_matches = ($before.result.url -eq $webhookUrl); allowed_updates = $before.result.allowed_updates; pending_update_count = $before.result.pending_update_count } | ConvertTo-Json -Compress))

    if ($Register) {
        if ($before.result.url -and $before.result.url -ne $webhookUrl) { throw 'unexpected_webhook_url' }
        $webhookSecret = [System.Net.NetworkCredential]::new('', (Read-Host 'Mesmo TELEGRAM_WEBHOOK_SECRET ja configurado na Vercel (entrada oculta)' -AsSecureString)).Password
        if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{1,256}$') { throw 'invalid_secret' }
        $payload = @{ url = $webhookUrl; secret_token = $webhookSecret; allowed_updates = @('message', 'callback_query'); max_connections = 1; drop_pending_updates = $false }
        $registered = Invoke-RestMethod -Method Post -Uri ($apiUrl + '/setWebhook') -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Compress) -TimeoutSec 15
        if (-not $registered.ok -or -not $registered.result) { throw 'registration_failed' }
        $after = Invoke-RestMethod -Method Get -Uri ($apiUrl + '/getWebhookInfo') -TimeoutSec 15
        if (-not $after.ok -or $after.result.url -ne $webhookUrl -or 'message' -notin $after.result.allowed_updates -or 'callback_query' -notin $after.result.allowed_updates) { throw 'verification_failed' }
        Write-Output 'Verificado: message e callback_query habilitados; pendencias preservadas. Envie /resumo e clique Ver detalhes novamente.'
    }
} catch {
    # HTTP exception messages may contain token-bearing URLs. Never echo $_.
    Write-Output 'Falha ao verificar/registrar. Confira token, segredo atual e URL de producao. Nenhum detalhe sensivel foi exibido.'
    exit 1
} finally {
    $telegramToken = $webhookSecret = $apiUrl = $payload = $null
}
