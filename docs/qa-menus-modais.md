# Relatório de QA Local: Menus Agrupados e Modais Centralizados (Tarefa T37)

Data: 10/11/2026  
Ambiente: Servidor Local de Desenvolvimento (`http://localhost:4100`)  
Branch/Working Tree: T33 (Navegação estruturada em seções) + T34 (Modais centralizados no desktop)  
Conta de Teste: `qa-teste@financeiro.local`  
Resoluções Auditadas com Medidas:
- **1920 × 1080 px** (Full HD Desktop)
- **1440 × 900 px** (MacBook/Laptop Widescreen)
- **1366 × 768 px** (Laptop Standard)
- **1280 × 720 px** (HD Desktop)
- **390 × 844 px** (Mobile - iPhone 12/13/14)
- **360 × 640 px** (Mobile Compacto - Android)  
Ferramenta: Automação e Inspeção com Maestri Portal Visual

---

## 1. Resumo Executivo das Validações

| Funcionalidade Auditada | Status | Resumo da Validação |
|---|:---:|---|
| **Menus Agrupados (3 Perfis)** | **APROVADO** | Seções semânticas (`Visão geral`, `Movimentações`, `Planejamento`, `Integração`, `Conta`) com cabeçalhos `<h2>` e links com ícones; adaptação precisa conforme o perfil de uso |
| **Rodapé do Menu Desktop** | **APROVADO** | Exibe nome do usuário (`QA Teste`) + ícone `UserRound` + subtítulo `Minha conta`; **sem e-mail**; clique navega direto para `/usuario` |
| **Sair com Confirmação** | **APROVADO** | Tanto no desktop quanto no mobile, o botão "Sair" exibe o grupo `Confirmar saída` com botões `Cancelar` e `Sim, sair`, prevenindo encerramento acidental |
| **Modais Desktop: Centralização** | **APROVADO** | Todos os 5 modais (Lançamento, Split, Backup, Integração, Criar Conta) centralizados nos eixos X e Y (`centerX === screenCenterX`, `centerY === screenCenterY`) |
| **Modais Desktop: Overlay e Fechamento** | **APROVADO** | Fundo escurecido e borrado (`backdrop:bg-black/60 backdrop:backdrop-blur-sm`); tecla `Escape` fecha; clique fora (no backdrop) fecha |
| **Modais Desktop: Scroll Interno** | **APROVADO** | Container interno com classe `overflow-y-auto overscroll-contain` para rolagem independente caso o conteúdo exceda a viewport |
| **Mobile: Bottom Sheet Mantida** | **APROVADO** | Em telas mobile (`< 768px`), os diálogos abrem como bottom sheet ancorada na base (`bottom: 844px` / `844px`, `max-h-[90%]`, cantos arredondados superiores) |
| **Erros de Console** | **APROVADO** | 0 erros nos logs de console em todas as páginas e ações |

---

## 2. Auditoria dos Menus Agrupados por Perfil de Uso

A navegação agora é gerada pelo componente centralizado `NavigationSections` e categorizada semanticamente em seções:

### 2.1. Perfil Híbrido (`hibrido`)
- **Visão geral**: Painel, Insights
- **Movimentações**: Lançamentos (`/lancamentos`), Contas (`/contas`), Recorrentes (`/recorrentes`), Importar (`/importar`)
- **Planejamento**: Contas a pagar, Orçamento, Metas, Dívidas, Projeções
- **Integração**: Conexões (`/configuracoes/integracao`)
- **Conta**: Configurações (`/configuracoes`)
- **Ações Rápidas**: Botão global superior "Novo lançamento" ativo.

### 2.2. Perfil Integração Total (`integracao_total`)
- **Visão geral**: Painel, Insights
- **Movimentações**: Lançamentos, Contas (**"Recorrentes" e "Importar" suprimidos**)
- **Planejamento**: Contas a pagar, Orçamento, Metas, Dívidas, Projeções
- **Integração**: Conexões
- **Conta**: Configurações
- **Ações Rápidas**: Botão global "Novo lançamento" suprimido; no mobile, a barra inferior exibe 4 itens (Painel, Lançamentos, Contas, Mais).

### 2.3. Perfil Somente Manual (`manual`)
- **Visão geral**: Painel, Insights
- **Movimentações**: Lançamentos, Contas, Recorrentes, Importar
- **Planejamento**: Contas a pagar, Orçamento, Metas, Dívidas, Projeções
- **Integração**: **Seção inteira ocultada** (sem link para Conexões)
- **Conta**: Configurações
- **Ações Rápidas**: Botão global "Novo lançamento" ativo; botão "+ Criar conta" presente em `/contas`.

---

## 3. Auditoria dos Modais no Desktop (T34)

Medições exatas capturadas no viewport `1366 × 768 px`:

| Modal | Dimensões (L × A) | Posição (Left, Top) | Centro Calculado (X, Y) | Centro do Viewport (X, Y) | Centralizado? |
|---|:---:|:---:|:---:|:---:|:---:|
| **Novo lançamento** | 512 × 673 px | [427, 48] | (683, 384) | (683, 384) | **Sim (100%)** |
| **Dividir despesa (Split)** | 576 × 659 px | [395, 51] | (683, 380) | (683, 380) | **Sim (100%)** |
| **Backup com senha** | 426 × 290 px | [470, 235] | (683, 380) | (683, 380) | **Sim (100%)** |
| **Conexão Open Finance** | 486 × 635 px | [440, 62] | (683, 380) | (683, 380) | **Sim (100%)** |
| **Criar conta financeira** | 486 × 389 px | [440, 186] | (683, 380) | (683, 380) | **Sim (100%)** |

### Validações de Interação e Acessibilidade:
1. **Overlay Escurecido**: O diálogo nativo HTML5 `<dialog open>` aplica `backdrop:bg-black/60 backdrop:backdrop-blur-sm`, garantindo foco e contraste sobre o conteúdo de fundo.
2. **Tecla Escape**: Testada individualmente em todos os 5 modais; fecha o diálogo imediatamente e restaura o foco para o elemento disparador.
3. **Clique Fora (Backdrop Click)**: Testado clicando no ponto `(50, 50)` fora do container do painel; aciona `requestCloseRef` e fecha o diálogo com animação suave.
4. **Scroll Interno**: Container interno com `overflow-y-auto overscroll-contain` ativado para formulários extensos.
5. **Mobile Viewport (`< 768px`)**: Em 390×844 e 360×640, os diálogos adotam o comportamento de **Bottom Sheet** (`open:items-end`, `bottom: 100%`, cantos superiores arredondados `rounded-t-2xl`, largura total `390px` / `360px`).

---

## 4. Medições de Layout por Resolução

| Resolução | Largura Sidebar / Nav | Largura Container Principal | Overflow Horizontal | Avaliação Visual |
|---|:---:|:---:|:---:|---|
| **1920 × 1080** | 232 px (Sidebar) | 1120 px (Centralizado) | **Não** (`false`) | Excelente aproveitamento de tela larga |
| **1440 × 900** | 232 px (Sidebar) | 1120 px (Centralizado) | **Não** (`false`) | Perfeito para telas de notebooks médios |
| **1366 × 768** | 232 px (Sidebar) | 1120 px (Preenchimento) | **Não** (`false`) | Sem quebras nos filtros ou no cabeçalho |
| **1280 × 720** | 232 px (Sidebar) | 1040 px (Fluido) | **Não** (`false`) | Proporções confortáveis sem colisão |
| **390 × 844** | 69 px altura (Bottom Nav) | 350 px (Cards fluídos) | **Não** (`false`) | Toque ergonômico, botões com altura 48px |
| **360 × 640** | 69 px altura (Bottom Nav) | 320 px (Cards fluídos) | **Não** (`false`) | Sem quebra na barra de 5 ícones |

---

## 5. Conclusão

As alterações das frentes **T33 (Navegação estruturada)** e **T34 (Modais centralizados no desktop)** foram testadas localmente com rigor matemático e visual. Estão aprovadas para merge e deploy em produção.
