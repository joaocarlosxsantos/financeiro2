# Mutano Contas

Controle financeiro pessoal inteligente, didático e seguro, construído com **Next.js 16**, **React 19**, **Drizzle ORM** e **Tailwind CSS v4**.

O **Mutano Contas** foi concebido para entregar visibilidade real sobre suas finanças: separar custos fixos de variáveis, calcular a reserva de emergência ideal com base no custo de vida real, projetar o fechamento do mês no ritmo atual, gerenciar cartões de crédito e parcelamentos com centavos exatos, sincronizar extratos via Open Finance e oferecer alertas proativos no Telegram.

Produção: [mutanocontas.vercel.app](https://mutanocontas.vercel.app)

---

## Funcionalidades

### 1. Painel Inteligente & Visão Geral
- **Balanço Mensal:** Entradas, saídas e saldo líquido do mês.
- **Previsão de Fechamento:** Projeção do saldo de fim de mês baseada na taxa de consumo (*burn rate*) atual versus receitas e despesas restantes.
- **Quanto Posso Gastar Hoje:** Indicador diário que calcula a quantia segura para gastar no dia sem fechar o mês no vermelho.
- **Saúde Financeira:** Pontuação didática calculada a partir de 3 pilares (reserva de emergência, comprometimento da renda e equilíbrio 50/30/20).
- **Evolução Patrimonial:** Gráficos históricos de 6 meses e ranking de gastos por categoria.

### 2. Lançamentos & Gestão de Despesas
- **Lançamentos Detalhados:** CRUD completo com filtros por tipo (receita, despesa, transferência), categoria, conta e busca textual.
- **Parcelamentos Inteligentes:** Suporte a compras parceladas em até 60x com distribuição exata dos centavos na primeira parcela.
- **Divisão de Despesas (Split):** Divisão de contas com outras pessoas (igual, proporcional ou valor exato) com geração de link de cobrança direta pelo WhatsApp.
- **Transferências Seguras:** Transferências entre contas próprias e pagamento de fatura não inflam os relatórios de despesa/receita.

### 3. Contas, Cartões & Faturas
- **Contas Bancárias:** Gestão de contas correntes, poupanças e investimentos com cálculo de patrimônio líquido em tempo real.
- **Cartões de Crédito:** Controle de limites, faturas abertas/fechadas, histórico de parcelas futuras e alertas de vencimento.

### 4. Contas a Pagar & Grupos Compartilhados
- **Contas a Vencer:** Acompanhamento de contas a pagar com datas de vencimento, status e baixa manual.
- **Grupos de Despesas Compartilhadas:** Gestão de despesas divididas em grupo (ex.: moradia em conjunto ou viagens) com cálculo de acerto de contas e liquidação de saldos entre membros.

### 5. Orçamentos, Metas & Reserva
- **Orçamento por Categoria:** Tetos de gastos mensais com alertas visuais graduais (normal, 80% e 100%) e sugestão automática de orçamento com base na média dos meses anteriores.
- **Metas Financeiras:** Objetivos de médio e longo prazo com acompanhamento de aportes, resgates e estimativa de conclusão.
- **Reserva de Emergência:** Cálculo automático da meta de reserva ancorado no custo de vida real de despesas fixas.

### 6. Recorrentes & Detecção de Aumento de Preço
- **Assinaturas e Gastos Fixos:** Cadastro de despesas e receitas recorrentes com cálculo de comprometimento da renda fixa.
- **Alerta de Reajustes:** Deteção automática de assinaturas com cobranças acima da média histórica habitual.

### 7. Dívidas & Projeções
- **Simulador de Quitação de Dívidas:** Comparação visual entre as estratégias **Bola de Neve** (menor saldo primeiro) e **Avalanche** (maior taxa de juros primeiro), detalhando economia de juros e tempo de quitação.
- **Projeções de Longo Prazo:** Simulador de juros compostos com cenários conservador, moderado e agressivo para horizontes de 1 a 20 anos.

### 8. Importação & Conciliação
- **Assistente de Importação:** Suporte a arquivos de extrato bancário e fatura nos formatos **CSV** e **OFX**.
- **Mapeamento e Anti-Duplicidade:** Detecção de colunas, categorização inteligente por palavras-chave e bloqueio de lançamentos duplicados por fingerprint criptográfico antes da gravação.

### 9. Open Finance via Pluggy Connect
- **Conexão Bancária Automatizada:** Integração com o widget oficial da [Pluggy](https://pluggy.ai) para sincronização de contas, saldos, cartões e transações reais.
- **Credenciais Seguras por Usuário:** Cada usuário configura suas próprias chaves de API da Pluggy (`Client ID` e `Client Secret`), armazenadas no banco de dados com criptografia `AES-256-GCM` com AAD.

### 10. Perfis de Uso Personalizados
O aplicativo se molda ao estilo de controle do usuário:
- **`integracao_total`:** Focado na automação via Open Finance, ocultando formulários manuais redundantes.
- **`hibrido` (Padrão):** Permite automação bancária, conciliação manual e importação de extratos.
- **`manual`:** Gestão estritamente manual e via arquivos, sem abas de Open Finance.

### 11. Bot do Telegram Integrado
- **Comandos Rápidos:** `/saldo`, `/cartao`, `/previsao`, `/hoje`, `/resumo`, `/pausar`, `/desvincular` e `/ajuda`.
- **Alertas Proativos:** Notificações de faturas próximas de vencer (3d, 1d e hoje), contas a pagar vencendo, orçamentos atingindo 80%/100% e alerta preventivo de saldo negativo.
- **Inteligência Artificial:** Respostas em linguagem natural para dúvidas financeiras com suporte a Google Gemini ou Claude (Anthropic).
- **Sem Spam:** Janela de silêncio obrigatória (08h às 21h no horário de Brasília) e deduplicação atômica de envios.
- Detalhes completos em [docs/bot-telegram.md](docs/bot-telegram.md).

### 12. PWA (Progressive Web App) & Exportações
- **Instalação Nativa:** Suporte a PWA para Android, iOS e Desktop com `manifest.webmanifest` e banner guiado de instalação.
- **Modo Offline:** Service Worker (`public/sw.js`) com cache de ativos e página estática de contingência (`public/offline.html`).
- **Exportação de Dados:** Backup completo da conta em JSON, exportação de transações em CSV/Excel e emissão de relatório consolidado em PDF.

---

## Stack Tecnológica

| Camada | Tecnologias |
|---|---|
| **Core & Framework** | [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| **Estilização & UI** | [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Recharts](https://recharts.org/) |
| **Banco de Dados** | PostgreSQL ([Neon](https://neon.tech/), Supabase ou Docker), [Drizzle ORM](https://orm.drizzle.team/) |
| **Autenticação & Criptografia** | [Auth.js v5](https://authjs.dev/) (sessão JWT, `bcryptjs`), Cifra `AES-256-GCM` com AAD |
| **Validação & Parsing** | [Zod 4](https://zod.dev/), [PapaParse](https://www.papaparse.com/), [Date-fns](https://date-fns.org/) |
| **Relatórios & Arquivos** | [PDFKit](https://pdfkit.org/), [ExcelJS](https://github.com/exceljs/exceljs) |
| **Testes de Unidade** | [Vitest](https://vitest.dev/) (mais de 590 testes cobrindo todas as regras de negócio) |

Consulte o documento completo de arquitetura em [docs/arquitetura.md](docs/arquitetura.md).

---

## Instalação e Execução Local

### Pré-requisitos
- Node.js 22 ou superior
- NPM
- Docker (opcional, caso queira rodar o Postgres localmente)

### 1. Clonar e Instalar Dependências
```bash
git clone https://github.com/seu-usuario/financeiro_2.git
cd financeiro_2
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o modelo de variáveis de ambiente:
```bash
cp .env.example .env
```

Edite o arquivo `.env`. Nenhuma variável exige segredos pré-existentes para iniciar localmente além da conexão do banco de dados e do segredo de autenticação:

| Variável | Obrigatória | Finalidade |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão PostgreSQL (com pooler, em produção). |
| `DIRECT_URL` | Sim | Conexão direta ao PostgreSQL (utilizada para rodar migrações Drizzle). |
| `AUTH_SECRET` | Sim | Chave de 32 bytes para assinar tokens JWT (`openssl rand -base64 32`). |
| `AUTH_URL` | Não (Local) | URL base da aplicação (em produção: `https://mutanocontas.vercel.app`). |
| `APP_ENCRYPTION_KEY` | Não | Chave de 32 bytes (64 caracteres hex) para criptografia AES-256-GCM das credenciais Open Finance. |
| `TELEGRAM_BOT_TOKEN` | Não | Token do bot criado no @BotFather do Telegram. |
| `TELEGRAM_WEBHOOK_SECRET` | Não | Segredo arbitrário para validação do webhook do Telegram. |
| `CRON_SECRET` | Não | Token Bearer para autenticação dos endpoints do Vercel Cron. |
| `AI_PROVIDER` | Não | Provedor de IA para o bot (`gemini` ou `anthropic`). |
| `GEMINI_API_KEY` | Não | Chave da API Google Gemini para perguntas em linguagem natural. |
| `ANTHROPIC_API_KEY` | Não | Chave da API Anthropic Claude. |

### 3. Banco de Dados Local (Docker)
Para subir uma instância local do PostgreSQL:
```bash
docker compose up -d
```
O banco estará disponível em `localhost:5432` com usuário `postgres` e senha `financeiro`.

### 4. Executar Migrações do Banco de Dados
> [!IMPORTANT]
> O comando de build da Vercel (`next build`) **NÃO executa migrações** automaticamente. Em qualquer ambiente novo ou após atualizações de schema, aplique as migrações explicitamente:

```bash
npm run db:migrate
```

*(Opcional) Para popular o banco com categorias e dados de demonstração:*
```bash
npm run db:seed
```

### 5. Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento do Next.js com Turbopack. |
| `npm run build` | Compila a aplicação para produção (`next build`). |
| `npm start` | Inicia o servidor de produção localmente. |
| `npm run typecheck` | Executa a verificação de tipos com TypeScript (`tsc --noEmit`). |
| `npm run lint` | Executa a verificação estática de código com ESLint. |
| `npm test` | Executa todos os testes de unidade de regras de negócio com Vitest. |
| `npm run test:watch` | Executa os testes no modo observador interativo. |
| `npm run db:generate` | Gera novas migrações SQL na pasta `drizzle/` a partir de `schema.ts`. |
| `npm run db:migrate` | Aplica as migrações SQL pendentes no banco configurado em `DIRECT_URL`. |
| `npm run db:push` | Sincroniza o schema diretamente no banco sem criar arquivos de migração. |
| `npm run db:studio` | Abre a interface visual do Drizzle Studio no navegador. |
| `npm run verify` | Script unificado de checagem do projeto. |

---

## Deploy em Produção

O projeto está otimizado para deploy na **Vercel** com banco PostgreSQL gerenciado ([Neon](https://neon.tech)):

1. Importe o repositório na Vercel.
2. Defina as variáveis de ambiente de produção (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `APP_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`).
3. Execute as migrações no banco de produção a partir do seu terminal seguro:
   ```bash
   DIRECT_URL="sua-url-neon-direta" npm run db:migrate
   ```
4. Os cron jobs configurados em `vercel.json` serão agendados automaticamente pela Vercel:
   - `/api/cron/insights` (08h, 14h, 20h horário de Brasília)
   - `/api/cron/insights/monthly` (dia 1º às 08h)
5. Para ativar o bot do Telegram em produção, registre o webhook na API do Telegram conforme orientado em [docs/bot-telegram.md](docs/bot-telegram.md).

---

## Segurança e Privacidade

- **Criptografia Autenticada:** As credenciais Open Finance são salvas com `AES-256-GCM` usando `APP_ENCRYPTION_KEY` e o `userId` como AAD (Additional Authenticated Data).
- **Sem Vazamento de Credenciais:** Tokens e segredos de API nunca são expostos em endpoints públicos, respostas HTTP ou logs da aplicação.
- **Autorização Estrita:** Todas as consultas e mutações validam a identidade do usuário a partir da sessão ativa do Auth.js. Nenhuma operação aceita o identificador de usuário (`userId`) diretamente do cliente.
- **Proteção de Rede e Headers:** Headers de segurança configurados para prevenir framing, clickjacking, MIME sniffing e injeção de scripts (veja [docs/csp.md](docs/csp.md)).

---

## Estrutura de Pastas

```
├── drizzle/                     # Migrações SQL versionadas (0000 a 0025)
├── docs/                        # Documentação técnica e relatórios
│   ├── arquitetura.md           # Decisões de arquitetura e modelo de dados
│   ├── bot-telegram.md          # Especificação e configuração do bot Telegram
│   ├── csp.md                   # Política de segurança de conteúdo
│   └── ...                      # Relatórios de auditoria e QA
├── public/                      # Ativos estáticos, Service Worker (sw.js) e manifest
├── scripts/                     # Scripts de verificação e seed do banco
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (app)/               # Rotas autenticadas da área logada
│   │   │   ├── painel/          # Dashboard principal com métricas e previsões
│   │   │   ├── lancamentos/     # Gestão de transações e parcelamentos
│   │   │   ├── contas/          # Contas bancárias e cartões de crédito
│   │   │   ├── contas-a-pagar/  # Contas a pagar e grupos de rateio
│   │   │   ├── orcamento/       # Tetos orçamentários por categoria
│   │   │   ├── metas/           # Metas e reserva de emergência
│   │   │   ├── recorrentes/     # Assinaturas e receitas/despesas fixas
│   │   │   ├── dividas/         # Simulador bola de neve x avalanche
│   │   │   ├── projecoes/       # Projeções de juros compostos
│   │   │   ├── importar/        # Assistente de importação de CSV/OFX
│   │   │   └── configuracoes/   # Preferências, Telegram e Open Finance
│   │   ├── api/                 # Endpoints de API, Crons e Webhooks
│   │   ├── login/               # Tela de autenticação
│   │   └── cadastro/            # Tela de criação de conta
│   ├── components/              # Componentes de interface e gráficos
│   ├── db/                      # Schema do banco de dados (Drizzle) e conexão
│   ├── lib/                     # Regras de negócio puras e utilitários
│   │   ├── finance.ts           # Cálculos de reserva, 50/30/20 e saúde financeira
│   │   ├── installments.ts      # Divisão de parcelas e datas de fatura
│   │   ├── debts.ts             # Algoritmos de amortização de dívidas
│   │   ├── usage-profile.ts     # Engine de perfis de uso
│   │   ├── parsers/             # Leitores de arquivos CSV e OFX
│   │   └── money.ts             # Manipulação e formatação de centavos
│   └── server/                  # Camada de backend protegida
│       ├── actions/             # Server Actions Next.js (mutações)
│       ├── queries.ts           # Consultas agregadas de leitura
│       ├── open-finance/        # Lógica de integração e criptografia Pluggy
│       └── telegram/            # Webhook, comandos, alertas e IA do bot
```

---

## Roadmap

- [x] Integração Open Finance via Pluggy Connect com credenciais por usuário e criptografia AES-256-GCM.
- [x] Alertas proativos no Telegram com janela de silêncio e deduplicação atômica.
- [x] Previsão de fim de mês e cálculo de "quanto posso gastar hoje".
- [x] Detecção de reajustes de valor em assinaturas recorrentes.
- [x] Gestão de grupos de contas compartilhadas e liquidação.
- [x] Suporte offline contingencial e PWA instalável.
- [ ] Conciliação automática de lançamentos duplicados entre importações e Open Finance.
- [ ] Exportação de relatórios customizados por período anual e informe para Imposto de Renda.
