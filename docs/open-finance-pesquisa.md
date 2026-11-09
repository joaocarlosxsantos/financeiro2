# Pesquisa e Arquitetura: Integração de Open Finance no Financeiro 2.0

> **Data da pesquisa:** Novembro de 2026  
> **Escopo:** Sincronização de saldo, extrato e cartão de crédito para banco do dono (Pessoa Física, Brasil)  
> **Projeto:** `financeiro_2` (Next.js 15, Drizzle ORM, Neon PostgreSQL)  
> **Arquivo:** `docs/open-finance-pesquisa.md`  

---

## 1. Sumário Executivo e Veredito

Para um desenvolvedor pessoa física que deseja sincronizar suas próprias contas bancárias pessoais (saldo, extrato e fatura de cartão de crédito) com seu sistema próprio (`financeiro_2`), existe **apenas uma solução real, legal e de custo zero no mercado brasileiro atual: o Pluggy através da iniciativa "Meu Pluggy" (`meu.pluggy.ai`)**.

* **Vencedor:** **Pluggy ("Meu Pluggy")** — Gratuito para uso estritamente pessoal (até 5 contas conectadas), sem necessidade de CNPJ, sem contrato empresarial, com APIs completas para leitura de saldos, extratos e faturas.
* **Inviáveis para PF:** **Belvo**, **Celcoin** e **Klavi** são soluções B2B corporativas, exigem CNPJ, aprovação comercial e mensalidades mínimas a partir de US$ 1.000/mês ou R$ 1.500–R$ 2.500/mês.
* **Descontinuada:** **Quanto** (paralisou novos contratos e serviços em 2023 após corte de 85% do quadro e site fora do ar).
* **Impossível para PF:** **Open Finance Brasil Direto (sem intermediários)** exige ser Instituição Financeira/Pagamento regulada pelo Banco Central, com custo anual milionário, certificações de segurança FAPI 1.0 Advanced e mTLS ICP-Brasil.

---

## 2. Análise Detalhada das Opções

### 2.1 Pluggy & "Meu Pluggy" (`meu.pluggy.ai`)
* **O que é:** A Pluggy é uma das principais agregadoras de Open Finance e iniciadoras de pagamento do Brasil, homologada pelo Banco Central.
* **Iniciativa "Meu Pluggy":** Criada especificamente para desenvolvedores e pessoas físicas que querem sincronizar **suas próprias contas** com planilhas, agentes de IA ou aplicativos de controle financeiro pessoal.
* **Como funciona:**
  1. O dono acessa [meu.pluggy.ai](https://meu.pluggy.ai) com seu e-mail pessoal e conecta seus bancos via fluxo padrão de Open Finance (redirecionamento do banco).
  2. Acessa o [dashboard.pluggy.ai](https://dashboard.pluggy.ai) com o mesmo e-mail e cria uma aplicação para obter `clientId` e `clientSecret`.
  3. No backend do app, troca essas chaves por uma `apiKey` temporária (`POST /auth`) e consome os endpoints `/accounts`, `/transactions` e `/bills` para ler os dados das próprias contas.
* **Restrição importante:** Serve exclusivamente para uso pessoal. Não pode ser usado comercialmente para conectar contas de terceiros.

### 2.2 Belvo
* **O que é:** Plataforma de APIs financeiras com atuação no Brasil, México e Colômbia.
* **Viabilidade para PF:** Nula para produção. A Belvo oferece apenas um ambiente de **Sandbox gratuito** para testes de desenvolvimento com dados fictícios.
* **Preço Comercial:** O plano de entrada (*Launch*) custa a partir de **US$ 1.000/mês** (aprox. R$ 5.500 a R$ 6.000/mês na cotação atual). Planos de escala (*Growth*) são sob consulta.
* **Exigências:** Exige CNPJ, contato com o time comercial e assinatura de contrato empresarial.

### 2.3 Quanto
* **O que é:** Foi uma das pioneiras em infraestrutura de Open Banking no Brasil, fundada por Ricardo Taveira e investida por Itaú e Bradesco.
* **Status atual:** Em maio de 2023, após dificuldades de captação de recursos, demitiu 85% da equipe, paralisou o atendimento a novos clientes e desativou seu site oficial (`contaquanto.com.br`). Está inativa para novas adesões de desenvolvedores.

### 2.4 Celcoin (Open Finance as a Service & BaaS)
* **O que é:** Provedora de infraestrutura de Banking as a Service (BaaS) e Open Finance (Fase 2 de Dados e Fase 3 de Iniciação de Pagamentos/ITP).
* **Viabilidade para PF:** Nula para produção pessoal. A Celcoin disponibiliza documentação aberta e Sandbox no portal `developers.celcoin.com.br`, mas a contratação é puramente B2B.
* **Preço Comercial:** Não divulga tabela aberta. Opera com contratos corporativos híbridos (franquia mensal mínima estimada entre R$ 1.500 e R$ 3.000 + custo por chamada/transação excedente e eventual taxa de setup). Exige CNPJ.

### 2.5 Klavi
* **O que é:** Fintech B2B de inteligência de crédito e agregação de dados via Open Finance.
* **Viabilidade para PF:** Nula para produção. O Sandbox é liberado apenas após triagem via e-mail (`suporte@klavi.ai`), sem preços públicos. Foco em grandes empresas, fintechs e financeiras que concedem crédito a pessoas físicas.

### 2.6 Open Finance Brasil Direto (Sem Intermediários)
* **O que é:** Conectar diretamente aos endpoints dos bancos brasileiros (Banco do Brasil, Itaú, Nubank, etc.) que compõem o ecossistema oficial do Open Finance Brasil regulado pelo Banco Central (BCB).
* **Exigências Legais e Regulatórias:**
  * Ser Instituição Financeira (IF) ou Instituição de Pagamento (IP) autorizada a funcionar pelo Banco Central (Resoluções Conjuntas CMN/BCB nº 1/2020 e nº 32/2020).
  * Adesão formal à Convenção da Estrutura de Governança do Open Finance Brasil e pagamento de taxas de custeio do diretório.
  * Certificados digitais corporativos ICP-Brasil homologados no Diretório Central.
  * Implementação obrigatória de segurança bancária: Mutual TLS (mTLS), especificação OpenID FAPI 1.0 Advanced / FAPI 2.0, assinatura de payloads (JWS/JWT).
  * Conformance tests oficiais e auditoria de segurança da informação (ISO 27001 / SOC 2).
* **Veredito:** Jurídica e financeiramente inviável para pessoa física ou pequenas empresas de software.

---

## 3. Tabela Comparativa de Custos e Limites

| Provedor | Modelo de Preço | Plano Grátis / Sandbox | Limites no Grátis | Preço em Produção | Viável para Uso Pessoal (PF)? | Data da Verificação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pluggy ("Meu Pluggy")** | Pessoal / Dev | **Sim (100% grátis)** | Até 5 contas do dono conectadas | **R$ 0,00** | **SIM (Recomendado)** | Nov/2026 |
| **Pluggy (Comercial)** | B2B SaaS | Sim (Sandbox ilimitado + 15 dias trial) | Mock / Teste | A partir de R$ 2.500/mês (Dados) | Não (Custo corporativo) | Nov/2026 |
| **Belvo** | B2B SaaS | Sim (Sandbox ilimitado) | Mock / Teste | A partir de US$ 1.000/mês (~R$ 5.500/mês) | Não (Custo em dólar) | Nov/2026 |
| **Celcoin** | B2B / BaaS | Sim (Sandbox no portal) | Mock / Teste | Sob consulta (franquia mínima mensal) | Não (Exige CNPJ) | Nov/2026 |
| **Klavi** | B2B / Crédito | Sim (mediante solicitação) | Mock / Teste | Sob consulta comercial B2B | Não (Exige CNPJ) | Nov/2026 |
| **Quanto** | B2B | Não disponível | Descontinuado | Descontinuado em 2023 | Não (Inativa) | Nov/2026 |
| **Open Finance Direto** | Regulado BCB | Não para PF | Inexistente | > R$ 100.000/ano em infra e compliance | Não (Exige ser Banco/IP) | Nov/2026 |

---

## 4. O que o Dono Precisa Providenciar

Para implementar a integração no `financeiro_2` utilizando o **Meu Pluggy**:

1. **Documentação / Pessoa Jurídica:**
   * **NÃO precisa de CNPJ.** O cadastro e o consentimento bancário são realizados com o CPF do dono.
2. **Contas e Chaves de Acesso:**
   * **Conta no Meu Pluggy (`meu.pluggy.ai`):** Cadastro simples com e-mail e senha. É onde o dono conecta os bancos (Itaú, Nubank, Bradesco, etc.).
   * **Conta no Dashboard de Desenvolvedor (`dashboard.pluggy.ai`):** Cadastro com o mesmo e-mail para criar a aplicação e gerar:
     * `PLUGGY_CLIENT_ID`
     * `PLUGGY_CLIENT_SECRET`
3. **Mecanismo de Autenticação da API:**
   * A aplicação envia `POST https://api.pluggy.ai/auth` com o `clientId` e `clientSecret`.
   * A Pluggy devolve um `apiKey` (JWT) válido por **2 horas**.
   * O backend do `financeiro_2` deve manter essa chave em memória/cache e renová-la quando expirar.
4. **Consentimento Bancário e Validade:**
   * O consentimento é concedido diretamente no aplicativo do banco pelo titular através do fluxo de Open Finance.
   * Conforme a regulamentação do Banco Central do Brasil, o consentimento tem **validade máxima de 12 meses (365 dias)**.
   * Ao expirar ou caso seja revogado pelo usuário no app do banco, a conexão entra em status `LOGIN_ERROR` / `CONSENT_EXPIRED`, necessitando que o dono acesse o `meu.pluggy.ai` (ou um widget) para renovar a autorização.
5. **Webhooks vs Sincronização On-Demand:**
   * **Webhooks:** A Pluggy pode enviar notificações automáticas quando novos dados chegarem (`item/updated`, `transactions/created`). Requer um endpoint HTTPS público configurado no dashboard.
   * **Abordagem recomendada para uso pessoal:** Sincronização **Sob Demanda** (botão na tela do sistema) combinada com um **Cron Job diário** (ex: rota `/api/cron/sync-banks` às 06:00). Isso dispensa a dependência de túneis locais (ngrok/Cloudflare Tunnel) em desenvolvimento e garante previsibilidade.

---

## 5. Cobertura de Bancos e Dados

### 5.1 Bancos Suportados no Brasil
A Pluggy conecta praticamente todas as instituições participantes do Open Finance regulado brasileiro, incluindo:
* **Tradicionais:** Itaú (Unibanco e Personnalité), Banco do Brasil, Bradesco, Santander, Caixa Econômica Federal.
* **Digitais:** Nubank, Banco Inter, C6 Bank, Mercado Pago, PicPay, PagBank, Neon, BS2.
* **Investimentos e Cooperativas:** XP Investimentos, BTG Pactual, Rico, Clear, Sicredi, Sicoob, Banco Safra.

### 5.2 Tipos de Dados Retornados e Endpoints

1. **Contas e Saldos (`GET /accounts?itemId={id}`):**
   * Retorna contas bancárias (`type: 'BANK'`, subtipos `CHECKING_ACCOUNT`, `SAVINGS_ACCOUNT`).
   * Saldo disponível (`balance`), saldo bloqueado/projetado, moeda, número de agência/conta.
2. **Extrato Bancário (`GET /transactions?accountId={id}`):**
   * Histórico de até 12 meses.
   * Transações com data, descrição bruta do banco, descrição limpa/enriquecida pela Pluggy, valor monetário (float em Reais), tipo (`DEBIT` ou `CREDIT`), status (`POSTED` ou `PENDING`).
3. **Cartões de Crédito e Faturas:**
   * Contas de cartão (`type: 'CREDIT'`, subtipo `CREDIT_CARD`).
   * Limites: limite total (`creditData.creditLimit`), limite disponível (`creditData.availableCreditLimit`).
   * Faturas (`GET /bills?accountId={id}`): lista as faturas abertas, fechadas e futuras, data de vencimento (`dueDate`), valor total da fatura (`totalAmount`), pagamento mínimo e encargos.
   * Transações da fatura (`GET /bills/{id}/transactions` ou via `/transactions` filtrando pela conta de crédito): detalhamento compra a compra, identificação de parcelas (ex: "3/10").

---

## 6. Recomendação e Esboço de Arquitetura para o `financeiro_2`

### 6.1 Princípio de Segurança e Guarda de Credenciais
* **Segredos Versionados: PROIBIDO.** Nunca gravar `clientId` ou `clientSecret` em arquivos do Git.
* **Armazenamento:**
  * Local: arquivo `.env.local` (já ignorado pelo `.gitignore`).
  * Produção: Configurado nas Environment Variables da hospedagem (ex: Vercel / Docker secrets).
* **Variáveis necessárias:**
  ```env
  PLUGGY_CLIENT_ID="seu-client-id-uuid"
  PLUGGY_CLIENT_SECRET="seu-client-secret"
  # Opcional, para proteger a rota de sincronização automática via cron:
  CRON_SECRET="chave-aleatoria-de-32-bytes"
  ```

### 6.2 Modelagem de Dados no Drizzle ORM (`src/db/schema.ts`)

Para suportar o Open Finance sem quebrar o ecossistema existente de contas e importações, propõe-se:

1. **Evolução do Enum `importSource`:**
   Adicionar `'OPEN_FINANCE'` ao enum existente:
   ```typescript
   export const importSource = pgEnum("import_source", ["CSV", "OFX", "OPEN_FINANCE"]);
   ```

2. **Novas Tabelas de Apoio:**
   * `open_finance_connections`: Registra a conexão bancária (Item da Pluggy).
     * `id`: varchar PK (UUID via `createId()`)
     * `userId`: text / varchar referenciando o usuário
     * `pluggyItemId`: text NOT NULL (ID do Item na Pluggy)
     * `connectorName`: text (ex: "Nubank", "Itaú")
     * `status`: text (ex: "UPDATED", "UPDATING", "LOGIN_ERROR", "WAITING_USER_INPUT")
     * `consentExpiresAt`: timestamp with time zone (marca os 12 meses)
     * `lastSyncedAt`: timestamp with time zone
     * `createdAt`, `updatedAt`
   * `open_finance_accounts`: Vincula uma conta da Pluggy à conta interna da tabela `accounts`.
     * `id`: varchar PK
     * `connectionId`: FK para `open_finance_connections.id`
     * `accountId`: FK para `accounts.id` (a conta correspondente no `financeiro_2`)
     * `pluggyAccountId`: text NOT NULL UNIQUE
     * `accountType`: text ('BANK', 'CREDIT')
     * `subtype`: text ('CHECKING_ACCOUNT', 'CREDIT_CARD', etc.)
     * `lastSyncAt`: timestamp with time zone
   * `open_finance_sync_logs`: Auditoria de cada sincronização (quantidade de novas transações, atualizações de saldo, falhas).

3. **Ajuste na Tabela `transactions`:**
   * Garantir que haja um campo `externalId` (text) e um índice único composto `(accountId, externalId)` para **deduplicação idempotente**. Se o Open Finance rodar duas vezes no mesmo dia, transações já inseridas não serão duplicadas.
   * **Regra de Centavos (Regra de Ouro do Projeto):** A API da Pluggy devolve valores em float decimal (ex: `-45.90`). Na ingestão para o Drizzle, o valor DEVE ser convertido obrigatoriamente para inteiro em centavos:
     ```typescript
     const amountInCents = Math.round(pluggyTx.amount * 100);
     ```

### 6.3 Fluxo de Sincronização

```
[ Usuário / Botão "Sincronizar" ]  OU  [ Vercel Cron /api/cron/sync-banks ]
                │
                ▼
   [ Next.js Server Action / Route ]
                │
                ├─► 1. Autentica na Pluggy (POST /auth -> pega apiKey temporária em cache)
                ├─► 2. Para cada conexão ativa em open_finance_connections:
                │       ├─► GET /accounts?itemId={pluggyItemId}
                │       │     └─► Atualiza saldo atual da conta (convertido para centavos)
                │       ├─► GET /transactions?accountId={pluggyAccountId}&from={lastSync}
                │       │     └─► Mapeia para Drizzle transactions (com externalId para deduplicação)
                │       └─► Se for CREDIT_CARD:
                │             └─► GET /bills?accountId={pluggyAccountId}
                │                   └─► Atualiza invoices (vencimento, fechamento, totalAmount)
                │
                └─► 3. Registra log de sincronização e atualiza lastSyncedAt
```

### 6.4 Auditoria de Segurança e Vulnerabilidades Identificadas
1. **Validação de Entrada e Webhooks:** Caso webhooks da Pluggy venham a ser configurados no futuro, deve-se verificar o header de autenticação/assinatura (`X-Signature` ou header fixo de segredo) para evitar que invasores forjem requisições POST para a rota `/api/webhooks/pluggy`.
2. **Exposição de Segredos:** As credenciais `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` devem ser acessadas exclusivamente no ambiente Server-Side (Server Actions ou Route Handlers). Nunca prefixar com `NEXT_PUBLIC_`.
3. **Deduplicação de Transações Mistas:** Se o usuário já importar extratos via OFX/CSV e também sincronizar via Open Finance, deve haver uma conferência por `(accountId, date, amountInCents)` para alertar ou ignorar lançamentos idênticos já existentes.
4. **Tratamento de Erros e Rate Limits:** A Pluggy possui limites de requisições por minuto. A rotina de sincronização deve conter backoff exponencial e nunca quebrar se o banco retornar erro temporário (comum em janelas de manutenção bancária de madrugada).

---

## 7. Referências e Fontes Consultadas

1. **Pluggy — Página Oficial de Planos e Preços:**  
   [https://pluggy.ai/pricing](https://pluggy.ai/pricing) — Consultado em Nov/2026.
2. **Meu Pluggy — Portal de Acesso e Guia do Desenvolvedor Pessoal:**  
   [https://meu.pluggy.ai](https://meu.pluggy.ai) e [Documentação de Integração Meu Pluggy](https://docs.pluggy.ai) — Consultado em Nov/2026.
3. **Pluggy Docs — Autenticação e Endpoints (`/auth`, `/accounts`, `/transactions`, `/bills`):**  
   [https://docs.pluggy.ai](https://docs.pluggy.ai) — Consultado em Nov/2026.
4. **Belvo Brasil — Tabela de Preços e Programa de Startups:**  
   [https://belvo.com/pricing/](https://belvo.com/pricing/) — Consultado em Nov/2026.
5. **Celcoin — Documentação do Desenvolvedor e Open Finance:**  
   [https://developers.celcoin.com.br](https://developers.celcoin.com.br) e [https://www.celcoin.com.br](https://www.celcoin.com.br) — Consultado em Nov/2026.
6. **Klavi — Portal de Desenvolvedores e Open Finance:**  
   [https://klavi.ai](https://klavi.ai) e [https://docs.klavi.ai](https://docs.klavi.ai) — Consultado em Nov/2026.
7. **Exame / Finsiders Brasil — Situação e Encerramento Operacional da Quanto:**  
   Notícias de reestruturação e paralisação de novos serviços — Maio/2023.
8. **Banco Central do Brasil & Estrutura de Governança do Open Finance Brasil:**  
   Resoluções Conjuntas CMN/BCB nº 1/2020 e nº 32/2020; Padrões de Segurança OpenID FAPI e Manual de Participantes do Open Finance Brasil:  
   [https://openfinancebrasil.org.br](https://openfinancebrasil.org.br) e [https://www.bcb.gov.br](https://www.bcb.gov.br).
