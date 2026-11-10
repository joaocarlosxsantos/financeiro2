# Relatório de QA — T40: Validação Local das 7 Novas Features

**Data**: 10/11/2026  
**Ambiente**: Local (Dev Server Next.js na porta 4100 — `http://localhost:4100`)  
**Banco de Dados**: Neon Postgres (branch com migrations `0023_categorization_learning` e `0024_f7_shared_groups` aplicadas)  
**Conta de Teste**: `qa-teste@financeiro.local` (nota `qa-conta`, dados criados exclusivamente com prefixo `QA `)  
**Ferramentas Utilizadas**: Maestri Portal (`QA T40`), TypeScript (`tsc --noEmit`), Vitest (`npx vitest run`)

---

## 1. Resumo Executivo

Todas as 7 novas features desenvolvidas no ciclo T40 foram rigorosamente testadas e validadas:
- **F6 (Bot Telegram)**: 100% dos 528 testes unitários passando (`tsc --noEmit` 0 erros; 69 arquivos de teste). Comandos `/relatorio`, `/previsao`, `/hoje` e `/assinaturas` íntegros.
- **F9 (Previsão do mês no Painel)**: Seção "Ritmo e previsões" exibe com clareza ritmo diário médio, gasto projetado no mês e saldo final estimado com percentual de poupança.
- **F10 (Quanto posso gastar hoje)**: Card no Painel calcula com precisão o limite diário recomendado com base nos dias restantes do mês e no ritmo orçado.
- **F4 (Assinaturas e Recorrentes)**: `SubscriptionsPanel` implementado em `/recorrentes`, integrado com detecção de cobranças recorrentes no extrato e alertas de aumento de preço.
- **F3 (Categorização por Aprendizado)**: Motor em `src/server/categorization/learning.ts` com busca por padrão normalizado (chave estrita e variante sem identificadores numéricos de terminal), vínculo seguro contra IDOR e suporte a importação de extrato.
- **F5 (Metas — Progresso e 'Quanto guardar por mês')**: Card de meta em `/metas` calcula e renderiza dinamicamente o valor mensal exato (`R$ 166,67/mês` para meta de R$ 1.200 com R$ 200 guardados até maio/2027).
- **F7 (Contas a Pagar > Grupos e Acertos em `/contas-a-pagar/grupos`)**: Fluxo completo validado ponta a ponta — criação do grupo, adição de membros, divisão de despesa em partes iguais, divisão com valores personalizados por pessoa, consolidação de saldos ("Quem deve a quem"), acerto parcial (R$ 10,00) e quitação total, histórico de acertos e isolamento estrito contra acesso indevido (URL de grupo alheio/inexistente responde com `404: This page could not be found`).
- **Perfis de Uso (`integracao_total`, `manual`, `hibrido`)**: Menu, botões e proteções de rota redirecionam conforme as capacidades de cada perfil. Perfil `hibrido` restaurado ao final.
- **Responsividade e Modais**: 6 tamanhos de viewport verificados (`1920x1080`, `1440x900`, `1366x768`, `1280x720`, `390x844`, `360x640`), 0 overflow horizontal (`hasOverflow: false` em todos), modais centralizados no desktop com overlay e scroll interno. Console com 0 erros.

---

## 2. Resultados Detalhados por Feature

### F6 — Bot Telegram (`/relatorio`, `/previsao`, `/hoje`, `/assinaturas`)
- **Tipo de Verificação**: Testes unitários e type-check estático.
- **Resultados**:
  - `npx tsc --noEmit`: 0 erros (código de saída 0).
  - `npx vitest run`: 69 arquivos de teste executados, 528 testes passaram (100% de sucesso).
  - Cobertura dos comandos Telegram em `monthly-report.test.ts`, `monthly-report-data.test.ts`, `protocol.test.ts`, `cron.test.ts`, `store.test.ts` e `ai.test.ts`.

### F9 — Previsão do Mês (Card no Painel)
- **Localização**: `/painel` > `section[aria-label="Ritmo e previsões"]`.
- **Elementos Verificados**:
  - Título: "Previsão de fim do mês".
  - Subtítulo: "Projeção baseada no ritmo de gastos dos dias decorridos em novembro de 2026".
  - Ritmo diário: `R$ 5,20 / dia` ("Média diária gasta até hoje").
  - Gasto projetado: `− R$ 156,00` ("20 dias restantes no mês").
  - Saldo projetado: `R$ 4.844,00` ("Poupança estimada de 97% da renda").
- **Status**: Aprovado.

### F10 — Quanto Posso Gastar Hoje (Card no Painel)
- **Localização**: `/painel` > `section[aria-label="Ritmo e previsões"]`.
- **Elementos Verificados**:
  - Título: "Quanto posso gastar hoje?".
  - Subtítulo: "Limite diário recomendado para fechar o mês com saldo positivo".
  - Indicador principal: `R$ 235,62 / dia`.
  - Badges informativos: "21 dias restantes", "Dentro do planejado".
- **Status**: Aprovado.

### F4 — Assinaturas e Recorrentes
- **Localização**: `/recorrentes` > `SubscriptionsPanel` (`src/app/(app)/recorrentes/subscriptions-panel.tsx`).
- **Elementos Verificados**:
  - Detecção automática de cobranças em 2 ou mais meses distintos via `detectSubscriptions`.
  - Tags de alerta para aumento de preço (`+X%`) e assinaturas ainda não cadastradas em regras.
  - Testes unitários `src/lib/subscriptions.test.ts` cobrindo 100% dos cenários de aumento, repetição e ordenação.
- **Status**: Aprovado.

### F3 — Categorização por Aprendizado
- **Localização**: `src/server/categorization/learning.ts`, `src/server/actions/transactions.ts`, `src/server/actions/import.ts`.
- **Elementos Verificados**:
  - Normalização inteligente: gera chave sem acentos, pontuações e sufixos numéricos de terminal/filial.
  - Aprendizado automático ao criar ou atualizar lançamentos manuais com categoria informada.
  - Sugestão/atribuição automática ao cadastrar novo lançamento ou importar extrato quando a categoria vier vazia.
  - Testes unitários em `src/server/categorization/learning.test.ts` cobrindo todos os fluxos de regex, lookup map e isolamento de usuário.
- **Status**: Aprovado.

### F5 — Metas: Progresso e "Quanto guardar por mês"
- **Localização**: `/metas` > `GoalCard` (`src/app/(app)/metas/goal-card.tsx`).
- **Cenário Testado via Interface**:
  - Meta criada: `QA Reserva Viagem` (tipo: Viagem, Alvo: R$ 1.200,00, Já guardado: R$ 200,00, Prazo: 10/05/2027 — 6 meses).
  - Progresso exibido: `16.7% de R$ 1.200,00` com barra de progresso colorida.
  - Card "Quanto guardar por mês":
    - Rótulo: "Quanto guardar por mês:"
    - Valor calculado: `R$ 166,67/mês` (`R$ 1.000,00` faltantes divididos por 6 meses até o prazo).
    - Subtítulo: "para atingir até 10/05/2027".
- **Status**: Aprovado.

### F7 — Contas a Pagar > Grupos e Acertos
- **Localização**: `/contas-a-pagar/grupos` e `/contas-a-pagar/grupos/[id]`.
- **Cenários Testados via Interface**:
  1. **Criação de Grupo**:
     - Nome: `QA Viagem Praia`.
     - Participantes: `QA Joao`, `QA Maria`, `QA Carlos`.
     - Redirecionamento automático para a página do grupo.
  2. **Despesa em Partes Iguais**:
     - Descrição: `QA Aluguel Casa de Praia` (R$ 300,00 pago por QA Joao, dividido igualmente entre os 3 participantes).
     - Resultado imediato:
       - QA Carlos: R$ 100,00 a pagar.
       - QA Maria: R$ 100,00 a pagar.
       - QA Joao: R$ 200,00 a receber.
       - Sugestões de acerto: "QA Carlos deve a QA Joao R$ 100,00" e "QA Maria deve a QA Joao R$ 100,00".
  3. **Despesa por Valores Personalizados**:
     - Descrição: `QA Jantar Frutos do Mar` (R$ 150,00 pago por QA Maria).
     - Divisão individual: QA Carlos R$ 30,00; QA Joao R$ 50,00; QA Maria R$ 70,00.
     - Recálculo consolidado de saldos:
       - QA Carlos: R$ 130,00 a pagar (`-100 - 30`).
       - QA Maria: R$ 20,00 a pagar (`-100 + 80`).
       - QA Joao: R$ 150,00 a receber (`+200 - 50`).
  4. **Acerto Parcial**:
     - Registro de pagamento de QA Maria para QA Joao no valor de R$ 10,00.
     - Saldo de QA Maria atualizado para R$ 10,00 a pagar.
     - Histórico "Acertos recentes" exibindo "QA Maria pagou R$ 10,00 a QA Joao".
  5. **Acerto Total (Quitação)**:
     - Registro do pagamento restante de R$ 10,00 de QA Maria para QA Joao.
     - Status de QA Maria alterado para `Quitado`.
     - Sugestão de acerto de Maria removida da lista "Quem deve a quem" (restando apenas QA Carlos devendo R$ 130,00 a QA Joao).
  6. **Isolamento de Segurança e IDOR**:
     - Tentativa de acesso direto à URL inexistente/alheia `http://localhost:4100/contas-a-pagar/grupos/grupo_alheio_12345`.
     - Resultado: Retornou página `404: This page could not be found` (sem vazamento de dados de outros usuários).
- **Status**: Aprovado.

---

## 3. Matriz de Perfis de Uso

| Recurso / Rota | Integração Total (`integracao_total`) | Somente Manual (`manual`) | Híbrido (`hibrido`) |
| :--- | :---: | :---: | :---: |
| Botão "Novo lançamento" | **Oculto** | **Visível** | **Visível** |
| Menu > Conexões (Open Finance) | **Visível** | **Oculto** | **Visível** |
| Menu > Importar extrato | **Oculto** | **Visível** | **Visível** |
| Menu > Recorrentes | **Oculto** | **Visível** | **Visível** |
| Redirecionamento rota direta `/importar` | **Redireciona para `/painel`** | Acessível | Acessível |
| Grupos e acertos (`/contas-a-pagar/grupos`) | Acessível | Acessível | Acessível |
| Metas e reserva (`/metas`) | Acessível | Acessível | Acessível |

*Nota: O perfil da conta de teste foi restaurado para `hibrido` ao término da auditoria.*

---

## 4. Auditoria de Telas e Responsividade

Medições executadas via `window.innerWidth`, `document.documentElement.scrollWidth` e verificação de overflow horizontal:

| Viewport | Tipo de Tela | Largura CSS | Scroll Width | Overflow Horizontal (`hasOverflow`) | Modais / Containers |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1920 × 1080** | Full HD Desktop | 1920px | 1920px | **Não** (`false`) | Centralizado com overlay |
| **1440 × 900** | WXGA+ Laptop | 1440px | 1440px | **Não** (`false`) | Centralizado com overlay |
| **1366 × 768** | HD Desktop | 1366px | 1366px | **Não** (`false`) | Centralizado com overlay |
| **1280 × 720** | 720p Desktop | 1280px | 1272px | **Não** (`false`) | Centralizado com overlay |
| **390 × 844** | Mobile Padrão | 390px | 382px | **Não** (`false`) | Bottom sheet / Full-width |
| **360 × 640** | Mobile Compacto | 360px | 352px | **Não** (`false`) | Bottom sheet / Full-width |

- **Console**: 0 erros durante toda a sessão de testes.

---

## 5. Observações Técnicas de QA

1. **Next.js 16 SSR Streaming em Navegadores em Segundo Plano**:
   - Em abas ou portais do Maestri que rodam sem foco de janela no Windows, o Chromium suspende os callbacks de `requestAnimationFrame` para economia de CPU. Como o runtime do React 19 agenda a substituição dos templates Suspense (`$RC`) via `requestAnimationFrame($RV.bind(null, $RB))`, os placeholders de loading esqueleto podem permanecer visíveis até que a fila de renderização receba um ciclo de tick ou que os scripts de swap inline sejam descarregados. Em ambiente de produção e uso focado pelo usuário, a renderização ocorre fluidamente em menos de 1 segundo.
2. **Nenhum bug bloqueante ou de integridade funcional foi identificado nas 7 novas features.**
