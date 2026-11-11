# T17b — correções e verificação

Base: `4723840`. Escopo: os 31 achados altos e 27 médios de
`docs/ajustes-finos.md`. Alterações de apresentação, sem mudar cálculos/actions.

## Cobertura dos achados

| Achados | Correção no componente de origem |
| --- | --- |
| 1.4, 1.7–1.8, 1.11, 1.15–1.16 | Pares de valor/data em uma coluna abaixo de 480px, `min-w-0`, alinhamento pelo topo; controles contidos. |
| 1.1, 1.25, 1.27, 1.29 | Hero do painel: métricas em três colunas compactas, padding e fonte fluida. As três últimas instâncias são o mesmo painel após redirecionamento. |
| 1.2, 1.18, 1.26, 1.28, 1.30 | Gráficos compactos: plot 144px em tela baixa, 160px no mobile alto, 288px a partir de md; cabeçalhos curtos no mobile. Legenda completa disponível ao leitor de tela e detalhes com valores. |
| 1.3, 1.5–1.6, 1.10, 1.14, 1.17, 1.19, 1.22 | Formulários secundários com expansão no mobile; desktop aberto. Controles continuam montados e preservam dados ao recolher. Formulário aberto pode naturalmente exceder 40% da altura, sem altura fixa ou scroll interno imposto. |
| 1.9 | Reserva: saldo/progresso visíveis, detalhes e aportes expansíveis no mobile. |
| 1.12 | Sugestão/cópia de limites expansível e orientação em details. |
| 1.13 | Limites como cartões por categoria no mobile, sem um cartão gigante envolvendo toda a coleção; lista completa preservada. |
| 1.20–1.21 | Nome, natureza e palavras-chave com quebra, sem colar os rótulos; texto completo disponível. |
| 1.23–1.24 | Onboarding separado visualmente em campos e blocos de estimativa sólidos no mobile; desktop mantém agrupamento. |
| 1.31, 2.25–2.27 | Resumo do orçamento com Money responsivo, linhas flexíveis e ancestrais `min-w-0`. |
| 2.1, 2.3–2.4, 2.8–2.10, 2.12–2.19, 2.21, 2.23 | Rótulo visual “Lançamentos”, `aria-label`/title “Lançamentos”; alvo de 48px e rótulo contido. |
| 2.2, 2.20, 2.22, 2.24 | EmptyState com padding móvel menor. As instâncias de login/cadastro/landing são o painel após redirecionamento. |
| 2.5 | Metadados de conta com elipse e title completo, nome com title; saldo em linha própria no mobile. `scrollWidth` de texto truncado não significa vazamento visível. |
| 2.6 | Contas como cartões por item no mobile, evitando um bloco único extenso. |
| 2.7 | Card/Header mais compactos e Money hero fluido. |
| 2.11 | EmptyState compacto e metas como cartões individuais no mobile. |

Além disso: títulos usam escala fluida existente; valores longos em metas,
dívidas e projeções quebram com segurança; botões têm texto contido e foco
explícito. Os dois achados baixos de título também se beneficiam da escala.

## Verificação por componentes reais

Página temporária local, removida antes do build final: shell/sidebar/bottom-nav,
hero copiado do painel, MonthlyFlowChart, BudgetList, AccountList,
OnboardingForm, EmergencyPanel, ImportWizard, ProjectionStudio e composers de
lançamento/recorrência/meta/dívida. Nenhuma action foi submetida.

Dados sintéticos: nome sem espaços com mais de 40 caracteres, oito categorias,
R$ 9.999.999,99 e projeções de bilhões. Produção local (`next start`) com CSP.

Matriz: 360×640, 390×844, 768×1024, 1280×720, 1366×768, 1440×900 e
1920×1080, nos temas claro e escuro. Não houve overflow horizontal da página
nem de textos visíveis sem truncamento deliberado.

| Medida | 360×640 | 390×844 | Desktop HD |
| --- | --- | --- | --- |
| Hero com valor extremo | 244px | 227px | 249px |
| Cartão do gráfico mensal | 246px | 262px | 500px (legenda desktop completa) |
| Área desenhada do gráfico | 144px | 160px | 288px |
| Linha de conta | 212px | 212px | 129px |

Em 360px: campos abertos de valor/data mediram 294×48px; nenhum botão visível
dos componentes testados ficou abaixo de 44px. Bottom-nav: links de 61×48px,
sem texto excedente (incluindo “Lançamentos”). Expansão dos formulários funcionou.
Console do portal sem erros/violações CSP observados.

Limite: janela do Maestri minimizada impediu captura de imagem; medição por DOM
e árvore de acessibilidade. Esta rodada exercitou componentes com dados
sintéticos, sem autenticação nem gravações. A vistoria deve confirmar os fluxos
logados com dados reais; os números acima não afirmam cobertura end-to-end.

Checks: `npx tsc --noEmit` e `npx vitest run` passaram em cada grupo. Suite
final: 32 arquivos, 275 testes. `npm run build` final passou sem a rota temporária.
Detector impeccable sem achados. Nenhuma dependência, migration, env ou action
de negócio foi alterada; sem push.
