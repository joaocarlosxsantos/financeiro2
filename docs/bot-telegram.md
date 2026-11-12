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
| `/resumo` | Gera o resumo diário consolidado imediato: (1) saldo total de contas e movimentações de ontem, (2) faturas atuais de cartão e limite disponível, (3) 2 a 3 insights prioritários do dia. Reutiliza o mesmo motor da rotina matinal. |
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

O sistema executa rotinas automáticas via **Vercel Cron**:

### 3.1. Resumo Diário Matinal (08:00 BRT / 11:00 UTC)
- **Rota:** `/api/cron/daily-summary`
- **Frequência:** Todo dia às 08:00 America/Sao_Paulo (11:00 UTC).
- **Conteúdo consolidado:**
  1. **CONTA:** Saldo disponível total e movimentações de ontem (entradas e saídas no fuso de São Paulo).
  2. **CARTÃO:** Fatura atual, limite usado/disponível e próximo vencimento.
  3. **INSIGHTS:** 2 a 3 avisos prioritários do dia (faturas e contas a pagar vencendo hoje/amanhã, alertas de 80%/100% de orçamento, risco de saldo negativo, reajustes de assinaturas e cota diária disponível).
- **Sob demanda:** O mesmo resumo pode ser requisitado a qualquer momento com o comando `/resumo`.
- **Preferências:** Respeita a opção `summary` (resumo diário) em `Configurações > Notificações Telegram`.
- **Atualização antes do resumo:** Depois do claim de envio, tenta sincronizar as conexões integradas do usuário pelo mesmo núcleo do botão manual, com cooldown compartilhado de 60 segundos e teto total de 8 segundos por usuário. O cron processa no máximo três usuários em paralelo. Falha ou timeout usa os dados salvos e informa a hora disponível, sem impedir o envio ao usuário nem aos demais. A chave de envio `${dia}:ds`, de 13 caracteres, permanece igual.

### 3.2. Checagem Periódica de Insights (08:00, 14:00 e 20:00 BRT)
A rota `/api/cron/insights` é agendada para 3 horários diários:
- **08:00** (11:00 UTC)
- **14:00** (17:00 UTC)
- **20:00** (23:00 UTC)
- **Dia 1º às 08:00:** Relatório mensal de fechamento em `/api/cron/insights/monthly`.

### 3.3. Tipos de Alertas
1. **Fatura do Cartão:** Disparado 3 dias antes, 1 dia antes e no dia do vencimento da fatura.
2. **Contas a Pagar:** Notificação de contas cadastradas com vencimento para amanhã e hoje.
3. **Orçamento por Categoria:** Alerta quando o consumo de uma categoria atinge **80%** e **100%** do teto mensal estipulado.
4. **Alerta de Saldo Negativo:** Aviso preventivo caso o ritmo diário aponte que a conta fechará o mês no vermelho.
5. **Reajuste de Assinaturas:** Notificação de cobranças recorrentes com valor acima do histórico habitual.

### 3.4. Regras de Disparo e Idempotência
- **Janela de Silêncio:** Alertas proativos são despachados exclusivamente entre **08:00 e 21:00** (horário de Brasília/São Paulo). Nenhuma mensagem automática é enviada durante a madrugada.
- **Deduplicação Atômica:** Cada envio é registrado na tabela `telegramDeliveries` com chave composta (`userId` + `alertType` + `periodKey`). Isso impede o reenvio acidental do mesmo alerta em execuções consecutivas do cron.
- **Preferências do Usuário:** Na aba `Configurações > Notificações Telegram`, o usuário pode ativar ou desativar individualmente cada categoria de alerta.

---

### 3.5. Dados atuais nas consultas (F23)

- Antes de `/saldo`, `/cartao`, `/previsao`, `/hoje`, `/assinaturas`, `/resumo` e `/relatorio`, o bot tenta atualizar os dados pela função `syncOpenFinanceForUser`, em `src/server/open-finance/sync.ts`. O botão `syncOpenFinance` e o auto-sync do painel delegam ao mesmo núcleo. A identidade vem exclusivamente do vínculo do chat, nunca do texto.
- Perguntas livres sobre gastos e outras finanças atualizam antes da primeira chamada de `executeReadTool`, uma vez por pergunta. Uma pergunta sem ferramentas financeiras não dispara sync. A quota da IA continua sendo verificada antes do provedor e das ferramentas.
- Bot e resumo automático usam o modo manual de **60s**, baseado no mesmo `open_finance_connections.lastAttemptAt` usado pelo botão. Não há relógio adicional nem coluna nova. O painel mantém a janela automática de 5min sobre esse mesmo estado. Tentativas malsucedidas também consomem a janela.
- O `UPDATE` condicional que marca `SYNCING` continua sendo o claim atômico por conexão e usuário. Consultas simultâneas, botão e cron não iniciam outra importação enquanto a conexão estiver ocupada ou dentro da janela. O dedup e o rate limit do Telegram são verificados antes do sync; replay não dispara sync nem novo envio.
- Dentro do cooldown, o bot consulta o banco e acrescenta **“Atualizado há X s/min/h”**, usando a última sincronização concluída. Em várias conexões, informa a mais antiga; isso não representa a hora de processamento do banco na Pluggy.
- A tentativa completa tem teto de **8s por usuário**, incluindo todas as conexões, processadas em sequência. O cancelamento chega ao cliente HTTP Pluggy, às páginas e às verificações antes/dentro da transação de importação. Nenhuma nova chamada Pluggy começa após o cancelamento. A espera do bot não depende do tempo de limpeza do claim no banco.
- Em falha ou timeout, a leitura continua com os dados já salvos e o aviso **“Não consegui atualizar agora; dados de HH:MM (DD/MM)”**, no fuso de São Paulo. Se nunca houve sincronização, informa que o horário não está disponível. Não inventa horário. A resposta permanece em uma única mensagem, sem `parse_mode`, com até 4096 caracteres.
- `/ajuda`, `/start`, `/pausar`, comandos desconhecidos e usuários sem contas integradas não acionam sync. O bot não permite criar ou editar lançamentos pelo chat: apenas o importador bancário existente pode atualizar os registros da integração.
- O webhook reserva `maxDuration = 60` segundos; a IA mantém seu teto de 18s, incluindo as ferramentas. O cron mantém 300s, com orçamento de lote de 240s e pool de três usuários. Autenticação do webhook, opt-out e idempotência de envio não mudaram.
- A sincronização reutiliza a leitura já existente da Pluggy; não força um novo processamento bancário do item nem contorna limites do provedor. Testes usam mocks; nunca enviar IDs de teste ao banco de produção (B3b).

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
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"],
    "max_connections": 1
  }'
```

No Windows, consulte com `powershell -NoProfile -File scripts/telegram-webhook.ps1`.
Para reparar usando copiar/colar, execute na raiz do projeto:

```powershell
powershell -NoProfile -File scripts/telegram-webhook.ps1 -Register -FromClipboard
```

Copie o token e pressione apenas Enter no console; depois copie o mesmo segredo
já configurado na Vercel e pressione apenas Enter novamente. Não cole os valores
no console. Esse modo lê o clipboard e o limpa ao terminar, inclusive em caso de erro.

Sem `-FromClipboard`, o script usa `TG_BOT_TOKEN` e `TG_WEBHOOK_SECRET` se já estiverem
definidas no ambiente da sessão (herdadas pelo processo PowerShell); cada valor
ausente é solicitado em entrada mascarada. Não digite atribuições com segredos
literais no terminal, pois ficariam no histórico. `-FromClipboard` tem prioridade
sobre as variáveis de sessão. Nenhum modo aceita segredos como argumentos.

O script verifica a URL atual,
habilita `message` e `callback_query`, preserva updates pendentes e confirma o resultado.
Não imprime segredos nem os recebe como argumentos. Não use transcrição de terminal.

Omitir `allowed_updates` mantém a configuração anterior no Telegram. Um registro
antigo restrito a `["message"]` impede a chegada dos cliques, mesmo após novo deploy.
Fonte: [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook).

---

## 5. Segurança do Bot

- **Vínculo Seguro:** O chat é associado à conta do usuário através de um código de 6 dígitos temporário (expira em 10 minutos) gerado exclusivamente na área logada da web.
- **Escopo Estrito de Dados:** Cada consulta no webhook pesquisa a tabela `telegramChats` pelo `telegramChatId`. Todas as queries subsequentes filtram rigorosamente por `userId`.
- **Proteção de Privacidade:** O número do cartão nunca é exibido além dos últimos 4 dígitos e bandeira/apelido.
- **Sanitização de Saída:** Todo conteúdo gerado ou vindo de descrições de compras de terceiros passa por escape de caracteres especiais do MarkdownV2 (`_`, `*`, `[`, `]`, `(`, `)`, `~`, `\``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`).
