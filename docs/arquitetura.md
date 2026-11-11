# Arquitetura do Mutano Contas

Este documento descreve a arquitetura de software, decisões estruturais, modelo de segurança e fluxo de dados do **Mutano Contas**.

---

## 1. Visão Geral da Stack

- **Framework:** Next.js 16 (App Router com Server Components e Server Actions).
- **Linguagem & Runtime:** TypeScript 5 (modo estrito) sobre Node.js 22+.
- **Interface & Estilos:** React 19, Tailwind CSS v4, Lucide React e Recharts.
- **Banco de Dados & ORM:** PostgreSQL (Neon / Supabase / Postgres local) gerenciado via **Drizzle ORM**.
- **Autenticação:** Auth.js v5 (`next-auth`) com sessão JWT e senhas com `bcryptjs`.
- **Validação de Entrada:** Zod 4.
- **PWA:** Service Worker nativo (`public/sw.js`), suporte a fallback offline (`public/offline.html`) e Web App Manifest (`public/manifest.webmanifest`).

---

## 2. Princípios e Regras de Design

### 2.1. Dinheiro como Inteiro em Centavos
Todos os valores monetários no banco de dados e nos cálculos do domínio são representados como números inteiros em centavos (`R$ 10,50` = `1050`).
- Elimina erros de arredondamento de ponto flutuante (`0.1 + 0.2 !== 0.3`).
- Evita complexidade de serialização de tipos como `Decimal` ou `BigDecimal` entre cliente e servidor.
- Formatadores e conversores residem em `src/lib/money.ts`.

### 2.2. Separação Estrita de Camadas
1. **Regras Puras (`src/lib/`):** Funções sem efeitos colaterais, sem dependência de banco de dados ou requisições HTTP. Testáveis de forma determinística via Vitest (`src/lib/finance.ts`, `src/lib/installments.ts`, `src/lib/debts.ts`, `src/lib/usage-profile.ts`).
2. **Leituras Agregadas (`src/server/queries.ts` e submódulos):** Executadas diretamente em Server Components. Não há camada REST intermediária para carregar páginas.
3. **Mutações (`src/server/actions/`):** Implementadas como Next.js Server Actions. Cada ação valida autenticação, valida permissão do usuário (`userId`), executa parsing via Zod e chama o Drizzle ORM.
4. **Fronteira `"use server"`:** Funções síncronas, helpers puros e constantes nunca são exportados de arquivos `"use server"`. Tudo o que é exportado de um arquivo com essa diretiva é tratado pelo Next.js como um endpoint público invocável pelo cliente.

### 2.3. Cartão de Crédito e Transferências
- Compras no cartão de crédito entram como despesa no dia da compra.
- O pagamento da fatura é modelado como uma **transferência** entre a conta corrente e o cartão.
- Lançamentos com natureza de transferência são excluídos dos totais de receita/despesa, orçamentos e relatórios para evitar contagem dupla do dinheiro.

---

## 3. Modelo de Dados e Migrações

O banco de dados é modelado com Drizzle ORM em `src/db/schema.ts`.

### 3.1. Principais Entidades
- **Usuários e Sessão:** `users`, `telegramLinkCodes`, `telegramChats`, `telegramPreferences`, `telegramDeliveries`.
- **Financeiro:** `accounts`, `categories`, `transactions`, `splitParticipants`, `recurringRules`, `recurringRuleHistory`, `budgets`, `goals`, `debts`.
- **Contas Compartilhadas:** `billGroups`, `billShares`, `billPayments`.
- **Open Finance:** `openFinanceCredentials`, `openFinanceItems`, `openFinanceConnections`, `openFinanceSyncHistory`.

### 3.2. Migrações Drizzle
- As migrações residem na pasta `drizzle/` (de `0000_initial.sql` a `0025_clear_speedball.sql`).
- O comando `npm run db:generate` gera o SQL a partir do diff do schema.
- O comando `npm run db:migrate` aplica as migrações usando a conexão `DIRECT_URL`.
- **Atenção:** O processo de build na Vercel (`next build`) **não executa migrações**. As migrações devem ser executadas manualmente ou via pipeline antes ou após o deploy.

---

## 4. Segurança e Hardening

### 4.1. Criptografia de Credenciais Open Finance (AES-256-GCM + AAD)
As credenciais da Pluggy (`clientId` e `clientSecret`) são armazenadas por usuário na tabela `openFinanceCredentials`.
- O segredo é criptografado usando `AES-256-GCM`.
- A chave de criptografia de 32 bytes vem da variável de ambiente `APP_ENCRYPTION_KEY`.
- O `userId` do usuário é obrigatoriamente injetado como **Dados Adicionais Autenticados (AAD)** na cifra. Isso garante que o segredo de um usuário não pode ser decifrado ou reutilizado no contexto de outro usuário, mesmo com acesso direto ao banco de dados.
- O token de conexão (`connectToken`) é gerado no backend repassando `clientUserId: userId`.
- Na sincronização, o webhook ou callback valida estritamente se o item retornado pela API da Pluggy pertence ao `clientUserId` correspondente, mitigando ataques de IDOR (Insecure Direct Object Reference).

### 4.2. Cabeçalhos HTTP e CSP
Configurados em `next.config.ts` e `src/proxy.ts`:
- `X-Frame-Options: DENY`: Previne clickjacking.
- `X-Content-Type-Options: nosniff`: Previne MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- Content Security Policy (CSP) restritivo com suporte a nonces para scripts inline.

---

## 5. Perfis de Uso (`usage-profile.ts`)

O Mutano Contas suporta três perfis de uso que adaptam a interface e o fluxo às necessidades de cada usuário:

1. **`integracao_total`:** Focado na automação bancária via Open Finance. Oculta entradas manuais redundantes e prioriza reconciliação automática.
2. **`hibrido` (Padrão):** Oferece o conjunto completo. Suporta conciliação via Open Finance, lançamentos manuais rápidos e importação manual de arquivos de extrato (OFX/CSV).
3. **`manual`:** Para usuários que não desejam conectar contas bancárias nem sincronizar dados externos. Oculta completamente integrações Open Finance, mantendo lançamentos manuais, parcelamentos, grupos e importação de planilhas.

---

## 6. Rotas e Serviços

### 6.1. Rotas Web (`src/app/(app)/`)
- `/painel`: Visão geral do mês (balanço, gasto diário permitido, projeção de fim do mês, alertas proativos).
- `/lancamentos`: Lista de transações, filtros, divisão de despesas e cadastro parcelado.
- `/contas`: Contas bancárias, carteiras e cartões de crédito com visualização de faturas.
- `/contas-a-pagar`: Controle de contas a vencer, histórico e divisão em grupos (`/contas-a-pagar/grupos`).
- `/orcamento`: Planejamento mensal por categoria com sugestões e limites de 80%/100%.
- `/metas`: Objetivos financeiros e cálculo da reserva de emergência ideal.
- `/recorrentes`: Assinaturas e receitas/despesas fixas com histórico e alerta de reajustes de preço.
- `/projecoes`: Simulador de juros compostos e projeção patrimonial.
- `/dividas`: Simulador de quitação por bola de neve vs. avalanche.
- `/importar`: Assistente de importação de extratos e faturas em CSV/OFX com mapeamento e categorização inteligente.
- `/configuracoes`: Preferências gerais, perfil de uso, vinculação e preferências do bot Telegram.
- `/configuracoes/integracao`: Gerenciamento seguro de credenciais e conexões Open Finance via Pluggy Connect.

### 6.2. Endpoints de API e Crons (`src/app/api/`)
- `/api/auth/[...nextauth]`: Autenticação Auth.js.
- `/api/telegram/webhook`: Webhook de comunicação do Bot do Telegram, validado por segredo em cabeçalho.
- `/api/cron/insights`: Disparado diariamente às 08:00, 14:00 e 20:00 (horário de Brasília) via Vercel Cron. Executa verificação de alertas de fatura, contas a vencer, orçamentos e saldo projetado.
- `/api/cron/insights/monthly`: Disparado no dia 1º de cada mês às 08:00 para envio do fechamento consolidado.
- `/api/exportar/backup`: Exportação completa dos dados do usuário em JSON.
- `/api/exportar/lancamentos`: Exportação de lançamentos filtrados em CSV ou planilha Excel.
- `/api/exportar/relatorio`: Geração de relatório consolidado em PDF via PDFKit.
