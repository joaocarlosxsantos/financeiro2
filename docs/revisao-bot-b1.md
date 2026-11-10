# Revisão de Segurança e Correção — Bot Telegram Fase B1 (T26r)

**Data:** 10/11/2026  
**Escopo revisado:**
- `src/server/telegram/protocol.ts` e `protocol.test.ts`
- `src/server/telegram/webhook.ts` e `webhook.test.ts`
- `src/server/telegram/store.ts` e `store.test.ts`
- `src/server/telegram/balances.test.ts`
- `src/app/api/telegram/webhook/route.ts`
- `src/server/actions/telegram.ts` e `telegram.test.ts`
- `drizzle/0019_telegram_b1.sql` e snapshot/journal do Drizzle
- `src/app/(app)/configuracoes/telegram-panel.tsx`
- Plano e checklist em `docs/bot-telegram-plano.md`

---

## 1. Resumo Executivo e Veredito

A arquitetura de segurança da Fase B1 foi desenhada com alto rigor: o vínculo 1:1 entre usuário do app e chat privado do Telegram é estrito, códigos descartáveis de 256 bits com SHA-256 e expiração curta eliminam reutilização, segredos de webhook utilizam comparação em tempo constante (`timingSafeEqual`), consultas de saldo reutilizam a conexão transacional reservada (sem risco de esgotamento do pool), e não há vazamento de dados sensíveis em logs ou no cliente.

Nenhum código de produção foi alterado nesta revisão. Foram identificados apontamentos divididos por severidade, com destaque para a limitação de 32 bits no `update_id` antes da aplicação da migration `0019_telegram_b1.sql`.

---

## 2. Achados por Severidade

### [IMPORTANTE] Risco de overflow e silenciamento permanente do bot pelo teto de 32-bit em `update_id`
- **Arquivo:linha:**
  - `drizzle/0019_telegram_b1.sql:3` (`"last_update_id" integer NOT NULL`)
  - `src/db/schema.ts:94` (`lastUpdateId: integer("last_update_id").notNull()`)
  - `src/server/telegram/protocol.ts:29` (`update_id: z.number().int().nonnegative().max(2_147_483_647)`)
- **Impacto / Motivo:**
  No Telegram Bot API, o `update_id` é um identificador sequencial global/por bot que pode ultrapassar `2^31 - 1` (2.147.483.647), trafegando valores inteiros de até 64 bits ou 32 bits não assinados. Na implementação atual:
  1. A validação Zod impõe `.max(2_147_483_647)`. Se o Telegram emitir um update com ID ≥ 2.147.483.648, `updateSchema.safeParse` falhará silenciosamente, `handleWebhook` responderá HTTP 200 `{ ok: true }` e descartará o update sem processar.
  2. Como os updates subsequentes são sempre incrementais, **todas as mensagens futuras serão descartadas em silêncio**, inutilizando o bot.
  3. No banco de dados, `integer` no PostgreSQL (int4) dispararia `value out of range for type integer`.
- **Recomendação:**
  Como a migration `0019_telegram_b1.sql` **ainda não foi aplicada em produção**, alterar o tipo da coluna para `bigint` (int8) tanto no SQL quanto em `src/db/schema.ts` (`bigint("last_update_id", { mode: "number" })`) e atualizar o schema Zod para `.refine(Number.isSafeInteger)`. Fazer isso agora tem custo zero e evita uma migration complexa de `ALTER COLUMN TYPE` com lock exclusivo no futuro.

---

### [IMPORTANTE] Painel de configurações sem estado de vínculo e queima de código em reconexão
- **Arquivo:linha:**
  - `src/app/(app)/configuracoes/telegram-panel.tsx:8-25`
  - `src/server/actions/telegram.ts:9-28`
  - `src/server/telegram/store.ts:52-54`
- **Impacto / Motivo:**
  O componente `TelegramPanel` não recebe nem consulta se o usuário já possui um vínculo ativo em `telegram_links`.
  1. Se um usuário já vinculado clicar em "Gerar link do Telegram", um novo código é emitido. Ao abrir o Telegram e enviar `/start <code>`, a instrução `INSERT INTO telegram_links ... ON CONFLICT DO NOTHING` em `store.ts:52` detecta o conflito na Primary Key `userId` e não insere a linha (`link` nulo).
  2. O código de 10 minutos é consumido e apagado pelo `DELETE RETURNING`, e o bot responde: *"Link inválido, expirado ou conta já vinculada. Desconecte no app e gere outro link."*
  3. Embora seguro contra sequestro de conta, a ausência de feedback de "Já conectado" na interface causa atrito e confusão no usuário final.
- **Recomendação:**
  Carregar o estado de conexão (ex.: `isLinked: boolean`) via server component em `src/app/(app)/configuracoes/page.tsx` e repassar para `TelegramPanel`, indicando se o Telegram está ativo e orientando a desconectar antes de gerar nova vinculação.

---

### [IMPORTANTE] Dependência síncrona de rede externa (`getMe`) a cada geração de link
- **Arquivo:linha:**
  - `src/server/actions/telegram.ts:15-22`
- **Impacto / Motivo:**
  A action `createTelegramLink` executa uma requisição HTTP `fetch` síncrona para `https://api.telegram.org/bot${token}/getMe` com timeout de 5 segundos toda vez que um usuário clica para gerar o link, apenas para descobrir o `username` do bot.
  Se a API do Telegram sofrer lentidão ou indisponibilidade pontual, a geração do código falha.
- **Recomendação:**
  Armazenar o username em cache após a primeira consulta bem-sucedida (ou suportar uma variável `TELEGRAM_BOT_USERNAME` opcional como fallback), evitando a dependência de rede em tempo de execução para cada clique de usuário.

---

### [SUGESTÃO] Falta de sanitização (`trim`) em `TELEGRAM_BOT_TOKEN`
- **Arquivo:linha:**
  - `src/server/actions/telegram.ts:12-15`
- **Impacto / Motivo:**
  O token é lido diretamente de `process.env.TELEGRAM_BOT_TOKEN`. Caso o operador copie o token do BotFather com espaços ou quebras de linha nas variáveis de ambiente da Vercel, o `fetch` pode disparar erro de URL inválida ou 404 da API do Telegram.
- **Recomendação:**
  Aplicar `.trim()` no token lido do ambiente.

---

### [SUGESTÃO] Melhorias de UX e acessibilidade no `TelegramPanel`
- **Arquivo:linha:**
  - `src/app/(app)/configuracoes/telegram-panel.tsx:23-29`
- **Impacto / Motivo:**
  1. A action retorna `expiresAt`, mas a UI não informa o timestamp ou tempo restante para o link gerado, dependendo apenas da mensagem estática.
  2. Quando a desconexão está pendente (`pending`), o primeiro botão exibe "Aguarde..." enquanto o botão clicado ("Desconectar Telegram") permanece com o texto original.
- **Recomendação:**
  Diferenciar o estado pendente por ação (geração vs. desconexão) e exibir horário limite de uso do link.

---

## 3. Conformidades de Segurança Auditadas (Aprovado)

| Vetor de Análise | Status | Detalhes da Auditoria |
| :--- | :---: | :--- |
| **Bypass de Autenticação e Vínculo** | **APROVADO** | • `createTelegramLink` e `disconnectTelegram` exigem sessão ativa via `requireUserId()`.<br>• Webhook valida `X-Telegram-Bot-Api-Secret-Token` via `timingSafeEqual`, falhando fechado (`503` se não configurado, `401` se inválido).<br>• Nenhum parâmetro `user_id` externo ou vindo do payload do Telegram é aceito.<br>• Códigos de link têm 256 bits de entropia (`randomBytes(32)` em base64url), expiração em 10 minutos e apenas o hash SHA-256 é gravado no Postgres. |
| **Proteção contra Replay** | **APROVADO** | • `consumeCode` usa `DELETE FROM telegram_link_codes ... WHERE expires_at > clock_timestamp() RETURNING ...` de forma atômica em transação. Replays concorrentes ou sucessivos encontram zero registros retornados.<br>• `processMessage` atualiza `telegram_chat_state` atomicamente com cláusula condicional `setWhere: lastUpdateId < updateId`. Updates duplicados ou anteriores retornam `null` e são finalizados com HTTP 200 `{ ok: true }` sem reexecução. |
| **Vazamento de Dados entre Usuários** | **APROVADO** | • Resposta do comando `/saldo` consulta exclusivamente o `userId` mapeado na tabela `telegram_links` correspondente ao `chat.id` privado autenticado.<br>• `getBalances` filtra estritamente por `userId` em todas as consultas SQL (`accounts`, `tx`, `goals`, `debts`).<br>• Não há menção a nomes de bancos, números de conta ou detalhes transacionais na mensagem final, apenas o saldo disponível formatado em BRL com `protect_content: true`. |
| **Injeções (SQL, Command, Prompt, Telegram Format)** | **APROVADO** | • Consultas SQL construídas estritamente com tags `sql` do Drizzle ORM parametrizadas.<br>• Regex restrita `/^[A-Za-z0-9_-]{43}$/` para validação prévia de códigos antes de consultar o banco.<br>• Regex `/^[A-Za-z0-9_]{5,32}$/` para validação do username do bot antes de montar deep link.<br>• Mensagens enviadas ao Telegram não usam `parse_mode`, prevenindo falhas de interpretação de entidades Markdown/HTML. |
| **Segredo em Logs e Exposição de Erros** | **APROVADO** | • Blocos `catch` em `webhook.ts`, `telegram.ts` e `store.ts` retornam mensagens amigáveis/estáticas sem registrar payloads, tokens, headers ou queries no `console.error`.<br>• Respostas HTTP usam `Cache-Control: no-store`.<br>• `.env.example` versiona apenas variáveis com valores em branco. |
| **Concorrência e Race Conditions** | **APROVADO** | • `issueLink` e `disconnect` serializam operações por usuário com bloqueio de linha pessimista `SELECT ... FOR UPDATE` na tabela `users`.<br>• Webhooks concorrentes no mesmo chat serializam no lock de linha em `telegram_chat_state` via `ON CONFLICT DO UPDATE`.<br>• Não é possível haver reaproveitamento concorrente de código de vínculo (garantido pelo lock de deleção do Postgres). |
| **Gerenciamento de Recursos e Pool do Banco** | **APROVADO** | • `getBalances` e `getTotalSavedCents` recebem e reutilizam o manipulador transacional `tx` (`connection`), evitando novas conexões ao pool restrito do serverless Vercel durante o processamento do webhook.<br>• Limite de payload HTTP a 16 KiB via stream seguro (`boundedBody`), protegendo contra DoS por corpo infinito. |
| **Segurança e Reversibilidade da Migration** | **APROVADO** | • `drizzle/0019_telegram_b1.sql` cria tabelas novas com chaves estrangeiras com `ON DELETE CASCADE` para `users.id`.<br>• Não altera tabelas existentes nem destrói dados prévios.<br>• Reversão simples e limpa via `DROP TABLE`. |
