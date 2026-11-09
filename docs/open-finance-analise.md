# Open Finance — análise e plano de implementação T1b

Data: 06/11/2026. Projeto: `C:/Projetos/financeiro_2`.

## Escopo desta entrega

Somente fase 1, conforme ajuste do Maestro: análise e plano para Codex Dev. Nenhum código funcional, schema, migration, configuração ou dependência foi alterado. Nenhum banco foi consultado ou migrado. Verify/tsc/vitest ficam para Codex Reserva após a implementação. Este documento não declara os itens 2–6 implementados.

Condição de término ajustada: documento com diagnóstico dos módulos, riscos, decisões pendentes e passos verificáveis entregue ao Claude Code por `maestri ask`.

## Resultado principal

A integração cabe como evolução do app, mas não basta inserir lançamentos na rotina CSV/OFX existente. É necessário separar **fonte do saldo**, **origem do lançamento**, **identidade externa** e **fatura bancária**. Reaproveitar autenticação, contas, centavos, categorias, relatórios e fluxos manuais; criar uma ingestão própria, autenticada e idempotente.

O schema real está em Next.js 16 (`package.json`: `^16.3.4`), não Next.js 15 como diz a pesquisa. Foram lidos os guias locais `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md` e `01-app/02-guides/server-actions.md`: action é uma entrada POST acessível independentemente da tela; autenticar, autorizar, validar e retornar somente DTO seguro em cada chamada. O Dev deve reler esses guias e os pertinentes a qualquer API nova antes de escrever código.

`graphify-out/graph.json` não existe; a análise abaixo deriva de inspeção direta dos arquivos e relações. Não foi instalado ou gerado grafo.

## Diagnóstico por módulo

| Módulo / arquivos | Comportamento observado | O que trocar, refazer ou preservar |
| --- | --- | --- |
| `src/db/schema.ts`, `src/lib/account-schema.ts`, `src/server/actions/settings.ts` | Conta e cartão compartilham `accounts`; tipo `CREDIT_CARD`, fechamento/vencimento opcionais. Não há modo, vínculo Pluggy, saldo observado ou limite. Arquivar preserva dados; exclusão definitiva tem cascatas. | Acrescentar modo por conta/cartão com default manual; vínculo externo explícito, snapshots de saldo/limites e datas. Impedir alteração de tipo incompatível com vínculo ativo. Conta arquivada não deve sincronizar. Reavaliar cascatas sem mudar o fluxo manual. |
| `src/lib/balances.ts`, `src/server/queries.ts:getBalances`, `src/app/(app)/contas/{page,account-list}.tsx` | Saldo = inicial + entradas − saídas posteriores à data inicial. Transferências entram nessa soma. Cartões são excluídos. UI orienta corrigir saldo inicial. | Para integração, selecionar snapshot bancário como saldo atual e mostrar data/fonte; nunca somar novamente o histórico ao snapshot. Preservar cálculo manual. Sem snapshot válido, informar indisponível/desatualizado; não inventar zero bancário. Ajustar `needsOpeningBalance` e textos apenas para contas manuais. |
| `transactions`, `src/server/actions/transactions.ts`, `src/lib/installments.ts`, `src/server/installments.ts` | `amountCents` absoluto, `kind` define sinal. Existem parcelas, `invoiceRef`, fingerprint e grupos de transferência. Edição/exclusão hoje não conhecem origem Pluggy. | Adicionar origem e ID externo; ingestão só insere/atualiza linhas da mesma origem e identidade. Nunca atualizar linha manual por semelhança. Proteger campos bancários na edição de importados, preservando categoria/notas/splits do usuário. Definir exclusão de importados para evitar reaparecimento inesperado no próximo sync. Não expandir parcelas já retornadas individualmente pela API. |
| `src/server/actions/import.ts`, `src/lib/parsers/*`, `import_batches` | CSV/OFX têm prévia, fingerprint único por usuário e substituição de período (default true). Cartão substitui por lotes da mesma fatura; conta comum apaga linhas com `importBatchId` no período. | Não chamar `commitImport` no sync. Se houver lotes Pluggy, restringir substituição/exclusão CSV/OFX por origem para não apagar sync. Preferir pipeline próprio sem lote CSV. Fingerprint não substitui ID remoto. Proteger também preview/commit no servidor conforme modo definido. |
| `src/lib/invoices.ts`, `src/lib/import-dates.ts`, `transactions.invoiceRef` | Referência de fatura é mês do **vencimento** (`YYYY-MM`), não da compra. Ciclo é inferido por fechamento/vencimento ou lote. Não há entidade persistida de fatura bancária no schema. | Criar armazenamento específico de fatura de cartão, identificada externamente. Usar billId remoto e dueDate para referência; fallback inferido deve ser marcado como provisório. Guardar total bancário separadamente da soma local. Não assumir que o banco devolve todas as faturas abertas ou todas as compras. |
| `src/lib/transfers.ts`, `src/server/actions/transactions.ts:createTransfer/updateTransfer`, `src/server/queries.ts` | Transferência manual cria duas pernas com grupo e índice único grupo/kind. `isTransfer` exclui totais; saldos continuam considerando movimentos. | Não gerar uma segunda perna sintética ao importar um movimento que já vem de cada conta. Dedupe por identidade externa de cada perna; classificação não deve unir transações distintas só por data/valor. Política para pagamento de fatura precisa respeitar cash/accrual (abaixo). |
| `src/server/queries.ts:getMonthSummary/getMonthlySeries/getCategoryBreakdown`, painel/orçamento/insights/projeções | Há `cardMode: cash` no resumo do painel, excluindo compras de cartão; accrual em cálculos de orçamento/custo. Ambos filtram `isTransfer=false`. | Preservar os dois regimes. Classificar pagamento de fatura sem remover indevidamente a saída bancária do painel cash nem duplicar custo no accrual. Decisão de produto necessária; não aplicar a todos os pagamentos a mesma heurística genérica de transferência. |
| `src/server/actions/goals.ts`, `goal-recurring.ts`, `goals`, `goal_contributions` | Aportes atualizam saldo da meta/histórico com lock. Não vinculam movimento a uma conta. `netWorth` soma disponível + metas − dívidas. | Não gerar aportes a partir do extrato automaticamente. Risco de contar duas vezes dinheiro de uma meta que já está no saldo bancário. Manter comportamento atual nesta entrega e explicitar limitação; eventual conciliação conta/meta exige decisão separada. |
| `src/server/actions/bills.ts`, `src/lib/bills.ts`, `contas-a-pagar/*` | `bills`/regras/participantes são organização de contas a pagar, explicitamente fora de lançamentos e relatórios por decisão do dono. | **Não** usar `bills` para as faturas Pluggy, apesar do nome do endpoint. Não criar/desmarcar pagamentos ou participantes com base em extrato. Nova fatura de cartão precisa de entidade própria. |
| `src/server/actions/debts.ts`, `src/lib/debts.ts` | Saldo de dívida e pagamentos são registros próprios do usuário. | Limite de crédito e total da fatura não são nova dívida automaticamente. Preservar sem alimentar pagamentos/saldo de dívida via sync. |
| `recurring.ts`, recorrências e onboarding | Recorrências geram lançamentos normais com ação explícita. | Em conta integrada, geração manual/recorrente pode duplicar lançamentos bancários. Aplicar política de modo também no backend dessas entradas; nunca apagar histórico/recorrências ao trocar modo. |
| `src/lib/auth.ts`, actions e rotas de exportação | Auth.js JWT e `requireUserId()`; exemplos inspecionados filtram propriedade por userId. Queries recebem userId e dependem de chamador confiável. Não há papel global de administrador/dono. | Dono é o usuário autenticado proprietário da conexão/conta. Jamais aceitar userId do cliente como autoridade. Verificar conexão, conta, categoria e item nas actions, inclusive acesso direto e mudança de vínculo. Não confundir posse de itemId com autorização local. |
| `src/app/(app)/configuracoes/*`, `src/components/sidebar.tsx` | Configurações reúne perfil, contas/cartões, categorias e backup; não existe integração. | Criar entrada “Integração”, formulário write-only e lista de vínculos/status. Ajustar contas/cartões para escolher manual/automático e conta externa explicitamente. Nunca enviar segredo salvo em props. |
| `src/app/api/exportar/backup/route.ts`, `src/lib/backup.ts`, exportações | Backup busca registros e transforma para contrato próprio; schema novo pode atravessar selects amplos se houver propagação automática. | Whitelist explícita de dados financeiros. Não exportar credenciais, ciphertext, IV/tag ou apiKey; excluir conexões secretas inclusive de futuros backups/logs. Registrar política para IDs externos sem alterar formato de backup por acidente. |

## Inconsistências da pesquisa e contratos a confirmar

1. A instrução atual prevalece sobre a seção 6.1 da pesquisa: clientId/clientSecret/itemIds são digitados na UI e persistidos criptografados; somente `APP_ENCRYPTION_KEY` fica no ambiente do servidor. Não adicionar credenciais Pluggy ao `.env.example` como alternativa concorrente.
2. Autenticação usa `POST https://api.pluggy.ai/auth` e header `X-API-KEY` nas leituras. ApiKey é temporária e não deve ser retornada ao navegador. Ver [autenticação oficial](https://v2.docs.pluggy.ai/en/reference/authentication) e [quickstart](https://v2.docs.pluggy.ai/en/docs/quickstart).
3. Faturas/metadata podem chegar depois das transações; `billId`/`billForecastDate` ajudam a associar compras. Não tratar ausência de fatura como saldo zero ou conta paga. Ver [transação](https://v2.docs.pluggy.ai/en/reference/transaction/transactions-retrieve) e [limitações de cobertura](https://v1.docs.pluggy.ai/docs/considerations-faq).
4. IDs de transação mudam ao reconectar um item: externalId resolve repetição no mesmo vínculo, não reconciliação universal entre itens. Ver [transações oficiais](https://v2.docs.pluggy.ai/en/docs/products/transactions).
5. Tratar status e detalhes reais do item, sem presumir que `CONSENT_EXPIRED` seja sempre o status principal. Distinguir `LOGIN_ERROR`, `WAITING_USER_INPUT`, `OUTDATED`, `UPDATING` e sucesso parcial, utilizando também validade/código de erro. Ver [ciclo de vida](https://v2.docs.pluggy.ai/en/docs/connections/item-lifecycle) e [erros](https://v2.docs.pluggy.ai/en/docs/connections/errors-validations).
6. Não depender de promessa de disponibilidade, preço ou consentimento fixo de 12 meses: essas afirmações da pesquisa não são contrato de implementação. Usar metadados reais. Confirmar paginação, sinal de transações CREDIT, campos de limite e payload de bills na referência vigente antes de implementar; contas bancárias e cartão não devem compartilhar uma regra de sinal presumida.

## Decisões para o Maestro (propostas, não decisões arquiteturais tomadas)

| Tema | Proposta de menor escopo | Impacto / pergunta que o Maestro precisa resolver |
| --- | --- | --- |
| Modo por conta | `manual` default; `integracao` exige vínculo válido. Histórico manual fica preservado. Bloquear novas entradas manuais/CSV/recorrentes nessa conta enquanto integrada; outras contas seguem normais. | O dono quer aceitar ajustes manuais em conta integrada? Se sim, definir se entram só em relatórios ou também em saldo projetado; nunca somar ao snapshot atual. |
| Troca de modo | Não deletar histórico nem sobrescrever saldo inicial. Volta ao manual precisa oferecer referência de conciliação explícita. | Evitar salto de saldo ao reutilizar saldo inicial antigo depois de meses importados. |
| Fonte do saldo | Snapshot bancário em campos separados; extrato alimenta relatórios. Sem snapshot, UI indica falta de sincronização. | Aprovar tratamento do consolidado quando uma conta ainda não tem snapshot: indicar total incompleto em vez de apresentar zero como válido. |
| Mutabilidade/exclusão de importado | Valor/data/conta/identidade protegidos; notas/categoria/split preservados no resync. Não permitir apagar linha importada neste primeiro passo, ou persistir tombstone se o dono exigir exclusão. | Sem regra, apagar permite que a linha reapareça e edição pode ser desfeita silenciosamente. |
| Pendentes | Persistir status remoto; pendente não deve ser tratado como caixa liquidado. Atualizar mesma linha quando POSTED. | Cartões abertos podem conter PENDING: aprovar exibição provisória na fatura e exclusão dos totais liquidados. |
| Pagamento de cartão | Reconciliar política cash/accrual antes da ingestão; testar exemplos com compra e pagamento em meses distintos. | Hoje marcar `isTransfer` remove dos dois regimes. Pode exigir ajuste nas queries/classificação; não decidir via regex ou assumir que o comportamento existente já resolve. |
| Histórico anterior / reconexão | Vínculo explícito; alertar possível sobreposição com CSV/manual, sem dedupe destrutivo por valor/data. | Definir data inicial de importação ou revisão manual para evitar totais duplicados; dados diferentes podem ter mesmo valor/data. |
| Atualização bancária | Primeiro botão lê dados disponíveis na Pluggy. Não criar cron/widget/webhook. | “Sincronizar agora” significa coletar dados disponíveis, ou também solicitar refresh do item? Se refresh for exigido, status assíncrono e limites precisam entrar no plano. |

As decisões acima devem voltar ao Claude Code antes da etapa dependente. Não ampliar para novo regime contábil, vínculo meta/conta, cron ou widget sem instrução.

## Modelo proposto para o Dev detalhar após alinhamento

- `accounts`: modo (`manual|integracao`), identidade externa/vínculo com conexão, moeda, snapshot de saldo e data, limite total/disponível (cartão) e data. Campos novos opcionais; modo manual como default. Separar identidade de item, conta, transação e fatura.
- Credencial por usuário: clientId/clientSecret criptografados, timestamps e versão do envelope. Pode ser entidade própria para evitar repetir segredo por item; a escolha final cabe ao Maestro. Não misturar segredos na tabela accounts usada em props.
- `open_finance_connections`: userId, credencial de propriedade do mesmo usuário, itemId criptografado se tratado como dado de acesso da UI, status saneado, última tentativa, último sync bem-sucedido, detalhe de erro controlado/consentExpiresAt quando disponível. Se itemId for cifrado com IV aleatório, unicidade exige identificador de busca protegido (HMAC) ou outra modelagem aprovada, não índice no ciphertext. ItemId não substitui credenciais de autenticação, mas deve ser mascarado na UI.
- Vínculo remoto/local: uma conta externa só pode estar vinculada uma vez no escopo escolhido; checar userId em todos os joins. Índice único deve preservar isolamento por usuário/provedor/conta externa, sem colisões com CSV/OFX.
- `transactions`: origem explícita (`MANUAL`, `CSV`, `OFX`, `PLUGGY`, ou enum equivalente aprovado), externalId nullable, status e identidade de fatura externa quando aplicável. Índice único no escopo remoto documentado (por exemplo userId + provider + accountId + externalId), preservando múltiplos NULL para manuais. Backfill origem a partir dos lotes existentes; não classificar tudo como manual se veio de CSV/OFX.
- `credit_card_invoices` (nome proposto): userId, accountId, externalId remoto, referência YYYY-MM do vencimento, dueDate, totalAmountCents, demais valores opcionais/status realmente disponíveis, syncedAt. Índice único de identidade externa. Não usar somente mês como identidade: um cartão pode ter ajustes/faturas distintas no mesmo mês.
- Não alterar silenciosamente os limites integer do app: validar todo valor contra `MAX_CENTS` (2 bilhões de centavos), inclusive saldo negativo, limites, fatura e somas relevantes. Valor ausente é null, não zero fabricado. Aceitar inicialmente BRL; moeda diferente precisa mensagem explícita, não conversão cambial implícita.

## Segurança: achados e requisitos de implementação

**Achados verificados por leitura:** `.gitignore` ignora `.env*` e abre exceção para `.env.example`; `git ls-files '.env*'` retornou somente `.env.example`. Não foram lidos arquivos de segredos nem executada auditoria do histórico completo. Há Zod, crypto nativo do Node, fetch e Vitest disponíveis, portanto não há necessidade demonstrada de instalar pacotes. Auth.js já oferece helper de sessão; novas actions precisam repetir checagens. O backup e selects amplos são pontos de revisão obrigatória. Não há implementação Pluggy existente para declarar segura ou vulnerável.

**Contrato criptográfico:** AES-256-GCM com chave aleatória de 32 bytes em `APP_ENCRYPTION_KEY` (definir representação única: base64 validado), IV novo aleatório de 12 bytes por gravação e tag de autenticação. Envelope versionado; AAD vinculando userId/tipo de segredo para impedir troca entre registros. Falhar fechado em chave ausente/malformada, ciphertext adulterado ou chave errada. Não gerar chave automaticamente a cada boot. Chave fora do banco/backup/git, preservada no ambiente do deploy; documentar recuperação e rotação (recriptografar com versão), sem expor seu conteúdo.

**Entrada e saída:** Zod com limites de tamanho, UUID/IDs compatíveis com API, dedupe/limite de itemIds e validação dos payloads remotos (valores finitos, enums, datas, moeda). Campo vazio de secret em edição significa manter, não apagar sem intenção explícita. Formulário necessariamente contém temporariamente o texto digitado no navegador; “nunca no cliente” significa nunca devolver segredo persistido/apiKey/chave de ambiente nem colocá-los em bundles, HTML, props, localStorage ou analytics. Limpar inputs após sucesso. Só indicadores mascarados/booleanos retornam do servidor; erros não repetem valores ou corpo da API.

**Rede:** origem HTTPS fixa `https://api.pluggy.ai`; construir paths conhecidos e query com URLSearchParams, IDs validados/segmentos codificados. Nunca aceitar URL/baseURL do cliente nem seguir links de paginação sem validação; preferir cursor/token em endpoint fixo. Bloquear redirect em fetch; timeout e limites de páginas/tamanho, retries limitados para 429/5xx. `cache: no-store` e nenhum cache global compartilhado entre usuários. Não chamar rede dentro de transação longa.

**Autorização/concorrência:** sessão antes de descriptografar ou acessar rede; filtros por dono em leitura e escrita. Verificar conta/conexão/vínculo da sessão e conta remota pertencente ao item; não confiar em ID selecionado pelo navegador. Bloquear sync concorrente por conexão com mecanismo no banco e recuperação após falha; desabilitar botão é apenas UX. Revalidar modo/vínculo antes da escrita para não sincronizar depois de uma troca para manual. Índice único continua sendo defesa final para dedupe.

**Erros:** 401 de apiKey pode renovar uma vez; credencial inválida no /auth exige revisão das credenciais, não renovação de consentimento. Consentimento revogado/expirado orienta reconectar no Meu Pluggy. MFA/UPDATING/indisponibilidade/sucesso parcial têm mensagens distintas. Não persistir erro bruto, headers, payload ou exceção SQL com parâmetros criptográficos; logs só códigos controlados e contagens. Último sync bem-sucedido não deve avançar se houve falha/parcial não concluída.

## Plano sequencial para Codex Dev

Não iniciar implementação nesta fase. Ao ser acionado, usar `/goal` com condição: itens 2–6 implementados, migration somente gerada e revisada, Codex Reserva confirma verify/tsc/vitest verdes e retorno ao Claude Code. Não instalar dependências, aplicar migration, commitar ou dar push. Não tocar trabalho alheio no diretório compartilhado.

### Passo 1 — fechar decisões e contratos

Arquivos de leitura: este documento, `docs/open-finance-pesquisa.md`, schema, actions/queries indicadas e documentação local Next. Confirmar contratos oficiais Pluggy de contas, transações, bills, item e paginação; construir fixtures sintéticas sem dados pessoais. Resolver com Maestro as decisões de modo, pendentes, pagamentos, exclusão e corte de histórico.

Pronto quando: decisões registradas neste documento ou adendo, DTOs e mapeamento BANK/CREDIT documentados; nenhum endpoint ou sinal presumido sem confirmação.

### Passo 2 — schema e SQL, sem banco

Arquivos-alvo: `src/db/schema.ts`, `drizzle/<nova_migration>.sql`, `drizzle/meta/*` estritamente gerados, tipos afetados. Criar campos/tabelas/índices e backfill de origem compatível. Gerar com `npm run db:generate`; revisar SQL para defaults, nulabilidade, FKs, unicidade, preservação de dados e ausência de DROP destrutivo não previsto. Não executar `db:migrate`, `db:push`, seed ou SQL.

Pronto quando: SQL e metadados coerentes entregues ao Claude Code com caminho e SQL integral para o dono autorizar depois. Esta autorização **não** é implícita na tarefa. Deploy que usa novas colunas depende dessa aplicação posterior; avisar essa dependência sem aplicar.

### Passo 3 — segredo e cliente Pluggy server-side

Arquivos-alvo propostos: `src/server/open-finance/crypto.ts`, `client.ts`, `schemas.ts`; `.env.example` apenas nome `APP_ENCRYPTION_KEY=` com instrução de formato, sem chave real. Usar crypto/fetch/Zod existentes e barreira server-only compatível com dependências locais (não instalar pacote por suposição). Implementar autenticação, DTOs validados, timeout/paginação/retry e mascaramento.

Pronto quando: testes cobrem round-trip/tamper/chave inválida e transporte mockado; segredo/apiKey nunca retornam ao cliente. Nenhum `NEXT_PUBLIC_` ou URL fornecida pelo usuário.

### Passo 4 — persistência e sync autenticados

Arquivos-alvo propostos: `src/server/actions/open-finance.ts`, `src/server/open-finance/sync.ts`, queries específicas; testes adjacentes. Actions para salvar credencial/itemIds, descobrir contas externas, vincular conta própria, trocar modo e sincronizar. Arquivos `use server` exportam somente funções async e tipos.

Fluxo: validar sessão/entrada/propriedade → autenticar no provedor → ler item/contas → percorrer transações/faturas paginadas em endpoints fixos → converter/validar centavos e referências → transação curta de upsert restrito à origem remota → status e timestamps → revalidar telas afetadas. Permitir sincronizar itens independentes sem marcar tudo como sucesso quando um falha; status por item. Sem criar contas automaticamente sem escolha do dono. Não sobrescrever manual, categorização/notas/splits nem excluir histórico que não apareceu numa página.

Pronto quando: duas sincronizações mantêm quantidade/IDs estáveis; pending→posted e associação tardia de billId atualizam mesma linha; concorrência e mudança de modo não quebram isolamento; falha preserva último snapshot válido e data de sucesso.

### Passo 5 — adaptar consultas e mutações existentes

Arquivos-alvo: `src/server/queries.ts`, `src/lib/balances.ts` se necessário, `src/lib/account-schema.ts`, `src/server/actions/{settings,transactions,recurring,import}.ts`, `src/lib/invoices.ts`/`import-dates.ts` somente se necessário. Rever `installments.ts`, `splits.ts` e exportações conforme política adotada. Concentrar regra de modo em helper reutilizável; validar no servidor em todas as entradas afetadas.

Pronto quando: conta manual mantém exatamente o cálculo/fluxo atual; integrada mostra snapshot sem dupla soma; CSV não apaga Pluggy; edição não desloca externalId para outra conta; relatórios respeitam status e cash/accrual; contas a pagar/metas/dívidas não recebem efeitos automáticos inesperados.

### Passo 6 — UI de integração e fonte por conta

Arquivos-alvo: `src/app/(app)/configuracoes/page.tsx`, nova subpágina `configuracoes/integracao/page.tsx` e formulário/painel próprio; `configuracoes/accounts-panel.tsx`, `contas/{page,account-list}.tsx`; listagem/composer/importação apenas para indicar/proteger origem conforme decisão. Reutilizar componentes e padrão visual atuais.

Fluxo do dono: Configurações → Integração → colar clientId/clientSecret e itemId(s) → salvar → carregar contas externas → escolher conta/cartão local e vínculo → selecionar “Automático via integração” → “Sincronizar agora”. Modo “Alimentar manual” permanece por conta, inclusive coexistindo com outras integradas. Mostrar máscara, status, última tentativa/sucesso e limitações de dados. Botão com loading e erro claro; não exibir stack/payload.

Pronto quando: cadastro/edição sem revelar segredo salvo; nenhuma troca apaga histórico; contas/cartões distinguem saldo, limite, fatura e referência provisória; teclado/labels/estados vazios e erro funcionam.

### Passo 7 — testes e revisão de segurança

Arquivos-alvo propostos: testes de crypto/cliente/sync, `src/lib/open-finance*.test.ts` ou junto dos módulos; ampliar testes existentes de saldo/importação/fatura apenas onde regra mudou. Seguir `vitest.config.mts`. Mock de fetch, auth e persistência; nenhuma rede Pluggy real ou credencial real nos testes.

Casos mínimos verificáveis:

1. Centavos: 0, positivo, negativo, 45.90, arredondamento decimal documentado (incluindo 1.005 e negativo), não finitos, null/ausente, overflow, BRL versus outra moeda. Valor absoluto/kind corretos para BANK e CREDIT conforme contrato.
2. Dedupe: mesmo ID duas vezes/páginas/runs/concorrência; IDs diferentes no mesmo valor/data; separação de contas/usuários/provedores; manual parecido nunca modificado. Reconexão tem alerta/política, sem alegar dedupe universal.
3. Modos: manual não produz chamada de rede nem escrita importada; saldo inicial manual preservado; snapshot integrado não soma extrato; troca durante sync impede gravação indevida; arquivo/recorrência respeitam política no servidor.
4. Fatura: dueDate determina YYYY-MM, compra em mês anterior, ausência de billId, billId tardio, estorno e parcela já individualizada; fatura ausente não vira zero. Exemplo de compra e pagamento testa cash/accrual.
5. Segurança: sem sessão, outro userId/conexão/conta/categoria, item alheio; URLs e redirects maliciosos; criptografia adulterada; retorno e logs sem segredo; backup sem material criptográfico. 401 renova no máximo uma vez, consentimento/MFA/429/timeout/página inválida preservam dados e status coerentes.

Pronto quando: diff revisado, nenhuma alteração fora de escopo ou segredo versionado, testes significativos adicionados sem rede real. Se faltar pacote ou decisão, perguntar ao Maestro; não instalar nem ampliar escopo.

### Passo 8 — Codex Reserva valida, sem editar

O Maestro aciona Codex Reserva após o Dev terminar: executar `npm run verify` e retornar saída/código. `scripts/verify.mjs` já roda checagem use-server, `npx vitest run`, `npx tsc --noEmit` e `npm run build`, parando na primeira falha; só declarar todos verdes se finalizar com sucesso. Não inclui eslint; `npm run lint` pode ser solicitado separadamente pelo Maestro.

Reserva não edita. Falhas voltam ao Dev; após correção repetir verificações afetadas e verify completo para fechamento. Build/checagens podem exigir ambiente de teste adequado, mas não autorizam aplicar migration no banco do dono. Não abrir nem imprimir segredos para diagnosticar.

Pronto quando: retorno ao Claude Code com arquivos tocados, caminho e SQL da migration **não aplicada**, verify/tsc/vitest/build e eventuais limitações, instruções exatas de configuração e roteiro manual. Se build depender de schema ainda não aplicado, relatar o bloqueio real em vez de migrar silenciosamente ou alegar verde.

## Onde o dono colocará os dados (contrato futuro, ainda sem tela implementada)

- Ambiente privado do servidor/deploy ou `.env.local` ignorado: `APP_ENCRYPTION_KEY`, chave base64 de 32 bytes. Não é senha de usuário, apiKey ou `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` do Next.
- Site, **Configurações → Integração**: clientId, clientSecret e itemId(s) obtidos pelo dono no ecossistema Meu Pluggy/Dashboard. Valores salvos cifrados no banco, sem nova gravação em arquivos versionados.
- Site, **Configurações → Contas e cartões** (ou vínculo na tela Integração): escolher para cada conta/cartão o modo manual/automático e a conta externa correspondente. ItemId sozinho não identifica qual das contas/cartões deve alimentar qual registro local.
- Antes de usar a versão implementada: dono revisa/autoriza SQL gerado; aplicação de migration é etapa posterior e separada. Esta fase 1 não gerou SQL.

## Verificação desta fase

Entrega limitada a este Markdown. Diagnóstico baseado em leitura de schema, queries, actions dos módulos indicados, telas de configurações/saldos/lançamentos/painel, autenticação, backup, scripts, gitignore, arquivos de configuração e referências oficiais citadas. Não é auditoria exaustiva de cada componente, do histórico git ou da infraestrutura. Nenhum teste de execução, chamada autenticada Pluggy ou banco foi realizado; validações executáveis pertencem à fase do Codex Reserva.

## Adendo T1b-2 — decisões do Maestro e implementação (06/11/2026)

Este adendo prevalece sobre as propostas anteriores e sobre trechos que diziam que os passos 2–7 não haviam sido iniciados.

### Decisões fechadas

1. Conta em modo `integracao` bloqueia novo lançamento manual, importação CSV/OFX e geração recorrente. Histórico manual permanece; recorrências já criadas não são apagadas. Outras contas continuam no fluxo manual normal.
2. Trocar modo nunca apaga transações nem altera saldo inicial. Salvar saldo inicial e alterar o tipo de uma conta integrada são recusados até ela voltar ao modo manual.
3. Saldo integrado usa snapshot bancário separado; não soma lançamentos sobre ele. Snapshot ausente conserva a conta como indisponível e marca o consolidado como total incompleto. O cálculo manual anterior fica preservado.
4. Transação Pluggy tem identidade, data, valor e conta protegidos no servidor; edição permite categoria/notas e os splits existentes. O resync atualiza a mesma identidade sem sobrescrever dados do usuário. Não há exclusão de transação Pluggy na v1.
5. `PENDING` persiste como status, aparece como “provisório · pendente” e fica fora de saldos e totais liquidados. A mudança para `POSTED` usa upsert pela identidade Pluggy.
6. Opção C: o registro de pagamento `CREDIT` do cartão não é importado. Compras de cartão continuam como despesa accrual. O débito importado da conta bancária continua lançamento normal para cash; o dono pode ligar manualmente `isCardPayment` nessa despesa bancária. O marcador permanece fora de transferências, é incluído em cash e excluído de accrual. Sem marcador, a UI só sugere “possível pagamento de fatura” quando uma compra de cartão e um débito importado têm valor exato e mês iguais; não altera a classificação.
7. A pessoa escolhe a data inicial na tela Integração; padrão é o dia 1 do mês atual. A tela avisa sobre possível sobreposição com lançamentos existentes e não faz deduplicação destrutiva.
8. “Sincronizar agora” lê as contas, transações e faturas já disponíveis; não pede refresh de item nem configura cron, webhook ou widget.

### Contratos Pluggy usados

O cliente usa `POST /auth`, `GET /items/{id}` (só leitura de status), `GET /accounts?itemId=...`, `GET /v2/transactions` com `dateFrom` e cursor, e `GET /bills` paginado por página, em `https://api.pluggy.ai` com `X-API-KEY`. `/transactions` sem `/v2` está documentado como deprecated até 31/12/2026. Transação documenta `DEBIT`/`CREDIT`, `POSTED`/`PENDING`, `accountId`, `currencyCode`, `operationType`, `billId` e `billForecastDate`; o contrato especifica débito como compra e crédito como pagamento em cartão, e `PAGAMENTO_FATURA` como tipo do pagamento, que não é importado. Conta documenta `BANK`/`CREDIT`, `balance`, `creditData.creditLimit` e `availableCreditLimit`. Fatura documenta `id`, `dueDate`, `totalAmount`, `totalAmountCurrencyCode` e `minimumPaymentAmount`. Referências: [transactions list v2](https://v2.docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor), [transactions retrieve](https://v2.docs.pluggy.ai/en/reference/transaction/transactions-retrieve), [transactions product/paginação](https://v2.docs.pluggy.ai/en/docs/products/transactions), [accounts retrieve](https://v2.docs.pluggy.ai/en/reference/account/accounts-retrieve), [bills list](https://v2.docs.pluggy.ai/en/reference/bill/bills-list), [item retrieve](https://v2.docs.pluggy.ai/en/reference/items/items-retrieve), [item lifecycle](https://v2.docs.pluggy.ai/en/docs/connections/item-lifecycle), [authentication](https://v2.docs.pluggy.ai/en/reference/authentication).

### Estado dos passos

- Passo 1: decisões anteriores substituídas pelas oito definições deste adendo. Sinais/campos acima foram confrontados com documentação oficial Pluggy; valores são aceitos em BRL e convertidos para centavos.
- Passo 2: schema e migration únicos gerados em `src/db/schema.ts` e `drizzle/0016_needy_ultimo.sql`; journal/snapshot Drizzle atualizados. Consulta somente leitura a `drizzle.__drizzle_migrations` retornou zero registros para os timestamps de 0016/0017 antes da consolidação. A migration única não foi aplicada e faz backfill de origem CSV/OFX via `import_batches` sem apagar dados.
- Passo 3: `src/server/open-finance/{crypto,client,schemas}.ts`: AES-256-GCM versionado com AAD, HMAC para unicidade de item, cliente HTTPS fixo, sem redirect, timeout e paginação limitada. O env privado contém apenas `APP_ENCRYPTION_KEY` (base64 de 32 bytes); credenciais Pluggy e itemId são digitados na UI e guardados cifrados.
- Passo 4: `src/server/actions/open-finance.ts`: ações autenticadas, validação de propriedade e vínculo/tipo, descoberta de conta, lock de sincronização, coleta antes da transação curta, upsert de snapshot, transações e faturas. Segredo/API key não entra em retorno da action.
- Passo 5: actions de transação/importação/recorrência/settings bloqueiam novas entradas manuais em contas integradas; edit/delete protegem transações Pluggy; a flag manual `isCardPayment` mantém o débito no cash e o remove de accrual; saldos usam snapshot e totais excluem pendentes.
- Passo 6: `src/app/(app)/configuracoes/integracao/*` permite configurar credenciais/itemId, data inicial, modo e vínculo, ver estado/faturas, e sincronizar dados disponíveis. Contas mostra timestamp do snapshot e aviso de total incompleto.
- Passo 7: `src/server/open-finance/{schemas,client}.test.ts` cobrem valores/sinais, arredondamento, overflow, criptografia/tamper/AAD/chave inválida, exclusão do evento `PAGAMENTO_FATURA`, sugestão exata sem classificação automática, estados pendentes, compra/pagamento em meses distintos nos dois regimes e paginação HTTP mockada.

### Configuração exata do dono

1. Em ambiente privado do servidor ou `.env.local` ignorado pelo Git: `APP_ENCRYPTION_KEY`, base64 canônico de uma chave aleatória de 32 bytes. Não usar `AUTH_SECRET` nem `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
2. No site, **Configurações → Integração**: digitar `clientId`, `clientSecret`, `itemId` e, se quiser, nome da conexão. Na edição, segredo vazio mantém o valor salvo. Os valores Pluggy são cifrados no banco; nunca aparecem de volta na tela.
3. Na mesma tela: selecionar a data inicial de importação (padrão primeiro dia do mês local atual), carregar contas Pluggy e vincular cada conta/cartão local. Escolher modo manual remove o vínculo sem excluir histórico.
4. No banco, executar a migration única 0016 somente após revisão/aprovação do dono. Ela foi gerada e continua não aplicada.

### Limites desta entrega para revisão

Os testes Vitest direcionados foram executados; `npm run verify` é trabalho posterior de Codex Reserva. Nenhuma chamada real à Pluggy ou migration de banco foi executada, e dependências não foram instaladas. A sugestão por valor/mês é só uma pista visual solicitada pelo dono; nunca classifica automaticamente.
