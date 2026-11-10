# Relatório de QA em Produção: Perfis de Uso e Ajustes (Tarefa T32)

Data: 10/11/2026  
Ambiente: Produção — `https://mutanocontas.vercel.app` (Deploy: `dpl_7knxLTGiMt3j4r47h11QsZuHvTzG`, Commit: `9de4cd7`)  
Conta de Teste: `qa-teste@financeiro.local` (Conta de testes da nota `qa-conta`)  
Perfis Testados: **Integração Total**, **Somente Manual** e **Híbrido** (Restaurado ao fim)  
Resoluções Auditadas: 1920×1080, 1366×768, 1280×720, 390×844 e 360×640  
Ferramenta de QA: Automação e Inspeção com Maestri Portal Visual

---

## 1. Resumo Executivo

| Item de Verificação | Status | Observações |
|---|:---:|---|
| **Login no novo domínio** | **APROVADO** | Sessão criada com sucesso via NextAuth; sem loop de callback, sem redirect para domínio legado |
| **Alternância de Perfis (`/usuario`)** | **APROVADO** | Rádios funcionais (`integracao_total`, `manual`, `hibrido`), persistência instantânea no banco |
| **Comportamento: Integração Total** | **APROVADO** | Botão `+` oculto no desktop e mobile (bottom-nav com 4 itens); rotas `/importar` e `/recorrentes` redirecionam para `/painel`; botão "Criar conta" oculto em `/contas` |
| **Comportamento: Somente Manual** | **APROVADO** | Conexões Open Finance ocultas no menu; rota direta `/configuracoes/integracao` redireciona para `/painel`; botão `+` e "Criar conta" visíveis |
| **Comportamento: Híbrido (Padrão)** | **APROVADO** | Todas as funcionalidades ativas; restaurado e confirmado no banco ao final dos testes |
| **Edição de Lançamento (Descrição e Valor)** | **APROVADO** | Modal "Detalhes do lançamento" agora inclui campos editáveis de descrição, valor e data; alteração de teste ("QA Almoco Executivo" - R$ 52,00) salva e refletida no painel |
| **Criação de Conta** | **APROVADO** | Botão "Criar conta" disponível diretamente em `/contas`; modal abre e cria com sucesso ("QA Poupanca Teste") |
| **Extrato por Conta** | **APROVADO** | Links diretos "Ver extrato de [Conta]" em `/contas` direcionam para `/lancamentos?accountId=...` filtrando corretamente |
| **Sair com Confirmação no Mobile** | **APROVADO** | Ao tocar em "Sair" na gaveta "Mais", abre o grupo "Confirmar saída" ("Cancelar" / "Sim, sair") evitando logout acidental |
| **Segurança: Backup com Senha** | **APROVADO** | Botão "Baixar backup (JSON)" em `/configuracoes` abre diálogo solicitando confirmação de senha do usuário antes do download |
| **Segurança: Proteção de Endpoints (Cron/Webhook)** | **APROVADO** | `/api/cron/insights` sem segredo retorna **401 Unauthorized**; `/api/telegram/webhook` sem segredo retorna **401 Unauthorized** |
| **Responsividade Multi-resolução** | **APROVADO** | 1920x1080, 1366x768, 1280x720, 390x844 e 360x640 sem quebras de layout, sem overflow horizontal |
| **Erros de Console** | **APROVADO** | 0 erros capturados nos logs de console durante toda a sessão |

---

## 2. Detalhamento dos Testes Realizados

### 2.1. Login e Domínio de Produção
- **URL**: `https://mutanocontas.vercel.app/login`
- **Credenciais**: `qa-teste@financeiro.local` / `[senha de teste omitida]`
- **Validação**: Submissão do formulário de login redirecionou imediatamente para `https://mutanocontas.vercel.app/painel` com cookie de sessão `HttpOnly` emitido corretamente. Nenhum redirecionamento espúrio para domínios legados ou erros de callback.

### 2.2. Perfis de Uso (`/usuario`)

#### A. Perfil Integração Total (`integracao_total`)
- **Menu Desktop**: O botão global superior "Novo lançamento" foi removido; os links "Recorrentes" e "Importar" foram ocultados do menu; o link "Conexões e sincronização" permaneceu visível.
- **Mobile (390×844 e 360×640)**: A barra de navegação inferior foi reconfigurada de 5 para 4 botões (Painel, Lançamentos, Contas, Mais), omitindo o botão central `+` ("Novo lançamento").
- **Proteção de Rotas**:
  - Acesso direto a `/importar` redirecionou automaticamente com HTTP 307 para `/painel`.
  - Acesso direto a `/recorrentes` redirecionou automaticamente com HTTP 307 para `/painel`.
- **Criação de Contas**: Na tela `/contas`, o botão "Criar conta" foi ocultado (`canUseCapability(profile, "manual-entry") === false`).

#### B. Perfil Somente Manual (`manual`)
- **Menu Desktop**: "Conexões e sincronização" foi ocultado da navegação principal; "Importar" e "Recorrentes" permaneceram visíveis; o botão "Novo lançamento" esteve disponível.
- **Mobile**: Botão central `+` presente na barra de navegação inferior.
- **Proteção de Rotas**:
  - Acesso direto a `/configuracoes/integracao` redirecionou automaticamente para `/painel`.
- **Criação de Contas**: Botão "Criar conta" exibido no topo da página `/contas`.

#### C. Perfil Híbrido (`hibrido`)
- Todas as capacidades ativas simultaneamente (Open Finance + Lançamentos manuais + Importação de extratos).
- **Restauração**: Perfil selecionado, submetido e confirmado como ativo no banco de dados da conta de teste ao término dos testes.

### 2.3. Edição de Lançamento Manual
- **Tela**: `/lancamentos`
- **Fluxo**: Ao clicar em um lançamento na lista, o modal "Detalhes do lançamento" agora disponibiliza os campos editáveis:
  - `Descrição` (input de texto)
  - `Valor (R$)` (input monetário formatado)
  - `Data` (input date)
  - Botão `Salvar alterações`
- **Teste**: O lançamento de teste foi alterado de "QA Almoco Restaurante" (R$ 45,50) para "QA Almoco Executivo" (R$ 52,00). O envio via server action persistiu a atualização, o modal fechou e a lista/totais refletiram o novo valor de imediato.

### 2.4. Criação de Conta Financeira
- **Tela**: `/contas`
- **Fluxo**: Clique no botão "Criar conta" no topo da página.
- **Dados informados**:
  - Nome: `QA Poupanca Teste`
  - Tipo: `Poupança`
- **Resultado**: Conta criada com sucesso, aparecendo na listagem de saldos consolidada.

### 2.5. Extrato por Conta
- **Tela**: `/contas`
- **Fluxo**: Cada card de conta possui agora um link de navegação direta "Ver extrato de [Conta]".
- **Validação**: Ao clicar em "Ver extrato de QA Poupanca Teste", a aplicação navega para `/lancamentos?accountId=...` exibindo os lançamentos filtrados para aquela conta específica.

### 2.6. Confirmação de Saída no Mobile
- **Tela**: Mobile (390×844 e 360×640)
- **Fluxo**: Abertura da gaveta "Mais opções" e toque no botão "Sair".
- **Comportamento**: Em vez de efetuar logout imediato, é exibido o grupo de confirmação com os botões:
  - `Cancelar` (reverte o estado mantendo o usuário logado)
  - `Sim, sair` (confirma a desconexão)
- **Resultado**: Elimina o risco de logout acidental pelo toque involuntário do polegar na área inferior.

### 2.7. Segurança e Proteção de Endpoints
1. **Download de Backup**:
   - Em `/configuracoes`, clicar em "Baixar backup (JSON)" abre um modal de segurança exigindo a confirmação da senha do usuário logado antes de liberar a rota `/api/exportar/backup`.
2. **Cron de Insights (`/api/cron/insights`)**:
   - Requisição sem segredo no cabeçalho Authorization/Bearer: Retorna código HTTP **401 Unauthorized**.
3. **Webhook do Telegram (`/api/telegram/webhook`)**:
   - Requisição POST sem segredo `x-telegram-bot-api-secret-token`: Retorna código HTTP **401 Unauthorized**.

### 2.8. Testes de Responsividade Multi-resolução
- **1920 × 1080 (Full HD Desktop)**: Layout centralizado, sidebar estendida, cards de saúde financeira e gráficos preenchendo adequadamente a tela.
- **1366 × 768 (Laptop Standard)**: Sem quebra de linha nas abas e botões de filtro; proporções confortáveis.
- **1280 × 720 (HD Ready)**: Proporção de containers e gráficos preservada sem transbordamento.
- **390 × 844 (Mobile Moderno - iPhone 12/13/14)**: Bottom navigation bar com padding de segurança, gaveta "Mais" com rolagem limpa e botões com alvos táteis mínimos de 44px/48px.
- **360 × 640 (Mobile Compacto - Android)**: Navegação inferior compactada com alinhamento uniforme (61px de largura por botão), gráficos redimensionados sem rolagem horizontal na página.

---

## 3. Conclusão

Todas as funcionalidades, correções de segurança, diferenciações de perfil de uso e melhorias ergonômicas da T32 foram homologadas em ambiente de produção real (`https://mutanocontas.vercel.app`) com 100% de êxito. A conta de testes foi mantida limpa e com o perfil **Híbrido** devidamente restaurado.
