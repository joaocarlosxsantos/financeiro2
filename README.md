# Financeiro 2.0

Controle financeiro pessoal com foco em **clareza**: separar gasto fixo de variável,
construir reserva de emergência com base no custo de vida real, acompanhar metas,
projetar o futuro e importar extratos e faturas.

> Feito para ser didático: cada número da tela vem acompanhado da explicação do
> porquê ele importa.

---

## O que já está pronto

| Área | O que faz |
|---|---|
| **Painel** | Entrou / saiu / sobrou do mês, nota de saúde financeira aberta em 3 partes, evolução de 6 meses, ranking de categorias, fixo x variável, reserva e guia 50/30/20 |
| **Lançamentos** | CRUD completo, filtros (tipo, natureza, categoria, busca), troca de categoria inline, agrupamento por dia, compras parceladas em até 48x com divisão exata dos centavos |
| **Contas** | Saldo de cada conta a partir de um saldo inicial informado, quanto se deve em cada cartão e patrimônio líquido |
| **Faturas** | Ciclo de fatura do cartão (fechamento e vencimento), compras agrupadas por ciclo, status da fatura e registro de pagamento — sem contar o gasto duas vezes |
| **Recorrentes** | Regras de lançamento que se repetem todo mês (aluguel, assinaturas, salário), geradas com um clique — nunca automaticamente. Pausar, encerrar por data e ver quanto da renda já está comprometida |
| **Orçamento** | Limite mensal por categoria, acompanhamento do quanto já foi consumido, alerta em três estados e projeção de fechamento no ritmo atual |
| **Dívidas** | Saldo, taxa e custo mensal de juros de cada dívida; simulador que compara bola de neve x avalanche com prazo, juros totais e ordem de quitação |
| **Metas e reserva** | Reserva de emergência calculada a partir do custo de vida real, metas com prazo, aportes e resgates, previsão de conclusão no ritmo atual |
| **Projeções** | Juros compostos com 3 cenários (6% / 10% / 14% a.a.), horizonte de 1 a 20 anos, decomposição aporte x juros |
| **Importar** | CSV e OFX de banco ou fatura, detecção automática de colunas, categorização por palavra-chave, bloqueio de duplicatas, conferência antes de gravar |
| **Configurações** | Perfil financeiro, contas e cartões, categorias com palavras-chave |
| **Conta** | Cadastro, login e sessão (Auth.js v5, senha com bcrypt), onboarding guiado |

---

## Stack

- **Next.js 15** (App Router, Server Components e Server Actions) + **TypeScript**
- **Tailwind CSS v4** — tema claro/escuro por classe, tokens em `globals.css`
- **Drizzle ORM** + **PostgreSQL** (Neon, Supabase, Vercel Postgres — qualquer um)
- **Auth.js v5** (next-auth) com provider de credenciais e sessão JWT
- **Recharts** para gráficos, **Zod** para validação, **lucide-react** para ícones

### Quatro decisões que valem conhecer

1. **Dinheiro é `integer` em centavos.** Nada de `float` ou `Decimal`: acabam os erros
   de arredondamento e o problema de serializar `Decimal` entre servidor e cliente.
2. **Escrita via Server Actions, leitura via Server Components.** Não existe camada
   de API REST intermediária — menos código e menos lugar para o dado divergir.
3. **A compra no cartão é despesa no dia da compra**, não no dia em que a fatura é
   paga. O pagamento da fatura é uma *transferência* entre contas suas: fica de fora
   dos totais, senão o mesmo dinheiro apareceria duas vezes. Lançamentos marcados como
   transferência continuam visíveis no histórico, mas somem dos gráficos e do orçamento.
4. **Num arquivo `"use server"`, todo export vira um endpoint público.** Por isso as
   funções puras e as que recebem `userId` moram fora deles: regras de parcelamento em
   `src/lib/installments.ts` e a gravação em `src/server/installments.ts`.

---

## Rodando localmente

```bash
# 1. dependências
npm install

# 2. variáveis de ambiente
cp .env.example .env
#    preencha DATABASE_URL / DIRECT_URL e gere o AUTH_SECRET:
npx auth secret        # ou: openssl rand -base64 32

# 3. criar as tabelas
npm run db:push        # rápido, para desenvolvimento
#    ou, com histórico de migrations:
npm run db:generate && npm run db:migrate

# 4. (opcional) dados de exemplo
npm run db:seed        # demo@financeiro.app / demo12345

# 5. subir
npm run dev            # http://localhost:3000
```

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Testes das regras de negócio (Vitest) |
| `npm run test:watch` | Testes em modo observador |
| `npm run db:push` | Aplica o schema direto no banco |
| `npm run db:generate` | Gera o SQL da migration em `drizzle/` |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run db:studio` | Interface visual do banco |
| `npm run db:seed` | Usuário e lançamentos de demonstração |

---

## Banco no Docker

O `docker-compose.yml` sobe **só o Postgres**. A aplicação continua rodando no host
com `npm run dev`, mantendo o hot reload.

```bash
docker compose up -d
```

No `.env`, aponte as duas URLs para o container:

```
DATABASE_URL="postgresql://postgres:financeiro@localhost:5432/financeiro"
DIRECT_URL="postgresql://postgres:financeiro@localhost:5432/financeiro"
```

Depois é o fluxo normal: `npm run db:push`, `npm run db:seed` (opcional) e `npm run dev`.

### Comandos úteis

| Comando | O que faz |
|---|---|
| `docker compose up -d` | Sobe o banco |
| `docker compose ps` | Mostra se está de pé e saudável |
| `docker compose logs -f db` | Acompanha os logs do Postgres |
| `docker compose down` | Para o banco (os dados ficam no volume) |
| `docker compose down -v` | Para o banco **e apaga os dados** |
| `docker compose exec db psql -U postgres financeiro` | Abre o psql |

### Variáveis (todas opcionais)

Defina no `.env` só se quiser mudar os padrões:

| Variável | Padrão |
|---|---|
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | `financeiro` |
| `POSTGRES_DB` | `financeiro` |
| `POSTGRES_PORT` | `5432` |

> Se a porta 5432 já estiver ocupada na sua máquina, defina `POSTGRES_PORT=5433` no
> `.env` e troque a porta nas URLs de conexão também.

## Publicando na Vercel

1. Suba o repositório no GitHub.
2. Na Vercel, **Add New → Project** e importe o repositório.
3. Crie um banco Postgres (Vercel Postgres, [Neon](https://neon.tech) ou
   [Supabase](https://supabase.com) — todos têm plano gratuito).
4. Defina as variáveis de ambiente do projeto:
   - `DATABASE_URL` — string de conexão **com pooling**
   - `DIRECT_URL` — conexão direta (usada só pelas migrations)
   - `AUTH_SECRET` — `npx auth secret`
   - `AUTH_URL` — `https://seu-projeto.vercel.app`
5. Rode as migrations uma vez apontando para o banco de produção:
   `DIRECT_URL="..." npm run db:migrate`
6. Deploy.

O projeto não usa nada específico da Vercel — roda igual em qualquer host Node.

---

## Estrutura

```
src/
  app/
    (app)/                 área logada (painel, lançamentos, contas, faturas,
                           recorrentes, orçamento, dívidas, metas, projeções,
                           importar, configurações)
    login/  cadastro/  onboarding/
    api/auth/[...nextauth]/
  components/
    charts/                gráficos + paleta validada para daltonismo
    ui/                    card, botão, campo, dica, progresso, estado vazio
  db/
    schema.ts              tabelas, enums e relations (Drizzle)
    index.ts               conexão
  lib/
    finance.ts             regras financeiras (reserva, 50/30/20, saúde, projeção)
    money.ts               centavos ⇄ texto, formatação BRL
    installments.ts        divisão de parcelas e datas de recorrência (funções puras)
    invoices.ts            ciclo de fatura do cartão (funções puras)
    debts.ts               simulação de quitação: bola de neve x avalanche
    balances.ts            saldo de conta, dívida de cartão e patrimônio líquido
    parsers/               leitura de CSV e OFX
    categorize.ts          categorização automática e fingerprint anti-duplicata
    dates.ts  auth.ts  cn.ts  id.ts
  server/
    queries.ts             leituras agregadas
    actions/               mutações (Server Actions)
drizzle/                   migrations SQL
scripts/seed.mjs           dados de demonstração
```

### Onde mexer primeiro

- **Regras financeiras** → `src/lib/finance.ts`, `src/lib/debts.ts`, `src/lib/invoices.ts`
  e `src/lib/installments.ts` — todas funções puras, cobertas por `npm test`
- **Categorias padrão e palavras-chave** → `src/lib/default-categories.ts`
- **Cores e tipografia** → `src/app/globals.css`
- **Cores dos gráficos** → `src/components/charts/palette.ts`

---

## Acessibilidade e cor

Auditado com **axe-core** em 14 telas, nos dois temas: **zero violações** WCAG 2.1 AA.

A paleta dos gráficos foi validada para as três formas de daltonismo (protanopia,
deuteranopia, tritanopia). Verde e vermelho puros foram evitados justamente por serem
o par mais problemático: "entrou" usa teal (`#0d9488`) e "saiu" usa rosa (`#f43f5e`).
Todo gráfico tem legenda e rótulo de texto — identidade nunca depende só de cor.

**Cor de marca ≠ cor de texto.** Barras e pontos precisam de 3:1; texto precisa de
4.5:1. Por isso existem dois conjuntos de variáveis: `--color-money-in/out/variable`
para preenchimentos e `--text-in/out/warn/brand` para quando a mesma informação vira
texto. Se você trocar uma, troque o par.

Também garantidos: foco visível em tudo que é interativo, link "pular para o conteúdo",
`aria-label` em todas as barras de progresso e botões só com ícone, `aria-current` no
item de menu ativo, e layout sem rolagem horizontal em zoom de 200%.

---

## Próximos passos sugeridos

- Publicar no GitHub e na Vercel
- Exportação para CSV/Excel e relatório mensal em PDF
