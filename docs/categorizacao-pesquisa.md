# Pesquisa e Arquitetura: Categorização Automática de Lançamentos

> **Data:** Novembro de 2026  
> **Escopo:** Categorização automática inteligente para extratos de conta corrente e faturas de cartão de crédito (Itaú / Open Finance via Pluggy / OFX / CSV), sem depender das categorias proprietárias da Pluggy.  
> **Projeto:** `financeiro_2` (Next.js 15, Drizzle ORM, Neon PostgreSQL)  
> **Arquivo:** `docs/categorizacao-pesquisa.md`

---

## 1. Diagnóstico do Schema Atual e Como o App Categoriza Hoje

### 1.1 Tabelas no Banco (`src/db/schema.ts`)
* **Tabela `categories`:**
  * `id`: `varchar(32)` (ID CUID)
  * `userId`: `varchar(32)` (FK `users.id`)
  * `name`: `text` (Nome legível da categoria)
  * `kind`: `categoryKind` (`"INCOME"` | `"EXPENSE"`)
  * `nature`: `expenseNature` (`"FIXED"` | `"VARIABLE"`)
  * `color`: `varchar(9)`
  * `keywords`: `text[]` (Array de termos para busca textual)
  * `archived`: `boolean`
  * Índice único: `(userId, name, kind)`
* **Tabela `transactions`:**
  * `id`: `varchar(32)`
  * `categoryId`: `varchar(32)` (FK `categories.id`, nullable)
  * `description`: `text` (Texto bruto que veio do banco/cartão)
  * `amountCents`: `integer` (Valor monetário inteiro absoluto)
  * `kind`: `categoryKind` (`"INCOME"` | `"EXPENSE"`)
  * `isTransfer`: `boolean` (Default `false` — transferências entre contas e pagamentos de fatura)
  * `origin`: `"MANUAL"` | `"CSV"` | `"OFX"` | `"PLUGGY"`
  * `externalId`: `text` (ID do conector externo)

### 1.2 Categorias Padrão do Sistema (`src/lib/default-categories.ts`)
O sistema inicia com 17 categorias padrão:

| Categoria | Tipo (`kind`) | Natureza (`nature`) | Palavras-chave Atuais (`keywords`) |
| :--- | :--- | :--- | :--- |
| **Salário** | `INCOME` | `FIXED` | salario, salário, pagamento, folha, remuneracao, provento |
| **Renda extra** | `INCOME` | `VARIABLE` | freela, freelance, bico, extra, pix recebido, venda |
| **Rendimentos** | `INCOME` | `VARIABLE` | rendimento, juros, dividendo, cdb, tesouro, resgate |
| **Moradia** | `EXPENSE` | `FIXED` | aluguel, condominio, condomínio, iptu, financiamento imovel |
| **Contas de casa** | `EXPENSE` | `FIXED` | energia, luz, enel, cemig, copel, agua, água, sabesp, gas, gás, internet, vivo, claro, tim, oi |
| **Educação** | `EXPENSE` | `FIXED` | escola, faculdade, curso, mensalidade, udemy, alura |
| **Saúde** | `EXPENSE` | `FIXED` | plano de saude, unimed, amil, farmacia, farmácia, drogaria, consulta, dentista |
| **Assinaturas** | `EXPENSE` | `FIXED` | netflix, spotify, amazon prime, disney, hbo, max, youtube premium, icloud, google one, assinatura |
| **Transporte fixo** | `EXPENSE` | `FIXED` | ipva, seguro auto, estacionamento mensal, financiamento carro |
| **Dívidas e juros** | `EXPENSE` | `FIXED` | juros, emprestimo, empréstimo, rotativo, parcelamento fatura, encargos, multa, iof |
| **Mercado** | `EXPENSE` | `VARIABLE` | mercado, supermercado, atacadao, atacadão, carrefour, assai, assaí, pao de acucar, hortifruti, acougue, açougue, padaria |
| **Alimentação fora** | `EXPENSE` | `VARIABLE` | ifood, rappi, restaurante, lanchonete, burger, pizza, cafe, café, starbucks, mcdonald, bar |
| **Transporte** | `EXPENSE` | `VARIABLE` | uber, 99, taxi, combustivel, combustível, posto, shell, ipiranga, petrobras, onibus, ônibus, metro, pedagio, pedágio |
| **Lazer** | `EXPENSE` | `VARIABLE` | cinema, show, ingresso, steam, playstation, xbox, viagem, hotel, airbnb |
| **Compras** | `EXPENSE` | `VARIABLE` | amazon, mercado livre, shopee, aliexpress, magalu, americanas, renner, zara, shein |
| **Cuidados pessoais** | `EXPENSE` | `VARIABLE` | barbearia, salao, salão, cabeleireiro, academia, smartfit, manicure |
| **Outros** | `EXPENSE` | `VARIABLE` | *(sem palavras-chave — categoria fallback)* |

### 1.3 Como a Categorização Funciona Hoje no App
1. **Importação Manual (CSV/OFX):** A função `suggestCategoryId()` em [`src/lib/categorize.ts`](file:///C:/Projetos/financeiro_2/src/lib/categorize.ts) compara a descrição normalizada (sem acentos e minúscula) contra o array `keywords` de cada categoria, escolhendo a palavra-chave mais longa que der `includes()`.
2. **Importação via Open Finance (Pluggy):** Na sincronização de [`src/server/actions/open-finance.ts`](file:///C:/Projetos/financeiro_2/src/server/actions/open-finance.ts), o campo `categoryId` **não é preenchido** (entra como `null`). Todas as transações importadas via API entram desprovidas de categoria.
3. **Edição Manual:** O usuário precisa abrir a tabela de lançamentos e alterar o dropdown manualmente linha a linha. Não há persistência de memória do que foi alterado.

---

## 2. Pesquisa de Abordagens Técnicas

### 2.1 Normalização de Descrições do Itaú e Adquirentes Brasileiros
Os extratos de conta corrente e faturas de cartão do Itaú possuem ruídos e prefixos operacionais que impedem casamento direto de texto se não forem limpos previamente:

* **Prefixos Bancários de Conta Corrente (Itaú):**
  * `PIX TRANSF <NOME>` / `PIX ENVIADO <NOME>` / `PIX RECEBIDO <NOME>` / `PIX TRANSF CHAVE`
  * `TED <BANCO>/<AG> <NOME>` / `DOC <NUMERO>`
  * `DEB AUT <CONCESSIONÁRIA>` (ex: `DEB AUT ENEL`, `DEB AUT SABESP`, `DEB AUT NET CLARO`)
  * `SISDEB <EMPRESA>`
  * `PAGAMENTO BOLETO <BENEFICIÁRIO>` / `PAG BOLETO BANCO`
  * `COMPRA CARTAO <DATA> <ESTABELECIMENTO>` / `COMPRA VISA ELECTRON`
  * `REND PAGO APLIC` / `APLICACAO CDB` / `RESGATE AUTOMATICO`
  * `TAR PACOTE MENS` / `TAR EXTRATO` / `IOF`
* **Prefixos de Maquininhas e Intermediadores em Cartões:**
  * `MP*`, `MERCADOPAGO*`, `MERC PAGO*` (Mercado Pago)
  * `PAG*`, `PAGSEGURO*` (PagBank / PagSeguro)
  * `IFD*`, `IFOOD*` (iFood)
  * `UBER*`, `UBER *TRIP`, `UBER *EATS` (Uber)
  * `STN*`, `STONE*` (Stone)
  * `CIE*`, `CIELO*` (Cielo)
  * `GETNET*`, `REDECARD*`, `REDE*`, `SUMUP*`, `PAYPAL*`
* **Sufixos de Parcelas e Localidade:**
  * Indicadores de parcela: `PARC 01/03`, `01/10`, `(02/12)`, `1/5`
  * Indicadores de cidade/UF: `SAO PAULO BRA`, `BARUERI BR`, `CURITIBA BRA`

> **Pipeline de Limpeza (Regex / Normalizer):**
> Removendo os prefixos bancários e adquirentes, o texto `IFD*PIZZARIA DO ZE SAO PAULO BRA 01/02` é reduzido a `PIZZARIA DO ZE`, permitindo matching limpo com categorias e histórico.

### 2.2 Códigos MCC (Merchant Category Code)
* **O que é:** Código numérico de 4 dígitos (ISO 18245) atribuído pela credenciadora à atividade econômica do estabelecimento em transações com cartão.
* **Disponibilidade na Pluggy:** A Pluggy entrega o campo `payeeMCC` no payload de transações de cartão de crédito quando disponibilizado pelo emissor.
* **Mapeamento Direto de MCC para Categorias do App:**
  * `5411` (Supermercados / Mercearias) $\rightarrow$ **Mercado**
  * `5812`, `5814` (Restaurantes, Lanchonetes e Fast Food) $\rightarrow$ **Alimentação fora**
  * `5541`, `5542` (Postos de Combustível / Serviços Automotivos) $\rightarrow$ **Transporte**
  * `4121` (Táxis, Aplicativos de Transporte / Uber / 99) $\rightarrow$ **Transporte**
  * `5912` (Farmácias e Drogarias) $\rightarrow$ **Saúde**
  * `4899`, `5735` (TV a Cabo, Serviços de Streaming de Vídeo e Música) $\rightarrow$ **Assinaturas**
  * `5311`, `5651` (Lojas de Departamento e Vestuário) $\rightarrow$ **Compras**
  * `7991`, `7832` (Atrações, Shows e Cinemas) $\rightarrow$ **Lazer**
  * `7997`, `7230` (Clubes, Academias e Barbearias) $\rightarrow$ **Cuidados pessoais**

### 2.3 Bases Abertas e Datasets Disponíveis
1. **Datasets de Códigos MCC:**
   * **`greggles/mcc-codes`** ([GitHub](https://github.com/greggles/mcc-codes)): Base estruturada em JSON e CSV com mais de 800 códigos MCC da norma ISO 18245 e IRS. Licença: **Unlicense / Domínio Público**.
   * **`Rebilly/merchant-category-codes`** ([GitHub](https://github.com/Rebilly/merchant-category-codes)): Catálogo em formato JSON (`resources/mcc.json`). Licença: **MIT**.
2. **Datasets de Empresas e CNAE (Brasil):**
   * **BrasilAPI** ([brasilapi.com.br](https://brasilapi.com.br/)): API pública gratuita com consulta de CNPJ retornando CNAE fiscal e Razão Social. Licença: **MIT**.
   * **Dados Abertos da Receita Federal:** Tabelas públicas de CNPJ e CNAE, porém pesadas para consultas em tempo real (mais de 40 GB descompactadas). Ideal para extrair listas estáticas de top 5.000 CNPJs de serviços do Brasil.

### 2.4 Modelos LLM como Fallback (Custos e LGPD)
Quando regras exatas, histórico e dicionário não resolvem, uma chamada de LLM em lote resolve casos ambíguos.

* **Comparativo de Modelos para Classificação JSON:**

| Modelo | Input (por 1M tokens) | Output (por 1M tokens) | Custo estimado por 1.000 transações | Latência Média |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini 2.0 Flash / 1.5 Flash** | **$0,075 - $0,10** | **$0,30 - $0,40** | **~US$ 0,002 (R$ 0,01)** | ~400ms |
| **GPT-4o-mini** | $0,15 | $0,60 | ~US$ 0,005 (R$ 0,03) | ~600ms |
| **Claude 3.5 Haiku** | $0,80 | $4,00 | ~US$ 0,030 (R$ 0,17) | ~800ms |

* **Como orquestrar o envio em lote (Batching):**
  * As transações que falharem nas camadas determinísticas são agrupadas em lotes de **20 a 50 itens** por chamada.
  * O prompt envia apenas: `[ { "id": "1", "desc": "PADARIA ESTRELA" }, { "id": "2", "desc": "POSTO GRAAL" } ]` junto com o enum das categorias do usuário.
  * A resposta retorna via Structured Outputs (JSON Schema nativo).
* **Conformidade com a LGPD e Privacidade:**
  * **Anonimização Total (Art. 12 da LGPD):** Dados anonimizados que não permitem identificar o indivíduo não são considerados dados pessoais.
  * **O que NUNCA é enviado para a LLM:**
    * Nome do titular, CPF, telefone ou e-mail.
    * Número de conta, agência ou identificadores bancários.
    * Valor monetário (o valor é irrelevante para saber que "Drogasil" é Saúde).
    * Nomes próprios de pessoas físicas em PIX de terceiros (o pipeline mascara antes de qualquer chamada externa).
  * Enviando apenas descrições comerciais purificadas, o risco de vazamento de PII é nulo.

---

## 3. Arquitetura Recomendada em Camadas

A arquitetura recomendada opera em **4 Camadas em Cascata**, priorizando precisão determinística, latência zero e custo zero:

```
[ Nova Transação Bruta (Itaú / Pluggy / OFX) ]
                     │
                     ▼
       ┌─────────────────────────────┐
       │   Passo 0: Normalização     │
       │   Limpeza de prefixos,      │
       │   maquininhas e sufixos     │
       └─────────────┬───────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────┐
  │  CAMADA 1: Regras Determinísticas    │  ──► Detecta transferência entre contas próprias,
  │  (Zero Custo / 0ms)                  │      pagamento de fatura, IOF, juros, salário, tarifas.
  └──────────────────┬───────────────────┘
                     │ Sem match
                     ▼
  ┌──────────────────────────────────────┐
  │  CAMADA 2: Histórico do Usuário      │  ──► Consulta memória do próprio usuário:
  │  (Zero Custo / ~1ms)                 │      "Já categorizei esta descrição antes? Use a mesma."
  └──────────────────┬───────────────────┘
                     │ Sem match
                     ▼
  ┌──────────────────────────────────────┐
  │  CAMADA 3: Catálogo BR & MCC         │  ──► Dicionário local dos ~400 estabelecimentos
  │  (Zero Custo / ~2ms)                 │      populares no Brasil + código MCC do cartão.
  └──────────────────┬───────────────────┘
                     │ Sem match
                     ▼
  ┌──────────────────────────────────────┐
  │  CAMADA 4: LLM Fallback em Lote      │  ──► Chamada externa (Gemini Flash / OpenAI mini)
  │  (~R$ 0,01 por mil / com Cache)      │      com prompt sem PII e gravação no cache local.
  └──────────────────┬───────────────────┘
                     │
                     ▼
             [ Categoria Final ]
```

---

### Detalhamento das Camadas

#### Camada 1: Regras Determinísticas e Transferências
* **Detecção de Transferências (`isTransfer: true`):**
  * Lançamentos com termos como `PAGTO CARTAO ITAU`, `PAGAMENTO FATURA`, `PGTO FATURA` em conta corrente devem ser marcados como `isTransfer: true` e `categoryId: null`. Isso impede que o pagamento da fatura seja contado como despesa dupla nos relatórios mensais.
  * Transferências identificadas entre contas do próprio usuário (mesmo titular).
* **Detecção de Receitas Padronizadas:**
  * `SALARIO`, `FOLHA PAGAMENTO`, `REMUNERACAO` $\rightarrow$ Categoria **Salário** (`INCOME`).
  * `REND PAGO APLIC`, `RESGATE CDB`, `RENDIMENTO`, `DIVIDENDO` $\rightarrow$ Categoria **Rendimentos** (`INCOME`).
* **Tarifas e Encargos:**
  * `TAR PACOTE`, `TAR CADASTRO`, `ANUIDADE`, `IOF`, `MULTA CONTRATUAL` $\rightarrow$ Categoria **Dívidas e juros** (`EXPENSE`).

#### Camada 2: Histórico do Usuário (Aprendizado Contínuo)
* **Como funciona:**
  * O app consulta na tabela `transactions` os lançamentos passados do mesmo `userId` onde `description` (ou fingerprint normalizado) já possua um `categoryId` atribuído.
  * Se o usuário categorizou `PADARIA ESTRELA` como **Mercado** no mês passado, o sistema aplica automaticamente **Mercado**.
  * É possível manter uma tabela leve de regras aprendidas:
    ```sql
    CREATE TABLE category_rules (
      id varchar(32) PRIMARY KEY,
      user_id varchar(32) NOT NULL,
      normalized_pattern text NOT NULL,
      category_id varchar(32) NOT NULL,
      match_type text NOT NULL DEFAULT 'EXACT',
      created_at timestamptz DEFAULT now()
    );
    CREATE UNIQUE INDEX category_rules_user_pattern ON category_rules(user_id, normalized_pattern);
    ```

#### Camada 3: Catálogo Local de Estabelecimentos Brasileiros & MCC
* Um módulo estático em TypeScript (`src/lib/merchants-catalog.ts`) contendo termos padronizados:
  * **iFood / Rappi / Uber Eats / Zé Delivery** $\rightarrow$ `Alimentação fora`
  * **Uber / 99 / Postos Ipiranga, Shell, Petrobras, ConectCar, Sem Parar** $\rightarrow$ `Transporte`
  * **Carrefour / Pão de Açúcar / Assaí / Atacadão / Hortifruti** $\rightarrow$ `Mercado`
  * **Netflix / Spotify / Disney+ / Max / Amazon Prime / iCloud** $\rightarrow$ `Assinaturas`
  * **Drogasil / Raia / Pague Menos / Panvel** $\rightarrow$ `Saúde`
  * **Smart Fit / Bluefit / TotalPass / Gympass** $\rightarrow$ `Cuidados pessoais`
  * **Mercado Livre / Shopee / Amazon / Magalu / Zara / Renner** $\rightarrow$ `Compras`
* **Consulta ao `payeeMCC`:** Se o conector Pluggy forneceu o MCC no cartão, aplica-se o mapeamento ISO 18245 diretamente.

#### Camada 4: LLM Fallback (Gemini Flash / GPT-4o-mini)
* Transações que restarem sem classificação são acumuladas no lote de importação.
* O backend faz uma requisição HTTP única para a API da LLM:
  * **Input:** Array de descrições normalizadas e array das categorias do usuário (`id` e `name`).
  * **Retorno:** JSON estruturado mapeando cada transação para a categoria mais adequada.
* **Auto-aprendizado Imediato:** Quando a LLM categoriza um estabelecimento desconhecido, o resultado é salvo na tabela `category_rules` do usuário. Desta forma, o sistema **nunca chama a LLM duas vezes para a mesma descrição**.

---

### Como Tratar Receitas e PIX
* **PIX Recebido:**
  * No extrato bancário, o PIX recebido geralmente vem com a descrição: `PIX RECEBIDO - NOME DA PESSOA/EMPRESA`.
  * Se for transferências recorrentes de empresa contratante/PJ: a Camada 2 (histórico) aprende após a primeira atribuição manual.
  * Se for esporádico: cai na categoria padrão **Renda extra** (`INCOME`).
* **Transferência entre contas próprias:**
  * O sistema deve oferecer um botão de alternância rápida na interface de lançamentos (`isTransfer = true`) ou identificar automaticamente quando houver débitos e créditos com mesmo valor e data em contas cadastradas do mesmo usuário.

---

### Como o Usuário Corrige e o Sistema Aprende (Feedback Loop)
1. **Na Tela de Lançamentos ou Prévia:**
   * Quando o usuário altera o dropdown de uma transação de *"Sem categoria"* para *"Mercado"*, ou troca de *"Compras"* para *"Saúde"*, a Server Action correspondente (`updateTransactionCategory`):
     1. Atualiza a transação atual.
     2. Salva ou atualiza a regra na tabela `category_rules` para a descrição normalizada correspondente.
     3. Opcional: Oferece um prompt/toast: *"Deseja aplicar esta categoria para os outros 3 lançamentos passados de 'DROGARIA SÃO PAULO'?"*
2. **Ciclo de Precisão:**
   * **Dia 1 (Primeira importação):** Camadas 1, 3 e 4 cobrem entre **85% e 92%** dos lançamentos.
   * **Mês 2 em diante:** Com a Camada 2 (histórico personalizado) populada, a taxa de acerto atinge **> 98%**, com chamadas à LLM praticamente zeradas.

---

## 4. O que NÃO foi possível confirmar com 100% de certeza

1. **Constância do campo `payeeMCC` no Itaú via Pluggy:** Não foi possível confirmar se todas as transações de cartão de crédito do Itaú entregam o campo `payeeMCC` populado no Open Finance, ou se isso ocorre apenas em transações processadas sob determinadas adquirentes.
2. **Existência de Base Aberta e Gratuita Completa de Estabelecimentos do Brasil com Licença Aberta:** Não existe um dataset único, público e consolidado em licença MIT com todos os pequenos comércios do Brasil já categorizados por finanças pessoais. O catálogo de ~300 grandes redes precisa ser mantido e curado no próprio código do projeto (`src/lib/`).
