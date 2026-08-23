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
| **Lançamentos** | CRUD completo, filtros (tipo, natureza, categoria, busca), troca de categoria inline, agrupamento por dia |
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

### Duas decisões que valem conhecer

1. **Dinheiro é `integer` em centavos.** Nada de `float` ou `Decimal`: acabam os erros
   de arredondamento e o problema de serializar `Decimal` entre servidor e cliente.
2. **Escrita via Server Actions, leitura via Server Components.** Não existe camada
   de API REST intermediária — menos código e menos lugar para o dado divergir.

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
| `npm run db:push` | Aplica o schema direto no banco |
| `npm run db:generate` | Gera o SQL da migration em `drizzle/` |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run db:studio` | Interface visual do banco |
| `npm run db:seed` | Usuário e lançamentos de demonstração |

---

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
    (app)/                 área logada (painel, lançamentos, metas, projeções, importar, config)
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

- **Regras financeiras** → `src/lib/finance.ts` (funções puras, fáceis de testar)
- **Categorias padrão e palavras-chave** → `src/lib/default-categories.ts`
- **Cores e tipografia** → `src/app/globals.css`
- **Cores dos gráficos** → `src/components/charts/palette.ts`

---

## Acessibilidade e cor

A paleta dos gráficos foi validada para as três formas de daltonismo
(protanopia, deuteranopia, tritanopia) e para contraste nos temas claro e escuro.
Verde e vermelho puros foram evitados justamente por serem o par mais problemático:
o "entrou" usa teal (`#0d9488`) e o "saiu" usa rosa (`#f43f5e`). Além da cor, todo
gráfico tem legenda e rótulo de texto — identidade nunca depende só de cor.

---

## Próximos passos sugeridos

- Orçamento mensal por categoria (limite + alerta ao estourar)
- Lançamentos recorrentes e parcelados
- Fatura de cartão como ciclo fechado (compra x pagamento)
- Módulo de dívidas com juros: comparação bola de neve x avalanche
- Exportação para CSV/Excel e relatório mensal em PDF
- Testes automatizados de `lib/finance.ts` e dos parsers
