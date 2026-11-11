# Arquitetura e Funcionamento da Sincronização de Dados — Financeiro 2.0 (Mutano Contas)

> **Documento de Diagnóstico Arquitetural (Tarefa F22)**  
> **Data:** Novembro de 2026  
> **Status:** Diagnóstico F22; seção do bot atualizada pela F23. O núcleo de sync antes localizado em `actions/open-finance.ts` foi extraído para `server/open-finance/sync.ts`; referências antigas de linha ao núcleo devem ser lidas nesse contexto.  
> **Objetivo:** Explicar detalhadamente, em português simples e com referências de `arquivo:linha`, como funciona hoje a sincronização de dados de contas e cartões em todas as situações, servindo de base para decisões de evolução.

---

## 1. Open Finance e Pluggy

### 1.1 Conexão Inicial (Credenciais e Widget Connect Token)
1. **Configuração de Credenciais da API:**
   - O usuário acessa a tela `/configuracoes/integracao` ([`panel.tsx:325-386`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L325-L386)).
   - Ao preencher `clientId` e `clientSecret`, dispara a Server Action `saveOpenFinanceCredentials` ([`open-finance.ts:75-114`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L75-L114)).
   - A action aplica rate limit de 10 tentativas por hora ([`open-finance.ts:80`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L80)) e testa as credenciais chamando `authenticatePluggy` (`POST https://api.pluggy.ai/auth`) ([`client.ts:85-88`](file:///C:/Projetos/financeiro_2/src/server/open-finance/client.ts#L85-L88)).
   - Se aprovado pela Pluggy, cifra com AES-256-GCM e chave do servidor `APP_ENCRYPTION_KEY` ([`crypto.ts:18-30`](file:///C:/Projetos/financeiro_2/src/server/open-finance/crypto.ts#L18-L30)), persistindo na tabela `open_finance_credentials` ([`schema.ts:289-294`](file:///C:/Projetos/financeiro_2/src/db/schema.ts#L289-L294)).

2. **Geração do Connect Token e Abertura do Widget:**
   - O usuário clica em conectar banco ([`panel.tsx:147-186`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L147-L186)).
   - O frontend injeta dinamicamente o script oficial do widget: `https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js` ([`panel.tsx:136`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L136)).
   - O backend gera um token efêmero com a action `getPluggyConnectToken` ([`open-finance.ts:196-242`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L196-L242)), chamando `createPluggyConnectToken` (`POST /connect_token`) com `{ clientUserId: userId, avoidDuplicates: true }` ([`client.ts:90-98`](file:///C:/Projetos/financeiro_2/src/server/open-finance/client.ts#L90-L98)).
   - O widget abre em modal para o usuário escolher o banco e autenticar no Open Finance.

3. **Captura do Item e Vínculo Seguro (Anti-IDOR):**
   - Ao concluir a autenticação no banco, o widget dispara `onSuccess(data: { item: { id: string } })` no navegador ([`panel.tsx:161-172`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L161-L172)).
   - O frontend repassa esse `itemId` para `connectPluggyItem` ([`open-finance.ts:249-312`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L249-L312)).
   - **Barreira Anti-IDOR:** O servidor busca `getPluggyItem(apiKey, itemId)` na Pluggy e confere rigorosamente se `item.clientUserId === userId` ([`open-finance.ts:266-269`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L266-L269)). Se o item pertencer a outro usuário, a conexão é abortada.
   - O backend salva a conexão na tabela `open_finance_connections` ([`schema.ts:296-308`](file:///C:/Projetos/financeiro_2/src/db/schema.ts#L296-L308)) com o `itemId` criptografado em AES-256-GCM, um hash HMAC para busca indexada ([`crypto.ts:32-34`](file:///C:/Projetos/financeiro_2/src/server/open-finance/crypto.ts#L32-L34)) e status inicial `UPDATING`.

---

### 1.2 Primeira Importação (Histórico, Contas e Vínculos)
- **Data Inicial de Corte (`importFromDate`):**
  - Ao registrar o item, a data de início é fixada automaticamente no dia 1 do mês corrente (`importFromDate.setDate(1)`) ([`open-finance.ts:272-274`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L272-L274)).
  - Na tela de configurações, o usuário pode personalizar a data inicial via `saveOpenFinanceSetup` ([`open-finance.ts:324-325`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L324-L325)).
- **Vínculo Manual Obrigatório das Contas:**
  - A conexão com o banco não cria contas locais automaticamente nem importa nada às cegas.
  - O sync inicial executado na criação do item é interrompido com o erro `"NO_LINKED_ACCOUNTS"` ([`open-finance.ts:598-604`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L598-L604)) porque nenhuma conta local aponta para a nova conexão.
  - O usuário deve abrir o painel "Contas vinculadas" ([`panel.tsx:188-198`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L188-L198)), que chama `discoverOpenFinanceAccounts` (`GET /accounts?itemId=...`) ([`open-finance.ts:343-357`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L343-L357)).
  - Para cada conta externa descoberta, o usuário seleciona uma conta local correspondente via `linkOpenFinanceAccount` ([`open-finance.ts:359-387`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L359-L387)).
  - **Compatibilidade de tipo:** Só é permitido vincular cartão local com cartão remoto (`CREDIT_CARD` $\leftrightarrow$ `CREDIT`) e conta bancária local com conta remota (`CHECKING`/`SAVINGS` $\leftrightarrow$ `BANK`) ([`schemas.ts:77-79`](file:///C:/Projetos/financeiro_2/src/server/open-finance/schemas.ts#L77-L79)). Duas contas locais não podem ser vinculadas à mesma conta externa ([`open-finance.ts:381-383`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L381-L383)).
  - O vínculo atualiza a conta local em `accounts`: `financeMode = 'integracao'`, `externalAccountId = remoteId` e `externalConnectionId = connectionId` ([`open-finance.ts:384`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L384)).
- **Volume de Histórico Carregado:**
  - O backend chama `getPluggyTransactions(apiKey, remote.id, cutoff)` (`GET /v2/transactions?accountId=...&dateFrom=...`) ([`client.ts:153-165`](file:///C:/Projetos/financeiro_2/src/server/open-finance/client.ts#L153-L165)).
  - A API pagina por cursor em lotes de até 200/500 transações com teto de segurança de 50.000 registros ([`client.ts:134`](file:///C:/Projetos/financeiro_2/src/server/open-finance/client.ts#L134)).
  - O filtro `isBeforeCutoff(row.date, cutoff)` ([`cutoff.ts:6-23`](file:///C:/Projetos/financeiro_2/src/server/open-finance/cutoff.ts#L6-L23)) descarta qualquer transação com data civil em São Paulo anterior ao dia inicial configurado.

---

### 1.3 Sincronização Contínua e Gatilhos (Webhook? Cron? Botão?)
- **Webhooks Pluggy:** **NÃO EXISTEM** no projeto. O sistema não cadastra URLs de webhook na Pluggy nem possui rotas de recebimento de eventos de conexão/transação da Pluggy.
- **Cron Job para Sync:** Não há cron independente de Open Finance. Na F23, o cron `daily-summary` passou a tentar sync dos usuários elegíveis antes do envio das 08:00; os demais crons de insights continuam sem sync. Não há rotina de importação de madrugada.
- **Gatilhos Reais de Sincronização:**
  1. **Botão Manual ("Sincronizar agora"):** Localizado em `/configuracoes/integracao` ([`panel.tsx:484-506`](file:///C:/Projetos/financeiro_2/src/app/(app)/configuracoes/integracao/panel.tsx#L484-L506)). Aciona `syncOpenFinance(activeConnection.id, "manual")`. Possui cooldown rígido de **60 segundos** ([`open-finance.ts:23, 571-572`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L23)).
  2. **Auto-Sync ao entrar no Painel:** O componente client-side `AutoSync` ([`auto-sync.tsx:1-27`](file:///C:/Projetos/financeiro_2/src/app/(app)/painel/auto-sync.tsx#L1-L27)) é montado na página principal `/painel` e chama `autoSyncOpenFinance()` ([`open-finance.ts:528-558`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L528-L558)).
     - Esse auto-sync verifica todas as conexões cadastradas do usuário.
     - Aplica cooldown de **5 minutos** (`AUTO_SYNC_COOLDOWN_MS = 300.000 ms`) ([`open-finance.ts:24, 571-572`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L24)). Se a conexão foi sincronizada há menos de 5 minutos, ela é pulada (`skipped: true`).
  3. **Lock de Concorrência Atômico:** Para evitar requisições simultâneas colidindo no banco de dados, o início do sync executa um `UPDATE` condicional na tabela `open_finance_connections` setando `status = 'SYNCING'` ([`open-finance.ts:573-574`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L573-L574)). Há timeout de segurança de 20 minutos para destravar processos que tenham falhado de forma abrupta.
  4. **Telegram (F23):** Consultas financeiras e resumo diário automático usam o núcleo compartilhado `server/open-finance/sync.ts`, com cooldown manual de 60s e teto de 8s por usuário. Consulte a seção 8 para escopo, fallback e limites.

---

### 1.4 Status do Item, Erros, MFA e Consentimento Expirando
- **Verificação de Status Remoto:** No início de cada sync, o servidor consulta `getPluggyItemStatus(apiKey, itemId)` ([`open-finance.ts:612-614`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L612-L614)).
- **Condição Obrigatória:** Se `item.status !== "UPDATED" || item.executionStatus !== "SUCCESS"`, o sync é abortado imediatamente com erro ([`open-finance.ts:614`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L614)).
- **Tratamento de MFA e Login Expirado (`LOGIN_ERROR`, `WAITING_USER_INPUT`, `OUTDATED`):**
  - O status da conexão no banco passa para o status retornado pela Pluggy ou `ERROR` ([`open-finance.ts:728`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L728)).
  - O código e detalhe do erro são salvos em `lastErrorCode` na forma de JSON sanitizado sem vazar tokens ([`open-finance.ts:34-36, 725`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L34)).
  - A interface converte esse código em mensagem amigável via `connectionErrorMessage` ([`open-finance.ts:38-49`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L38-L49)), orientando o usuário a reconectar.
- **Reconexão:** Não existe botão no painel para invocar o widget em modo update com o item ID pré-existente. O usuário deve abrir o widget novamente para restabelecer o item ou resolver o login no Meu Pluggy/App do banco.
- **Expiração de Consentimento:** O Open Finance brasileiro estipula renovação periódica de consentimento (geralmente até 12 meses). O sistema não armazena a data limite de consentimento (`consentExpiresAt`). Quando o consentimento expira na instituição bancária, a Pluggy altera o status para `OUTDATED` ou `LOGIN_ERROR`, fazendo o próximo sync falhar e alertando o usuário na tela.

---

## 2. Deduplicação e Identidade de Lançamentos

### 2.1 Identidade Externa e Chave de Unicidade
- Toda transação vinda da Pluggy possui um identificador único alfanumérico (`row.id`).
- No banco de dados, a tabela `transactions` possui um índice exclusivo parcial:
  ```ts
  uniqueIndex("transactions_pluggy_identity_key")
    .on(t.userId, t.accountId, t.externalId)
    .where(sql`${t.externalId} is not null`)
  ```
  *Referência:* [`src/db/schema.ts:282`](file:///C:/Projetos/financeiro_2/src/db/schema.ts#L282).
- Gravação via Upsert Atômico (`onConflictDoUpdate`):
  Ao sincronizar, o lote é inserido com ([`open-finance.ts:688-702`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L688-L702)):
  - Alvo do conflito: `[transactions.userId, transactions.accountId, transactions.externalId]`.
  - Se a transação já existir na conta do usuário, ela **NÃO É DUPLICADA**. O banco apenas atualiza os dados bancários (`date`, `description`, `amountCents`, `kind`, `externalStatus`, `invoiceRef`, `installmentNumber`, `installmentTotal`).

### 2.2 Transações Pendentes x Efetivadas (`PENDING` vs `POSTED`)
- Quando uma compra no cartão ou transação bancária ainda não foi liquidada pelo banco, a Pluggy envia `status: "PENDING"`.
- O sistema grava a linha com `externalStatus = "PENDING"` ([`open-finance.ts:686`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L686)).
- **Regra de Ouro nos Totais e Saldos:**
  - Em todas as consultas financeiras ([`queries.ts:1144`](file:///C:/Projetos/financeiro_2/src/server/queries.ts#L1144) e [`ai-tools.ts:13`](file:///C:/Projetos/financeiro_2/src/server/telegram/ai-tools.ts#L13)), aplica-se o filtro:
    ```sql
    or(isNull(transactions.externalStatus), eq(transactions.externalStatus, 'POSTED'))
    ```
  - **Lançamentos `PENDING` não entram no cálculo de gastos, saldo de movimentações ou resumos.**
- **Quando vira Efetivada:**
  - Na sincronização seguinte após a liquidação no banco, a Pluggy devolve a mesma transação com status `POSTED`.
  - Como o `externalId` é mantido, o `onConflictDoUpdate` atualiza a mesma linha para `externalStatus = 'POSTED'` e atualiza a data/valor definitivos ([`open-finance.ts:691-697`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L691-L697)). O lançamento passa a ser computado nos relatórios automaticamente.

### 2.3 Casamento com Lançamento Manual
- **Não há conciliação automática com lançamentos manuais.**
- Lançamentos manuais possuem `origin = 'MANUAL'` e `externalId = null`. O hash de duplicata manual usa o padrão `fingerprint|m|timestamp` ([`transactions.ts:170`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L170)).
- O sync Open Finance não procura nem atualiza transações manuais semelhantes para evitar apagar ou fundir registros sem consentimento explícito.
- Para evitar duplicações no dia a dia, a aplicação bloqueia novos lançamentos manuais em contas integradas ([`transactions.ts:118`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L118)).

### 2.4 Mudança de Valor e Data
- Se o banco corrigir o valor ou a data de liquidação de uma transação e a Pluggy mantiver o mesmo ID de transação, o upsert sobrescreve `date` e `amountCents` no banco local ([`open-finance.ts:692-693`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L692-L693)).

### 2.5 Transferências entre Contas
- Em movimentações entre contas (ex: Pix da Conta Corrente A para a Poupança B), cada ponta vem no extrato do seu respectivo banco com seu próprio `externalId`.
- O categorizador automático analisa a descrição e o tipo de operação ([`categorization/index.ts:680`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L680)), marcando `isTransfer: true` se identificar transferência entre contas próprias.
- Não é criado um grupo de transferência (`transferGroupId`) artificial amarrando os dois registros; eles vivem como transações separadas marcadas como transferência, o que as remove dos totais de receitas e despesas para não duplicar patrimônio.

### 2.6 Parcelas de Cartão de Crédito
- A Pluggy fornece metadados do cartão: `creditCardMetadata.installmentNumber` e `totalInstallments` ([`schemas.ts:15-16`](file:///C:/Projetos/financeiro_2/src/server/open-finance/schemas.ts#L15-L16)).
- Cada parcela chega como uma transação própria emitida pelo banco na fatura do respectivo mês.
- O sistema grava diretamente os campos `installmentNumber` e `installmentTotal` ([`open-finance.ts:675, 698-699`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L675)). Não se criam parcelas futuras fictícias no banco de dados; cada parcela é inserida à medida que aparece nas faturas da Pluggy.

### 2.7 Estornos
- No extrato do cartão, um estorno vem com `type: "CREDIT"`.
- A regra de domínio `transactionKind("CREDIT", "CREDIT")` ([`schemas.ts:72-75`](file:///C:/Projetos/financeiro_2/src/server/open-finance/schemas.ts#L72-L75)) classifica a operação como `INCOME`, abatendo o valor da fatura ou somando como crédito de despesa.

---

## 3. Lançamentos Manuais x Importados

### 3.1 Proteção e Coexistência de Modos
- **Conta Integrada (`financeMode = 'integracao'`):**
  - O sistema impede a criação de novos lançamentos manuais via tela ou API ([`transactions.ts:118`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L118)).
  - Impede importações de arquivos OFX/CSV na conta integrada ([`import.ts:108, 331`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L108)).
  - Lançamentos manuais criados antes da integração são preservados intactos no histórico.

### 3.2 Edição de Categoria e Notas pelo Usuário (Resync Protection)
- O usuário pode editar lançamentos importados da Pluggy em `/lancamentos` ([`transactions.ts:213-220`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L213-L220)).
- **Campos protegidos:** Data, valor, conta e tipo não podem ser adulterados em transações Pluggy; apenas `categoryId` e `notes` são aceitos.
- **Aprendizado:** Quando o usuário define a categoria de um lançamento Pluggy, o sistema aprende essa preferência gravando na tabela `categoryRules` ([`transactions.ts:216`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L216)).
- **O que acontece ao sincronizar de novo:**
  - O comando SQL de conflito preserva a categoria atribuída pelo usuário usando `COALESCE` ([`open-finance.ts:694-696`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L694-L696)):
    ```sql
    categoryId: sql`COALESCE(${transactions.categoryId}, excluded.category_id)`
    ```
  - Se o usuário já categorizou o lançamento, a categoria do usuário **NUNCA É SOBRESCRITA** pela Pluggy.
  - O campo `notes` sequer é tocado no `UPDATE`, sendo mantido intacto.

### 3.3 Exclusão de Lançamento Importado (Tombstone)
- O botão comum de exclusão recusa apagar transações Pluggy ([`transactions.ts:278`](file:///C:/Projetos/financeiro_2/src/server/actions/transactions.ts#L278)).
- Para excluir, o usuário deve acionar `deletePluggyTransaction` ([`open-finance.ts:389-408`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L389-L408)) com a confirmação expressa `"EXCLUIR LANCAMENTO PLUGGY"`.
- **Mecanismo de Tombstone:**
  1. O sistema grava um registro na tabela `open_finance_deleted`: `(userId, accountId, externalId)` ([`open-finance.ts:400`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L400)).
  2. Em seguida, remove o lançamento de `transactions` ([`open-finance.ts:401`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L401)).
- **Na sincronização seguinte:**
  - O sync carrega a lista de IDs em `open_finance_deleted` ([`open-finance.ts:644-645`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L644-L645)).
  - Ao iterar nas transações da Pluggy, checa `isExternalIdentityTombstoned` ([`open-finance.ts:653`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L653)): se o ID constar na lista de excluídos, a transação é descartada (`ignoredByTombstone++`) e **NÃO VOLTA A SER IMPORTADA**.

---

## 4. Saldos das Contas

### 4.1 Cálculo: Saldo do Banco x Soma de Lançamentos
A apuração de saldos é centralizada na função `getBalances` ([`queries.ts:1109-1209`](file:///C:/Projetos/financeiro_2/src/server/queries.ts#L1109-L1209)):
```ts
balanceCents: a.financeMode === "integracao"
  ? (a.bankBalanceCents ?? 0)
  : accountBalance({ openingCents: a.openingBalanceCents, incomeCents, expenseCents })
```
*Referência:* [`src/server/queries.ts:1182`](file:///C:/Projetos/financeiro_2/src/server/queries.ts#L1182).

- **Contas em Modo Integração:**
  - O saldo exibido é **exclusivamente o snapshot bancário** (`accounts.bankBalanceCents`) capturado no último sync com a Pluggy.
  - **NÃO se somam os lançamentos do extrato sobre o saldo bancário.** O saldo vem limpo do banco; os lançamentos servem para relatórios de despesas/receitas e fluxo de caixa.
- **Contas em Modo Manual:**
  - O saldo é calculado matematicamente: `Saldo Inicial + Entradas − Saídas` de todas as transações com data $\ge$ `openingBalanceDate`.

### 4.2 Saldo Inicial e Divergência
- Em contas integradas, os campos `openingBalanceCents` e `openingBalanceDate` são ignorados.
- O alerta `needsOpeningBalance` é desativado para contas integradas ([`queries.ts:1204-1206`](file:///C:/Projetos/financeiro_2/src/server/queries.ts#L1204-L1206)).
- **Divergência / Total Incompleto:** Se uma conta estiver marcada como `integracao`, mas seu `bankBalanceCents` for `null` (por exemplo, antes do primeiro sync), o sistema ativa `totalIncomplete = true` ([`queries.ts:1190`](file:///C:/Projetos/financeiro_2/src/server/queries.ts#L1190)), avisando na tela que o patrimônio total está incompleto até que ocorra um sync com sucesso.

---

## 5. Cartão de Crédito e Faturas

### 5.1 Faturas Bancárias (`openFinanceInvoices`)
- Para contas de cartão de crédito (`accounts.type === 'CREDIT_CARD'`), o sync busca as faturas na Pluggy via `getPluggyBills(apiKey, remote.id)` (`GET /bills?accountId=...`) ([`client.ts:167-171`](file:///C:/Projetos/financeiro_2/src/server/open-finance/client.ts#L167-L171)).
- As faturas são salvas na tabela `open_finance_invoices` ([`schema.ts:310-320`](file:///C:/Projetos/financeiro_2/src/db/schema.ts#L310-L320), [`open-finance.ts:705-712`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L705-L712)):
  - `invoiceRef`: referência no formato `YYYY-MM` derivada da data de vencimento da fatura (`bill.dueDate`).
  - `dueDate`: data de vencimento.
  - `totalAmountCents`: valor total da fatura em centavos.
  - `minimumPaymentCents`: pagamento mínimo.

### 5.2 Limites do Cartão
- Ao sincronizar o cartão, a Pluggy retorna dados de crédito que são armazenados diretamente na conta local ([`open-finance.ts:648`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L648)):
  - `creditLimitCents`: limite total de crédito.
  - `availableCreditCents`: limite de crédito atualmente disponível.
  - `creditSnapshotAt`: timestamp da leitura dos limites.

### 5.3 Associação de Lançamentos à Fatura (`invoiceRef`)
Para cada lançamento importado de cartão, o sistema determina a qual fatura ele pertence com a seguinte hierarquia ([`open-finance.ts:672-674`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts#L672-L674)):
1. **Pelo `billId` da Pluggy:** Se a transação trouxer um `billId` presente nas faturas baixadas, vincula ao mês de vencimento daquela fatura específica.
2. **Pela previsão da fatura:** Se não houver `billId`, usa o mês de `row.billForecastDate`.
3. **Pela regra de corte local:** Se a Pluggy não enviar metadados de fatura, chama `resolveTransactionInvoiceRef` ([`invoices.ts:1-25`](file:///C:/Projetos/financeiro_2/src/lib/invoices.ts)), que calcula o mês de vencimento com base nos dias de fechamento (`closingDay`) e vencimento (`dueDay`) configurados na conta local.

### 5.4 Pagamento de Fatura (Opção C de Produto)
- A linha de crédito no cartão que representa "pagamento de fatura recebido" (`operationType === 'PAGAMENTO_FATURA'`) é **IGNORADA** e não é importada ([`schemas.ts:81-87`](file:///C:/Projetos/financeiro_2/src/server/open-finance/schemas.ts#L81-L87)).
- Motivo: As despesas reais já foram registradas item a item no cartão (regime de competência/accrual). Se o pagamento também fosse importado como entrada no cartão, haveria distorção contábil.
- O pagamento da fatura é computado no regime de caixa (cash) através do débito gerado na conta corrente de onde saiu o dinheiro.

---

## 6. Importações por Arquivo (OFX e CSV)

O projeto possui um módulo completo e robusto de importação de extratos manuais em [`src/server/actions/import.ts`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts):

1. **Prévia e Validação (`previewImport`, linhas 94–309):**
   - O usuário faz upload de um arquivo `.ofx` ou `.csv` e escolhe a conta de destino.
   - Se a conta estiver em modo `integracao`, a importação é bloqueada no servidor ([`import.ts:108`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L108)).
   - Para cartão de crédito, o usuário seleciona o mês de referência da fatura ([`import.ts:111-114`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L111-L114)), e linhas de confirmação de pagamento de fatura são expurgadas automaticamente ([`import.ts:130`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L130)).
   - Calcula um fingerprint para cada linha:
     `fingerprint = [accountId, day, amountCents, normalize(description).slice(0, 40)].join("|")` ([`categorize.ts:45-53`](file:///C:/Projetos/financeiro_2/src/lib/categorize.ts#L45-L53)).
   - Se o fingerprint já existir no banco, marca a linha como `possibleDuplicate = true` ([`import.ts:234`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L234)), alertando o usuário sem desmarcá-la forçadamente.
2. **Confirmação e Substituição de Período (`commitImport`, linhas 311–479):**
   - Cria um registro em `import_batches` ([`schema.ts:538-567`](file:///C:/Projetos/financeiro_2/src/db/schema.ts#L538-L567)).
   - **Opção Substituir Período (`replacePeriod`, padrão true):**
     - Em cartão de crédito: apaga lançamentos importados anteriormente que pertenciam àquele mesmo mês de fatura (`invoiceRef`) ([`import.ts:360-379`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L360-L379)).
     - Em conta corrente: apaga lançamentos que vieram de importações anteriores (`isNotNull(importBatchId)`) no intervalo de datas do arquivo ([`import.ts:380-406`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L380-L406)).
     - **Lançamentos manuais (`origin = 'MANUAL'`) NUNCA são apagados** na substituição de período.
   - Grava as novas transações com `origin = 'CSV' | 'OFX'` usando `.onConflictDoNothing()` contra o fingerprint ([`import.ts:455`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L455)).
   - Dispara o aprendizado de categorias para o usuário via `learnCategoryRule` ([`import.ts:463`](file:///C:/Projetos/financeiro_2/src/server/actions/import.ts#L463)).
3. **Desfazer Importação (`deleteImportBatch`, linhas 486–507):**
   - Permite apagar de uma só vez todos os lançamentos atrelados a um lote de importação com erro.

---

## 7. Sincronização entre Dispositivos, PWA e Offline

- **Arquitetura 100% Client-Server:**
  - O aplicativo utiliza Next.js 16 (App Router) conectado diretamente ao PostgreSQL via Drizzle ORM.
  - A sincronização entre dispositivos (computador, celular, tablet) é imediata porque o estado financeiro reside exclusivamente no banco de dados central.
- **Service Worker / PWA (`public/sw.js`):**
  - O service worker ([`sw.js:1-124`](file:///C:/Projetos/financeiro_2/public/sw.js#L1-L124)) implementa política estrita de segurança de dados:
    - **NUNCA armazena em cache páginas privadas ou autenticadas** (`/`, `/painel`, `/lancamentos`, etc.) ([`sw.js:25-28`](file:///C:/Projetos/financeiro_2/public/sw.js#L25-L28)).
    - **NUNCA armazena respostas de rotas de API** (`/api/*`).
    - Cacheia estritamente arquivos estáticos com hash (`/_next/static/*`), ícones públicos e fontes.
- **Modo Offline:**
  - **Não há banco de dados local ou sincronização offline** (sem IndexedDB, WatermelonDB ou filas de mutação offline).
  - Se o usuário perder a conexão com a internet, o Service Worker intercepta a navegação e exibe a página estática `public/offline.html` ([`sw.js:9, 52`](file:///C:/Projetos/financeiro_2/public/sw.js#L9)). Não é possível criar ou editar lançamentos sem conexão com a internet.

---

## 8. Bot do Telegram

- **F23:** consultas financeiras tentam atualizar a integração antes de ler o banco. O bot não cria lançamentos manuais nem permite escrita arbitrária via IA; a atualização é feita exclusivamente pelo importador Open Finance já existente.
- **Núcleo único:** `src/server/open-finance/sync.ts:syncOpenFinanceForUser` atende o botão manual, o auto-sync do painel, as consultas do bot e o resumo diário automático. As Server Actions continuam obtendo o usuário da sessão; o Telegram usa o vínculo do chat. Toda conexão, credencial, conta e gravação mantém filtro pelo dono.
- **Estado único:** `lastAttemptAt` aplica os 60s do modo manual ao botão, bot e cron. O painel mantém seus 5min sobre a mesma coluna. O claim `UPDATE ... status = 'SYNCING'` continua atômico por conexão/dono, inclusive em concorrência entre esses gatilhos. Tentativas com falha também entram no cooldown; não há migration nem segundo relógio.
- **Comandos:** `/saldo`, `/cartao`, `/previsao`, `/hoje`, `/assinaturas`, `/resumo` e `/relatorio` atualizam antes de suas leituras. Perguntas livres atualizam uma vez, ao usar a primeira ferramenta financeira de `executeReadTool`. Sem leitura financeira, sem vínculo, em replay/rate limit ou sem integração, não há chamada Pluggy. `/ajuda`, `/start`, `/pausar` e comandos desconhecidos não sincronizam.
- **Orçamento de tempo:** `src/server/open-finance/refresh.ts` limita a tentativa inteira a 8s por usuário, com conexões em sequência. O sinal de cancelamento é propagado ao HTTP/paginação Pluggy e às verificações da transação de importação; impede novas chamadas depois do teto. O fallback não aguarda eventual limpeza do claim. O webhook declara 60s; o provedor IA mantém seu teto de 18s com ferramentas.
- **Resposta:** no cooldown, lê o banco e informa “Atualizado há X s/min/h” com base no snapshot concluído mais antigo. Falha/timeout não impede consulta: usa dados salvos e avisa “Não consegui atualizar agora; dados de HH:MM (DD/MM)”, em São Paulo. Sem snapshot, informa que não há horário conhecido. O aviso não muda a origem dos valores nem inventa atualização bancária. Uma mensagem, sem `parse_mode`, até 4096 caracteres.
- **Resumo às 08:00:** `/api/cron/daily-summary` tenta o mesmo refresh de 60s após reservar o envio e antes de renderizar o resumo. Pool de três usuários, 8s por refresh, `maxDuration=300` e orçamento de lote de 240s. Falha de sync de um usuário ainda envia o resumo salvo dele, com aviso, e não bloqueia os demais. Chave `${dia}:ds` (13 caracteres), opt-out e claim de envio permanecem iguais. Os demais crons de insights não ganharam sync nesta tarefa.
- **Limites Pluggy:** o fluxo reaproveita as consultas existentes da integração; não força reprocessamento do item nem burla quota do provedor. Não há webhook novo nem polling adicional. Nenhum dado/token é logado pelo adaptador do bot.
- **Testes:** mocks para HTTP/banco, incluindo concorrência, cooldown, timeout, falha e cron. Nunca usar updates ou IDs falsos contra produção: o watermark de deduplicação pode bloquear mensagens reais (B3b).

---

## 9. Casos de Borda, Riscos e Oportunidades de Melhoria

1. **Ausência de Webhook Bancário Contínuo (Risco de Defasagem):**
   - Não há webhook Pluggy nem cron independente para todos os usuários. A F23 acrescenta refresh antes das consultas e do resumo diário do Telegram, limitado aos usuários elegíveis.
   - Sem acesso ao painel, sync manual, consulta ao bot ou resumo automático habilitado, os dados podem permanecer defasados. Um refresh lê o snapshot disponível na Pluggy, sem forçar novo processamento do banco.
2. **Reconexão de Item com IDs Remotos Novos (Risco de Duplicação em Massa):**
   - Se uma conexão bancária cair e o usuário criar uma nova conexão com novo `itemId` (em vez de recuperar o anterior), as transações passadas virão com novos `row.id` da Pluggy.
   - Como o índice de unicidade depende de `externalId`, o sistema não reconhecerá que são as mesmas transações do item antigo e reimportará tudo a partir da data de corte (`importFromDate`), duplicando o extrato se houver sobreposição.
3. **Casamento entre Manual e Importado (Sem Conciliação Prévia):**
   - Transações lançadas manualmente antes da ativação da integração não são conciliadas nem substituídas pela transação correspondente da Pluggy. Se o usuário comprou algo por R$ 50 no débito e anotou à mão, ao sincronizar a conta o extrato terá duas entradas de R$ 50.
4. **Exclusão de Transação Importada sem Opção de Recuperação:**
   - Ao apagar uma transação Pluggy via `deletePluggyTransaction`, é gravado um tombstone definitivo em `openFinanceDeleted`. Não existe interface para revogar o tombstone caso a exclusão tenha sido um engano; aquela transação fica impedida de ser importada para sempre.
5. **Transação `PENDING` que Muda de `externalId` ao Virar `POSTED`:**
   - Em certos conectores bancários na Pluggy, a transação pendente recebe um ID provisório e, ao ser liquidada, ganha outro ID definitivo. Se isso ocorrer, a linha pendente continuará gravada no banco com `externalStatus = 'PENDING'` e surgirá uma nova linha com `POSTED`. Embora `PENDING` não afete os saldos, gera acúmulo de registros órfãos.
6. **Fuso Horário e Ancoragem de Datas Civis:**
   - O sistema utiliza `anchorPluggyCivilDate` ([`cutoff.ts:26-34`](file:///C:/Projetos/financeiro_2/src/server/open-finance/cutoff.ts#L26-L34)), fixando a data às 12:00:00 UTC no fuso `America/Sao_Paulo`. Isso resolve a maioria dos problemas de virada de dia, mas compras internacionais ou transações bancárias realizadas perto da meia-noite em fusos divergentes do emissor podem ocasionalmente cair no dia civil adjacente.
7. **Precisão Monetária Rigorosa:**
   - Todo o sistema opera com inteiros em centavos ([`money.ts`](file:///C:/Projetos/financeiro_2/src/lib/money.ts), [`schemas.ts:64-70`](file:///C:/Projetos/financeiro_2/src/server/open-finance/schemas.ts#L64-L70)) com proteção contra overflow (`MAX_CENTS = 2.147.483.647`), eliminando completamente erros de ponto flutuante em somas de centavos.
8. **Segurança de Credenciais e Tokens:**
   - A gestão criptográfica é de alto nível: chaves e segredos em repouso são protegidos com AES-256-GCM com AAD atrelando ao `userId`, e o Connect Token do widget expira em 30 minutos com escopo limitado ao usuário.
9. **Rate Limit em Memória:**
   - `checkRateLimit` ([`rate-limit.ts`](file:///C:/Projetos/financeiro_2/src/lib/rate-limit.ts)) opera na memória local da instância Node.js. Em deploys serverless escalados horizontalmente, cada instância possui seu próprio contador. Contudo, o lock de sincronização em `open_finance_connections.status` é atômico no banco de dados e protege contra concorrência entre instâncias.

---

## 10. Passo a Passo por Situação

### Situação A: "Conectei um banco novo"
1. Usuário acessa `/configuracoes/integracao`.
2. Se for a primeira vez, salva `clientId` e `clientSecret` (testados via `POST /auth` e criptografados em AES-256-GCM).
3. Clica em conectar banco; o backend emite um `connectToken` efêmero via `POST /connect_token` e abre o modal do Pluggy Connect.
4. Usuário escolhe a instituição, informa credenciais bancárias e conclui o consentimento.
5. O widget retorna o `itemId` para o frontend, que chama `connectPluggyItem`.
6. O backend valida se `item.clientUserId === userId` (Anti-IDOR) e grava a conexão em `open_finance_connections` com `importFromDate` fixado no dia 1º do mês atual.
7. O sync inicial roda, mas como não há contas vinculadas, para com status `NO_LINKED_ACCOUNTS`.
8. Usuário clica em "Contas vinculadas", descobre as contas externas (`GET /accounts`) e vincula a conta corrente ou cartão local a cada conta Pluggy (`linkOpenFinanceAccount`).
9. A conta local muda para `financeMode = 'integracao'`.
10. Usuário clica em "Sincronizar agora": o backend baixa o extrato a partir de `importFromDate`, salva o saldo bancário em `accounts.bankBalanceCents`, descobre faturas do cartão e insere as transações via upsert com categorização automática.

### Situação B: "Sincronização diária"
1. **Pelo Painel:** O usuário abre `/painel`.
2. O componente `AutoSync` dispara `autoSyncOpenFinance()`.
3. O servidor verifica `lastAttemptAt`: se a última tentativa ocorreu há mais de 5 minutos, inicia a sincronização; se tiver menos de 5 minutos, ignora silenciosamente.
4. Adquire o lock mudando `status = 'SYNCING'`.
5. Busca o saldo atual e faturas na Pluggy, atualizando o saldo bancário da conta.
6. Puxa transações desde `importFromDate`.
7. Transações que já existiam são atualizadas; transações novas são categorizadas e inseridas; transações excluídas anteriormente continuam bloqueadas pelos tombstones.
8. Libera o lock com `status = 'UPDATED'` e grava `lastSyncedAt`. O painel reflete o novo saldo bancário instantaneamente.

### Situação C: "Banco pediu login de novo (MFA expirado / Senha alterada)"
1. O sync (manual ou automático) chama `getPluggyItemStatus(apiKey, itemId)`.
2. A Pluggy responde com `status: "LOGIN_ERROR"` ou `"WAITING_USER_INPUT"`.
3. A verificação `item.status !== "UPDATED"` falha e lança exceção.
4. O servidor atualiza a conexão para `status = 'LOGIN_ERROR'` e registra o erro em `lastErrorCode`.
5. Os dados e saldos atuais já salvos no banco de dados são preservados (nada é apagado).
6. Na interface de integração, a barra de status fica vermelha exibindo o aviso amigável: *"Autenticação rejeitada / confira suas credenciais bancárias"*.
7. O usuário abre o widget ou acessa o aplicativo do banco para autorizar a conexão novamente.

### Situação D: "Editei um lançamento importado"
1. Na listagem de `/lancamentos`, o usuário clica no botão de edição de um lançamento Pluggy.
2. O modal abre permitindo alterar **apenas** a Categoria e as Notas (data, valor e conta ficam travados).
3. Ao salvar, `updateTransaction` atualiza `categoryId` e `notes` no banco de dados.
4. O sistema grava a regra aprendida em `categoryRules` (`source: 'USER'`).
5. Quando um novo sync é executado no futuro, o comando `onConflictDoUpdate` usa `COALESCE(transactions.categoryId, excluded.category_id)`:
   - A categoria definida manualmente pelo usuário **continua preservada**.
   - A nota digitada pelo usuário não é tocada.

### Situação E: "Apaguei um lançamento importado"
1. Na tela de `/lancamentos`, o usuário clica em excluir uma transação Pluggy.
2. A aplicação exige confirmação com a frase `"EXCLUIR LANCAMENTO PLUGGY"`.
3. `deletePluggyTransaction` grava o `externalId` na tabela `open_finance_deleted` e em seguida deleta o registro da tabela `transactions`.
4. Na sincronização seguinte com a Pluggy, a transação continua vindo no payload da API do banco, mas o filtro de tombstones (`isExternalIdentityTombstoned`) identifica o ID na lista de excluídos.
5. A transação é descartada e **não volta a ser inserida**.

### Situação F: "Transação pendente virou efetivada"
1. No primeiro sync após uma compra no cartão, a transação chega com `status: "PENDING"`.
2. Ela é gravada no banco com `externalStatus = 'PENDING'`.
3. Nas consultas de saldos, faturas e relatórios, ela é ignorada pelo filtro `or(isNull(externalStatus), eq(externalStatus, 'POSTED'))`.
4. Dias depois, o banco processa a fatura e a transação passa a `status: "POSTED"`.
5. No sync seguinte, a Pluggy devolve o registro com o mesmo `id` e `status: "POSTED"`.
6. O `onConflictDoUpdate` detecta a chave `(userId, accountId, externalId)` e atualiza o campo `externalStatus` para `'POSTED'`.
7. O lançamento passa a figurar imediatamente no total de despesas e nos relatórios de fatura.
