# Bot do Telegram — Mutano Contas

O **Mutano Contas** possui integração nativa com o Telegram via Webhook. O bot permite consultar informações financeiras rápidas, receber alertas proativos inteligentes e fazer perguntas em linguagem natural sobre seus gastos.

---

## 1. Comandos Disponíveis

| Comando | Descrição |
|---|---|
| `/start [codigo]` | Vincula o chat do Telegram à sua conta do Mutano Contas usando o código temporário gerado no painel Web (`Configurações > Telegram`). |
| `/saldo` | Lista o saldo de cada conta ativa (corrente, poupança, investimento) e o saldo total consolidado. |
| `/cartao` | Exibe a fatura atual, limite disponível e as últimas 5 compras em cada cartão cadastrado (limite de até 5 cartões). |
| `/previsao` | Projeta o saldo final do mês com base na taxa de queima diária (*burn rate*) atual versus receitas e despesas restantes. |
| `/hoje` | Informa a cota recomendada de gastos para o dia de hoje, permitindo fechar o mês com saldo positivo. |
| `/resumo` | Gera um resumo financeiro imediato: total gasto no mês, faturas abertas, contas próximas do vencimento e alertas de assinaturas. |
| `/pausar` | Pausa temporariamente os alertas proativos agendados (o bot continuará respondendo a comandos manuais). |
| `/desvincular` | Desconecta permanentemente o chat do Telegram da sua conta do aplicativo. |
| `/ajuda` | Exibe a lista completa de comandos e exemplos de interação. |

---

## 2. Perguntas em Linguagem Natural (IA)

Caso configurado um provedor de IA no servidor (`AI_PROVIDER=gemini` ou `anthropic`), qualquer mensagem de texto que não seja um comando com barra (`/`) é interpretada como uma consulta ao assistente financeiro:
- *"Quanto gastei com mercado este mês?"*
- *"Qual foi a minha maior despesa da última semana?"*
- *"Tenho alguma conta para pagar amanhã?"*

O assistente sintetiza dados reais da conta do usuário em formato seguro, sem expor dados de outros usuários nem aceitar comandos de modificação de dados via prompt.

---

## 3. Alertas Proativos e Agendamento

O sistema executa checagens automáticas via **Vercel Cron** na rota `/api/cron/insights`, agendada para 3 horários diários:
- **08:00** (11:00 UTC)
- **14:00** (17:00 UTC)
- **20:00** (23:00 UTC)
- **Dia 1º às 08:00:** Relatório mensal de fechamento em `/api/cron/insights/monthly`.

### 3.1. Tipos de Alertas
1. **Fatura do Cartão:** Disparado 3 dias antes, 1 dia antes e no dia do vencimento da fatura.
2. **Contas a Pagar:** Notificação de contas cadastradas com vencimento para amanhã e hoje.
3. **Orçamento por Categoria:** Alerta quando o consumo de uma categoria atinge **80%** e **100%** do teto mensal estipulado.
4. **Alerta de Saldo Negativo:** Aviso preventivo caso o ritmo diário aponte que a conta fechará o mês no vermelho.
5. **Reajuste de Assinaturas:** Notificação de cobranças recorrentes com valor acima do histórico habitual.

### 3.2. Regras de Disparo e Idempotência
- **Janela de Silêncio:** Alertas proativos são despachados exclusivamente entre **08:00 e 21:00** (horário de Brasília/São Paulo). Nenhuma mensagem automática é enviada durante a madrugada.
- **Deduplicação Atômica:** Cada envio é registrado na tabela `telegramDeliveries` com chave composta (`userId` + `alertType` + `periodKey`). Isso impede o reenvio acidental do mesmo alerta em execuções consecutivas do cron.
- **Preferências do Usuário:** Na aba `Configurações > Notificações Telegram`, o usuário pode ativar ou desativar individualmente cada categoria de alerta.

---

## 4. Configuração e Variáveis de Ambiente

Para habilitar o bot no seu ambiente, configure as seguintes variáveis no arquivo `.env`:

```env
# Token obtido com o @BotFather no Telegram
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"

# Segredo arbitrário para validação do webhook (header X-Telegram-Bot-Api-Secret-Token)
TELEGRAM_WEBHOOK_SECRET="um-segredo-aleatorio-forte"

# Segredo de autenticação das chamadas do Vercel Cron
CRON_SECRET="outro-segredo-forte-para-o-cron"

# (Opcional) Provedor de IA para respostas em linguagem natural
AI_PROVIDER="gemini" # ou "anthropic"
GEMINI_API_KEY=""
ANTHROPIC_API_KEY=""
```

### Registrando o Webhook na API do Telegram

Após publicar a aplicação na Vercel (ou via túnel HTTPS como ngrok em desenvolvimento), registre o webhook executando:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-dominio.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

---

## 5. Segurança do Bot

- **Vínculo Seguro:** O chat é associado à conta do usuário através de um código de 6 dígitos temporário (expira em 10 minutos) gerado exclusivamente na área logada da web.
- **Escopo Estrito de Dados:** Cada consulta no webhook pesquisa a tabela `telegramChats` pelo `telegramChatId`. Todas as queries subsequentes filtram rigorosamente por `userId`.
- **Proteção de Privacidade:** O número do cartão nunca é exibido além dos últimos 4 dígitos e bandeira/apelido.
- **Sanitização de Saída:** Todo conteúdo gerado ou vindo de descrições de compras de terceiros passa por escape de caracteres especiais do MarkdownV2 (`_`, `*`, `[`, `]`, `(`, `)`, `~`, `\``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`).
