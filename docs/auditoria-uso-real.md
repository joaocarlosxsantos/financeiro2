# Auditoria de Uso Real e QA Exploratório (Tarefa T25b)

Data: 10/11/2026  
Ambiente: Servidor local (`http://localhost:4100`), Banco Neon Postgres  
Dispositivos e Resoluções Testadas:
- **Desktop**: 1366 × 768 px
- **Mobile**: 390 × 844 px (iPhone 12 / Modern Mobile Viewport)  
Conta de Teste: `qa-teste@financeiro.local` (QA Teste)  
Automação e Inspeção: Maestri Portal Browser Automation

---

## 1. Resumo Executivo & Métricas de Toques/Cliques

| Tarefa Principal | Toques/Cliques (Desktop) | Toques/Cliques (Mobile) | Status da Experiência | Avaliação de Fricção |
|---|:---:|:---:|:---:|---|
| **Cadastro / Login** | 3 interações | 3 toques | Fluido | Baixa fricção (login direto e rápido) |
| **Criar Nova Conta Financeira** | 3 cliques | 4 toques | Confuso | **Alta fricção** (menu "Contas" não cria contas) |
| **Lançar Receita (Entrada)** | 3 cliques | 3 toques | Fluido | Baixa fricção (modal claro e objetivo) |
| **Lançar Despesa (Saída)** | 2 cliques | 2 toques | Fluido | Muito baixa fricção (Saída vem por padrão) |
| **Editar Lançamento** | 1 a 2 cliques | 2 toques | Incompleto | **Crítico**: só altera categoria; não edita valor/texto |
| **Filtrar Lançamentos** | 1 clique | 1 toque | Excelente | Filtros rápidos com pílulas e botão "Limpar" |
| **Consultar Painel Geral** | 1 clique | 1 toque | Excelente | Métricas consolidadas e gráfico responsivo |
| **Configurações Gerais** | 1 clique | 2 toques (via Mais) | Atenção | Erro visível de preferências Telegram |
| **Conectar Open Finance** | 2 cliques | 3 toques | **Bloqueante** | Exige chaves de API B2B do usuário final |

---

## 2. Achados Priorizados por Severidade

### [P0 - Bloqueante] Conexão Open Finance Inacessível ao Usuário Comum
- **Tela**: `/configuracoes/integracao` ("Conectar conta")
- **Problema**: Ao clicar no botão "Conectar conta", o modal "Nova conexão Open Finance" exige que o usuário preencha manualmente:
  - `Client ID`
  - `Client Secret`
  - `Item ID (Pluggy)`
  - `Nome desta conexão`
  - `Data inicial de importação`
- **Impacto**: Um usuário final de aplicativo de finanças pessoais não é desenvolvedor e não possui conta ou credenciais na API da Pluggy. O fluxo esperado de Open Finance é a abertura do widget Pluggy Connect (ou redirecionamento OAuth bancário) onde o usuário seleciona seu banco (Nubank, Itaú, Bradesco, etc.) e autentica diretamente.
- **Passos para reproduzir**:
  1. Acessar `/configuracoes/integracao`.
  2. Clicar em "Conectar conta".
  3. Modal solicita Client ID, Client Secret e Item ID.
- **Esperado**: Abrir o widget do Pluggy Connect para autenticação bancária automatizada.
- **Obtido**: Formulário manual de credenciais de desenvolvedor/API.

---

### [P1 - Importante] Impossibilidade de Editar Descrição, Valor e Data de Lançamentos
- **Tela**: `/lancamentos` (Lista de lançamentos e modal de detalhes)
- **Problema**: Ao clicar sobre a descrição de um lançamento (`tx.description`), abre-se o modal "Detalhes do lançamento", porém ele **apenas permite alterar a categoria**, dividir a despesa ou marcar como transferência. Não há campos para editar o nome da descrição, o valor ou a data.
- **Impacto**: Se o usuário cometer um erro de digitação no valor (ex.: digitou R$ 450 em vez de R$ 45) ou na descrição, não tem como corrigir; ele é obrigado a excluir o lançamento e cadastrá-lo do zero.
- **Passos para reproduzir**:
  1. Ir para `/lancamentos`.
  2. Clicar em qualquer lançamento da lista (ex.: "QA Almoco Restaurante").
  3. O modal aberto não exibe campos editáveis para descrição ou valor monetário.
- **Esperado**: Poder corrigir descrição, valor e data de qualquer lançamento manual (o backend já possui a função `updateTransaction`).
- **Obtido**: Apenas troca de categoria e botões de ação auxiliar.

---

### [P1 - Importante] Confusão de Arquitetura de Informação: Menu "Contas" vs. Criação de Contas
- **Tela**: `/contas` e navegação principal
- **Problema**: O menu lateral (desktop) e a barra inferior (mobile) possuem o item **"Contas"** (`/contas`), mas a página resultante intitula-se **"Saldos"** e apresenta apenas o patrimônio líquido consolidado e o botão "Ajustar saldo inicial". Não existe nenhum botão para "Cadastrar nova conta" nessa página.
- **Impacto**: O usuário novo clica em "Contas" procurando cadastrar sua conta corrente ou cartão e fica desorientado. O cadastro de contas está escondido dentro de `/configuracoes` sob a seção "Contas e cartões".
- **Passos para reproduzir**:
  1. Clicar em "Contas" no menu de navegação.
  2. Procurar botão de adicionar conta. Ele não existe na página `/contas`.
- **Esperado**: Ou a página `/contas` conter uma ação direta "Nova conta", ou o menu indicar claramente "Saldos" e "Contas e Cartões".
- **Obtido**: Usuário precisa adivinhar que a criação de contas fica em "Configurações".

---

### [P1 - Importante] Mobile: Botão "Sair" Sobreposto na Área Crítica do Polegar (Gaveta "Mais")
- **Tela**: Mobile (390 × 844 px), gaveta "Mais opções"
- **Problema**: Ao abrir a gaveta "Mais opções" (`Sheet`), o último item é o formulário de "Sair" (Logout), localizado no extremo inferior da tela (`y ≈ 779-823 px`), exatamente na mesma área de toque da barra de navegação principal (`[0, 775 390x69]`).
- **Impacto**: Ao tentar fechar a gaveta ou tocar perto do rodapé, o usuário toca acidentalmente em "Sair" e é deslogado imediatamente, sem confirmação prévia.
- **Passos para reproduzir**:
  1. Em resolução 390x844, tocar no botão "Mais opções" no canto inferior direito.
  2. Tentar tocar próximo ao rodapé ou tentar alternar de aba.
  3. O botão "Sair" é acionado e a sessão é encerrada instantaneamente.
- **Esperado**: O botão "Sair" ter espaçamento seguro da borda inferior e solicitar confirmação ("Deseja realmente sair?").
- **Obtido**: Logout acidental imediato com perda de contexto.

---

### [P2 - Sugestão/Correção] Alerta de Falha ao Carregar Preferências do Telegram
- **Tela**: `/configuracoes`
- **Problema**: Ao carregar a página de configurações, é exibido imediatamente o aviso em vermelho: `"Não foi possível carregar as preferências. Tente novamente."` no card do Telegram.
- **Causa**: O componente `TelegramPreferencesPanel` chama a server action `loadTelegramPreferences`, que falha quando a tabela/migration correspondente não está aplicada ou o serviço não está ativo.
- **Impacto**: Transmite sensação de instabilidade ou erro na plataforma assim que o usuário entra nas configurações, mesmo sem ele ter tentado interagir com o Telegram.
- **Recomendação**: Tratar o estado inicial de forma graciosa; se não houver preferências salvas ou se o recurso estiver inativo, exibir o estado padrão sem mensagem de erro intrusiva.

---

### [P3 - Observação Técnica] Dependência de rAF (requestAnimationFrame) para Streaming SSR (React 19)
- **Comportamento**: Em abas ou portais em segundo plano, o Chromium congela ou retarda o ciclo do `requestAnimationFrame`. As páginas que utilizam Suspense SSR streaming mantêm o esqueleto `<section role="status">Carregando seus dados…</section>` na tela até que um ciclo de renderização ocorra na viewport ativa. Em uso real no navegador do usuário focado, o carregamento flui normalmente em menos de 1,5s.

---

## 3. Avaliação por Tela e Fluxos

### 3.1. Cadastro e Login (`/cadastro`, `/login`)
- **Desktop (1366x768)**: Formulários centralizados, tipografia com bom contraste, campos com altura ergonômica (48px) e labels claras.
- **Mobile (390x844)**: Totalmente responsivo, campos ocupam a largura adequada sem transbordamento horizontal.
- **Validações**: Senha mínima de 8 caracteres e confirmação de senha funcionando corretamente.

### 3.2. Painel Principal (`/painel`)
- **Resumo do Mês**: Indicadores de "Sobrou no mês", "Entrou", "Saiu" e "Fixo" com valores bem destacados e sem ruído visual.
- **Gráfico Mensal**: Recharts perfeitamente contido na viewport (tanto em 1366px quanto em 390px), mantendo a legibilidade dos rótulos de valores e legendas.
- **Onboarding ("Primeiros passos")**: Aparece apenas enquanto o usuário não possui contas ou lançamentos; assim que uma conta e lançamento são criados, o card de primeiros passos é removido automaticamente da tela.

### 3.3. Lançamentos (`/lancamentos`)
- **Desktop**: Layout em duas colunas muito eficiente (lista filtrável à esquerda e compositor rápido "Saiu / Entrou" à direita).
- **Mobile**: O compositor rápido lateral é recolhido; em seu lugar, o botão flutuante central "Novo" na barra inferior abre o modal de lançamento de forma muito intuitiva.
- **Filtros**: Funcionamento instantâneo via URL (`?kind=INCOME`, etc.), facilitando histórico do navegador e compartilhamento/recarregamento sem perda de filtro.
- **Pontos Fortes**: Ações em lote para categorização ("Categorizar não categorizados"), botão de limpar filtros e modal de divisão de despesas.

### 3.4. Saldos e Contas (`/contas`)
- **Visão Patrimonial**: Saldos por conta, saldo atual, inicial e entradas/saídas consolidadas.
- **Conciliação**: Botão de "Ajustar saldo inicial" direto no card da conta.

### 3.5. Configurações (`/configuracoes`)
- **Perfil Financeiro**: Definição de renda líquida, meta de meses de reserva (3 a 24 meses) e porcentagem de economia (5% a 50%).
- **Mobile Disclosure**: No mobile, o formulário de perfil fica recolhido em um acordeão ("Editar perfil financeiro"), otimizando a rolagem da página.
- **Gerenciamento de Contas e Categorias**: Possibilidade de editar cores, nomes e palavras-chave de categorias.
- **Exportação**: Botão para download de backup JSON direto do perfil financeiro.

### 3.6. Tema Claro e Escuro
- Alternância instantânea via botão dedicado no cabeçalho em todas as páginas.
- Persistência em `localStorage` (`fin-theme`).
- Excelente contraste e legibilidade tanto no tema AMOLED escuro quanto no tema claro.

---

## 4. Conclusão & Recomendações Prioritárias

1. **Prioridade Máxima (Produto)**: Substituir o formulário manual de credenciais de desenvolvedor em `/configuracoes/integracao` pela inicialização do widget do **Pluggy Connect**, permitindo que o usuário conecte seu banco sem necessidade de chaves de API.
2. **Prioridade Alta (UX)**: Implementar campos de edição para descrição, valor e data no modal de detalhes do lançamento em `/lancamentos`, aproveitando a action `updateTransaction` já existente no servidor.
3. **Prioridade Média (Navegação)**: Incluir um botão ou atalho "+ Nova conta" diretamente dentro da tela `/contas`, eliminando a fricção de ter que ir até as configurações para criar uma conta.
4. **Prioridade Média (Mobile Safety)**: Adicionar confirmação no botão "Sair" do menu móvel e afastar sua posição do limite inferior da tela para prevenir toques acidentais do polegar.
