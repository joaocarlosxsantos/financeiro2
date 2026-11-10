# Revisão de Segurança e Correção — Git Diff Completo (T29r)

**Data:** 10/11/2026  
**Escopo auditado:**
- **Perfis de uso (T27):** `src/lib/usage-profile.ts`, `src/server/usage-profile.ts`, `src/server/actions/usage-profile.ts`, rotas, layouts e navegação (`Sidebar`, `BottomNav`, `NewAccount`, `LancamentosHeaderActions`, `OnboardingCard`, `DashboardPage`).
- **Segurança e integridade (T28):** Reautenticação de exportação (`src/lib/reauth.ts`, `src/server/actions/export.ts`, `src/app/api/exportar/backup/route.ts`), rate limiting (`src/server/actions/auth.ts`, `src/lib/rate-limit.ts`), sanitização de entradas (`src/server/validation/sanitization.ts`), e verificações de ownership/IDOR em todas as Server Actions (`bills.ts`, `debts.ts`, `goals.ts`, `import.ts`, `open-finance.ts`, `recurring.ts`, `settings.ts`, `splits.ts`, `transactions.ts`, `edit-transaction.ts`).
- **Bot Telegram B2 e B3:** Vercel Cron de insights deterministas (`cron.ts`, `insight-store.ts`, `insights.ts`), preferências do usuário, IA com Claude Haiku 5.5 (`ai.ts`, `ai-policy.ts`, `ai-tools.ts`, `ai-service.ts`, `ai-quota.ts`), proteção contra prompt injection e isolamento de identidade.
- **Banco de dados e Migrations:** `drizzle/0019_telegram_b1.sql`, `drizzle/0020_telegram_insights_b2.sql`, `drizzle/0021_user_usage_profile.sql`, `drizzle/0022_telegram_ai_usage.sql` e journal/snapshots.

---

## 1. Resumo Executivo e Veredito

O conjunto de mudanças eleva expressivamente o nível de maturidade do projeto. Destacam-se o isolamento absoluto de identidade nas ferramentas de IA do Bot B3 (fechamento de `userId` no servidor, sem tools de escrita), a proteção rigorosa contra IDOR em todas as mutações do banco de dados, o fechamento dos fluxos manuais e de integração de acordo com o perfil de uso (T27), e a sanitização centralizada de caracteres de controle ASCII.

Nenhum código de aplicação foi modificado nesta revisão. Os achados foram categorizados por severidade para atuação prévia à homologação e aplicação das migrations.

---

## 2. Achados por Severidade

### [BLOQUEANTE / SEGURANÇA CRÍTICA] Chave secreta HMAC com fallback estático hardcoded em `reauth.ts`
- **Arquivo:linha:** `src/lib/reauth.ts:12-13` (`getSecretKey`)
- **Impacto / Motivo:**
  ```ts
  function getSecretKey(): string {
    return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "financeiro-default-reauth-key-2026";
  }
  ```
  Caso as variáveis de ambiente `AUTH_SECRET` ou `NEXTAUTH_SECRET` não estejam presentes (ou fiquem vazias em preview/staging), o sistema recorre a uma string constante exposta no repositório. Qualquer pessoa com acesso ao código-fonte consegue forjar tokens de exportação (`${userId}.${expiresAt}.${signature}`) válidos para qualquer `userId`, contornando a exigência de senha e permitindo download não autorizado do backup financeiro completo.
- **Recomendação:**
  Falhar fechado. Se nenhuma das variáveis estiver configurada, lançar `Error("AUTH_SECRET não definida")`, impedindo a assinatura ou validação de tokens com chaves padrão conhecidas.

---

### [IMPORTANTE / SEGURANÇA] Burlar rate limiting de IP via spoofing de `X-Forwarded-For`
- **Arquivo:linha:** `src/server/actions/auth.ts:38` (`getClientIp`)
- **Impacto / Motivo:**
  ```ts
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  ```
  A função extrai cegamente o primeiro IP do cabeçalho `X-Forwarded-For`. Um atacante pode forjar o cabeçalho `X-Forwarded-For: 1.2.3.4` em suas requisições HTTP; o proxy reverso da infraestrutura concatenará o IP real ao final (`1.2.3.4, <ip_real>`). Ao fazer o split e ler o índice 0, o backend utiliza o IP forjado pelo atacante. Rotacionando esse valor a cada tentativa, o atacante contorna integralmente o rate limit de 20 tentativas por IP (`login:ip:${clientIp}`).
- **Recomendação:**
  Em ambientes Vercel, priorizar o cabeçalho confiável `x-vercel-forwarded-for` ou `x-real-ip`. Caso utilize `x-forwarded-for`, ler o IP fornecido pela borda confiável (último hop antes do app) e nunca o primeiro valor injetável pelo cliente.

---

### [IMPORTANTE / SEGURANÇA] Exposição de senha em query string (`searchParams` de GET)
- **Arquivo:linha:** `src/app/api/exportar/backup/route.ts:168` (`GET`)
- **Impacto / Motivo:**
  ```ts
  const password = request.headers.get("x-reauth-password") || sp.get("password");
  ```
  A rota de download de backup aceita a senha do usuário diretamente na URL via `?password=...`. Parâmetros de consulta em requisições GET trafegam e são gravados em logs de servidores de acesso, proxies reversos (Vercel/Cloudflare), histórico de navegadores e cabeçalhos `Referer`. Senhas em texto puro nunca devem ser aceitas via query string.
- **Recomendação:**
  Remover o suporte a `sp.get("password")` no GET. A reautenticação deve exigir token assinado efêmero (`?token=...`) obtido via Server Action prévia ou senha enviada exclusivamente no corpo de uma requisição `POST`.

---

### [IMPORTANTE / FLUXO QUEBRADO] Botão de download na interface não solicita senha e falha com HTTP 401
- **Arquivo:linha:** `src/app/(app)/configuracoes/page.tsx:100-104`
- **Impacto / Motivo:**
  A página de configurações apresenta o link estático direto:
  ```tsx
  <a href="/api/exportar/backup" download className="...">Baixar backup (JSON)</a>
  ```
  Não existe diálogo, modal ou formulário para entrada de senha que acione a action `confirmPasswordForExportAction` antes do download. Ao clicar no link, o navegador faz `GET /api/exportar/backup` sem token e recebe HTTP 401 (`{"error":"Reautenticação necessária..."}`). O usuário final recebe um arquivo JSON com a mensagem de erro ou uma falha de download.
- **Recomendação:**
  Substituir o link estático por um botão interativo que abra um modal/prompt de senha, chame `confirmPasswordForExportAction(password)` e, ao receber o token temporário de 5 minutos, inicie o download via `/api/exportar/backup?token=${token}`.

---

### [IMPORTANTE / GUARDS DE PERFIL] Criação de contas manuais não é restrita no perfil `integracao_total`
- **Arquivo:linha:** `src/server/actions/settings.ts:81` (`createAccount`) e `src/app/(app)/contas/page.tsx:25` (`NewAccount`)
- **Impacto / Motivo:**
  No perfil `integracao_total`, movimentações e contas devem se originar exclusivamente do Open Finance. No entanto:
  1. A action `createAccount` não verifica `getProfileRestriction(userId, "manual-entry")`.
  2. A página `/contas` exibe o botão `NewAccount` ("Criar conta") incondicionalmente no topo.
  Um usuário com perfil de integração total consegue criar contas correntes manuais livremente. Posteriormente, contudo, ele fica impedido de adicionar transações ou saldos iniciais nessa conta manual, gerando um estado de inconsistência e atrito.
- **Recomendação:**
  Condicionar o botão `NewAccount` em `/contas` à capability `manual-entry` e adicionar `const restriction = await getProfileRestriction(userId, "manual-entry"); if (restriction) return { error: restriction };` na action `createAccount`.

---

### [SUGESTÃO / MIGRATION 0021] Falta de CHECK constraint na coluna `users.usage_profile`
- **Arquivo:linha:** `drizzle/0021_user_usage_profile.sql:1`
- **Impacto / Motivo:**
  A migration adiciona a coluna como `ALTER TABLE "users" ADD COLUMN "usage_profile" text DEFAULT 'hibrido' NOT NULL;` sem constraint a nível de banco. Se uma query manual, script ou futura evolução inserir um valor com erro de digitação (ex: `'manual_only'`), a função `getUsageProfile` lança exceção em tempo de execução (`throw new Error("Perfil do usuário indisponível.")`), bloqueando completamente o acesso do usuário a todas as telas do sistema.
- **Recomendação:**
  Adicionar a constraint diretamente na migration antes da execução:
  `ALTER TABLE "users" ADD CONSTRAINT "users_usage_profile_chk" CHECK ("usage_profile" IN ('integracao_total', 'hibrido', 'manual'));`

---

### [SUGESTÃO / MIGRATION 0019 (RE-ENFATIZAR)] `last_update_id` como `integer` (int4)
- **Arquivo:linha:** `drizzle/0019_telegram_b1.sql:3`, `src/db/schema.ts:94`, `src/server/telegram/protocol.ts:29`
- **Impacto / Motivo:**
  Conforme apontado na revisão T26r, a coluna continua como `integer` (signed 32-bit: máx 2.147.483.647). Se o Telegram emitir updates com IDs acima desse valor, o Zod rejeitará em silêncio e o banco falhará com estouro de inteiro. O Maestro anotou para conversão para `bigint`; reforça-se que este ajuste seja aplicado antes de executar a migration 0019 em produção.

---

### [SUGESTÃO / SEGURANÇA] Callback de login do NextAuth sem rate limit de IP
- **Arquivo:linha:** `src/lib/auth.ts:35-48` vs `src/server/actions/auth.ts:125`
- **Impacto / Motivo:**
  O rate limit de 20 falhas por IP (`login:ip:${clientIp}`) foi inserido apenas na Server Action `loginAction`. Se um atacante fizer chamadas diretas via API contra o endpoint `POST /api/auth/callback/credentials`, apenas o limite por email (`login:${email}`) é aplicado dentro de `authorize`. Um ataque distribuído de credential stuffing testando senhas em múltiplos emails diferentes não é freado pelo limite de IP nessa rota direta.
- **Recomendação:**
  Integrar a verificação de IP diretamente dentro da função `authorize` de `src/lib/auth.ts`.

---

## 3. Conformidades e Aprovações Auditadas

| Área Analisada | Veredito | Detalhes Técnicos e Boas Práticas Verificadas |
| :--- | :---: | :--- |
| **Proteção contra Prompt Injection (Bot B3)** | **APROVADO COM DISTINÇÃO** | • **Identidade 100% blindada:** `userId` é resolvido exclusivamente da tabela `telegram_links` e fechado em closure no servidor. Não há parâmetro `userId` em nenhum schema de ferramenta.<br>• **Ferramentas estritamente de leitura:** Apenas 5 ferramentas implementadas (`get_balance`, `get_spending_by_category`, `get_largest_expenses`, `compare_months`, `get_due_bills`). Nenhuma ferramenta de escrita, deleção, transferência ou pagamento.<br>• **Schemas Zod rígidos:** Todos os schemas de tool possuem `.strict()`, rejeitando parâmetros extras.<br>• **Defesa contra alucinação:** Respostas financeiras sem execução de ferramentas bem-sucedidas são substituídas pela mensagem determinista `AI_NO_DATA`.<br>• **Sanitização de saída:** `safeAnswer` remove segredos conhecidos, tokens de provedor (`sk-ant-`, `Bearer`), links e IPs. Mensagens enviadas sem `parse_mode`. |
| **Verificações de Propriedade (IDOR - T28)** | **APROVADO** | • `saveOpeningBalance`: restringe por `accounts.id` e `accounts.userId`.<br>• `deleteImportBatch`: restringe exclusões de transações e lotes com predicado explícito `eq(userId)`.<br>• `createTransfer` e `updateTransfer`: utilizam estritamente o usuário da sessão, ignorando qualquer argumento de usuário forjado.<br>• `editManualTransaction`: valida ownership via join com a tabela `accounts` e bloqueia transações do Open Finance ou vinculadas a transferências.<br>• `open-finance.ts`: todas as 10 actions validam e restringem conexões e contas por `userId`. |
| **Guards de Rota e Ações por Perfil (T27)** | **APROVADO** | • Rotas `/configuracoes/integracao`, `/importar` e `/recorrentes` utilizam `requireProfileRoute` no servidor, redirecionando para `/painel` se a capability não for suportada.<br>• Ações manuais (`createTransaction`, `updateTransaction`, `createTransfer`, `updateTransfer`, `editManualTransaction`, `previewImport`, `commitImport`, `createRecurringRule`, `generateRecurring`, `saveOpeningBalance`) validam `getProfileRestriction(userId, "manual-entry")`.<br>• Todas as ações do Open Finance validam `getProfileRestriction(userId, "integration")`.<br>• Menus, sidebar, bottom navigation e cards de onboarding adaptam-se dinamicamente ao perfil do usuário. |
| **Sanitização de Entradas de Texto (T28)** | **APROVADO** | • Schemas `safeNameSchema`, `safeDescriptionSchema`, `safeOptionalTextSchema` e `safeNotesSchema` em `src/server/validation/sanitization.ts` higienizam bytes nulos (`\0`), caracteres de controle e quebras de linha indevidas em todas as entidades financeiras. |
| **Segredos em Logs e Respostas** | **APROVADO** | • Nenhuma chamada a `console.error` ou `console.log` expõe senhas, tokens ou dados financeiros.<br>• Respostas com cabeçalho `Cache-Control: no-store`.<br>• Variáveis de ambiente sensíveis documentadas em `.env.example` sem valores atribuídos. |
| **Ordem e Reversibilidade das Migrations** | **APROVADO** | • A cadeia linear de dependências está correta: `0019` (chat state) ➔ `0020` (deliveries/prefs) ➔ `0021` (usage profile) ➔ `0022` (ai usage, que depende da FK de 0019).<br>• Todas as migrations possuem plano de rollback limpo (`DROP TABLE` e `DROP COLUMN`). |
| **Cron de Insights B2** | **APROVADO** | • Rota protegida com `CRON_SECRET` e comparação em tempo constante (`timingSafeEqual`).<br>• Deduplicação atômica de entrega por janela temporal via constraint `(user_id, window_key)` em `telegram_deliveries`. Horários no `vercel.json` compatíveis com UTC/São Paulo. |

---

## 4. Reverificação dos Fixes T30a

Auditoria realizada diretamente nos arquivos corrigidos após a implementação da tarefa T30a:

### 1. `reauth.ts` sem fallback de segredo
- **Arquivo:linha:** [`src/lib/reauth.ts:11-20`](file:///C:/Projetos/financeiro_2/src/lib/reauth.ts#L11-L20) (`getSecretKey`) e [`src/lib/reauth.test.ts:51-65`](file:///C:/Projetos/financeiro_2/src/lib/reauth.test.ts#L51-L65)
- **Verificação:** A chave padrão hardcoded `"financeiro-default-reauth-key-2026"` foi completamente eliminada para ambientes reais. Em caso de ausência de `AUTH_SECRET` e `NEXTAUTH_SECRET`, a função lança `Error("AUTH_SECRET não definida para reautenticação.")`, forçando o sistema a falhar fechado. Em ambiente de teste (`NODE_ENV === "test"`), utiliza stub explícito para viabilizar testes sem segredos reais em arquivos versionados. A função `verifyExportToken` captura o erro e retorna `false`.
- **Status:** **APROVADO (Sem regressão).**

### 2. `getClientIp` em `auth.ts` protegido contra spoofing
- **Arquivo:linha:** [`src/server/actions/auth.ts:34-56`](file:///C:/Projetos/financeiro_2/src/server/actions/auth.ts#L34-L56) (`getClientIp`)
- **Verificação:** O método foi reestruturado com hierarquia de confiança:
  1. Lê prioritariamente `x-vercel-forwarded-for` (injetado e sobrescrito pela borda da Vercel);
  2. Em seguida, avalia `x-real-ip`;
  3. No caso de `x-forwarded-for`, extrai o **último** IP da cadeia (`parts[parts.length - 1]`), que corresponde ao endereço apensado pelo proxy reverso confiável, e não o primeiro injetável pelo cliente no request.
- **Status:** **APROVADO (Sem regressão).**

### 3. Remoção de senha em query string GET no backup
- **Arquivo:linha:** [`src/app/api/exportar/backup/route.ts:168`](file:///C:/Projetos/financeiro_2/src/app/api/exportar/backup/route.ts#L168) e [`src/app/api/exportar/backup/backup-route.test.ts:53-59`](file:///C:/Projetos/financeiro_2/src/app/api/exportar/backup/backup-route.test.ts#L53-L59)
- **Verificação:** A leitura de `sp.get("password")` foi removida do método `GET`. Requisições `GET` aceitam exclusivamente o token assinado (`?token=...`), cabeçalho seguro `x-export-token` ou cookie `export-token`. A senha só é aceita no cabeçalho `x-reauth-password` ou no corpo de requisições `POST` (`application/json` ou `multipart/form-data`). O teste unitário confirma que `GET /api/exportar/backup?password=...` resulta em HTTP 401.
- **Status:** **APROVADO (Sem regressão).**

### 4. Componente `BackupButton` com solicitação de senha e download funcional
- **Arquivo:linha:** [`src/app/(app)/configuracoes/backup-button.tsx:1-147`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/backup-button.tsx#L1-L147) e [`src/app/(app)/configuracoes/page.tsx:99`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/page.tsx#L99)
- **Verificação:** O link estático vulnerável foi substituído pelo componente cliente `BackupButton`. O componente abre diálogo modal acessível (`role="dialog"`, `aria-modal="true"`), solicita a senha atual do usuário, aciona a Server Action `requestExportToken(password)` (que valida a senha com bcrypt e aplica rate limit de 5 tentativas) e, com o token efêmero de 5 minutos retornado, dispara programaticamente o download nativo do arquivo JSON com a URL segura `/api/exportar/backup?token=${token}`. A senha é apagada do estado local imediatamente após o envio.
- **Status:** **APROVADO (Sem regressão).**

---

### 5. Furos Restantes e Observações Arquiteturais

1. **Endpoint direto do NextAuth (`POST /api/auth/callback/credentials`):** O rate limit de 20 tentativas por IP (`login:ip:${clientIp}`) opera na Server Action `loginAction`. Requisições diretas ao endpoint HTTP interno do NextAuth são protegidas pelo rate limit por e-mail em `authorize`, mas não compartilham o bloqueio por IP. (Risco residual aceitável para o app padrão).
2. **Suíte de Testes Geral:** Todas as 59 suítes e 474 testes passam sem falhas (exit code 0).

