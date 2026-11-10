# T26 B3 — Perguntas livres com IA

## Atualização: Gemini e escolha de provedor

Agora `AI_PROVIDER=gemini|anthropic` seleciona o provedor; vazio prioriza `GEMINI_API_KEY`, depois `ANTHROPIC_API_KEY`, ou mantém IA desligada sem chaves. Escolha explícita sem sua chave/valor inválido falha fechado; sem fallback silencioso. Quotas e todas as validações são compartilhadas, independentemente do provedor. Comandos e cron por regra permanecem disponíveis sem chave. `.env.example` e `docs/bot-telegram-plano.md` documentam as duas novas variáveis vazias, política e riscos.

Gemini usa `gemini-3.8-flash`, ID estável/Free Tier confirmado na documentação oficial em 10/11/2026, com `generateContent`, chave somente no header `x-goog-api-key`, declarações JSON Schema e function calling nativo. Resultados usam ID/nome da chamada original e preservam `thoughtSignature` intacta no replay do modelo; nenhum pensamento é exibido. Esforço `LOW`, mesmo teto de quinhentos tokens, sem parâmetros de amostragem. Não há dependência nova nem chamada real à API.

O Free Tier do Google declara uso de dados para melhoria de produtos: o dono deve avaliar essa condição antes de habilitar dados financeiros. Camada gratuita tem quotas e pode mudar; uma conta com billing pode gerar custo. Respostas incorretas e timeout continuam possíveis. Ver [preços](https://ai.google.dev/gemini-api/docs/pricing), [modelo](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [referência de function calling](https://ai.google.dev/api/generate-content) e [migração 3.8](https://ai.google.dev/gemini-api/docs/latest-model).

Os detalhes abaixo descrevem a implementação original do Claude; os limites/políticas também valem para Gemini, com exceção dos campos do protocolo próprios de cada API.

Validação da atualização Gemini: 139 testes específicos passando em dezessete arquivos; lint e typecheck globais com exit 0. Fetch mockado nos dois provedores; sem chave real, dependência nova, alteração de schema/migration, aplicação de migration, commit ou push nesta atualização. Skill usada: maestri para o relatório ao Líder.

Implementado com `fetch`, sem instalar dependência: o SDK oficial não estava instalado. Endpoint fixo `https://api.anthropic.com/v1/messages`, modelo `claude-haiku-5-5`, API `2026-10-21`, esforço baixo e thinking desligado (configuração suportada pelo Haiku 5.5). Não envia parâmetros de amostragem, incompatíveis com esse modelo. Nenhuma chamada real com credencial foi feita nesta tarefa.

## Fronteiras

- Somente texto livre de até 512 caracteres em chat privado validado pelo webhook; comandos deterministas continuam independentes da IA.
- A transação do webhook resolve a identidade exclusivamente de `telegram_links.chat_id`, aplica o limite geral/replay e termina **antes** de chamar IA. Nenhum lock/conexão fica reservado aguardando Anthropic.
- `answerQuestion` fecha `userId` na função das ferramentas. Nem texto, nem inputs do modelo, nem nomes de ferramentas podem substituir a identidade. Inputs Zod estritos rejeitam chaves extras, inclusive `user_id`.
- Cinco ferramentas de leitura: saldo agregado; até cinco categorias com maior gasto; até cinco maiores despesas (somente data/categoria/valor); dois meses de entradas/despesas; até cinco contas a vencer. Não há SQL livre, URL, ferramenta de escrita, navegação, shell ou envio.
- Período inclusivo máximo de 93 dias, datas reais até hoje; comparação de meses com distância máxima de 24 meses, sem mês futuro; contas a vencer até sete dias. Datas seguem o dia civil do app em UTC e o dia atual em São Paulo.
- As consultas financeiras filtram o usuário em toda leitura; joins de categoria também exigem o dono. Excluem transferências, pagamento de cartão e pendências externas; centavos BRL, valores de contas em grupo identificados como totais.
- Sem descrição de transação, nota, conta bancária, participantes, e-mail, senha ou chaves em resultados. Nomes são limitados/sanitizados. Dados e texto do usuário são explicitamente não confiáveis no prompt.
- Respostas removem links, e-mails, endereços IP, padrões de chave e valores dos quatro segredos conhecidos; não usam `parse_mode`. Nenhum log de pergunta, dados financeiros, tool input/output, headers ou erro do provedor.
- Resposta financeira sem ao menos uma ferramenta válida bem-sucedida é substituída por orientação determinista, reduzindo invenção sem consulta.

## Limites e custo

- Quota persistente em `telegram_ai_usage`: duas perguntas por janela de sessenta segundos a partir da primeira pergunta e vinte por dia civil de São Paulo, por chat. `INSERT ... ON CONFLICT ... WHERE` aplica ambos os limites atomicamente. Limites contam tentativas, inclusive falhas após a reserva.
- Até três chamadas ao modelo por pergunta, quinhentos tokens de saída por chamada, quatro ferramentas no total. Última chamada não inicia novas ferramentas. IDs de tool-call repetidos são rejeitados.
- Até 2.500 bytes de JSON por resultado; dados maiores viram erro pequeno, sem truncar JSON inválido. Corpo de resposta Anthropic limitado pelo stream real a 32 KiB; histórico da pergunta limitado a 16 KiB. Texto final até 1.800 caracteres.
- Timeout de dezoito segundos para o ciclo do modelo/ferramentas; a aplicação retorna mensagem amigável também se um adapter de leitura não observar `AbortSignal`. Consulta SQL já iniciada pode continuar no pool até terminar; não gera nova chamada ao modelo depois do timeout.
- Sem memória longa ou persistência do conteúdo: somente a pergunta atual, tool-use/resultados e resposta transitória. Não reutiliza contexto de perguntas anteriores.
- Sem chave, quota indisponível, perfil inválido, API indisponível/429, resposta inválida ou limite de execução, retorna orientação amigável e preserva `/saldo` e `/resumo`.

## Integração T27

Leitura por `getUsageProfile(userId)` da T27. Não modifica `users.usageProfile`, políticas, helper de perfil ou `configuracoes/page.tsx`.

- `integracao_total`: não sugerir lançamentos/importação manual; planejamento continua disponível.
- `manual`: não sugerir Open Finance/conexão/sincronização.
- `hibrido`: ambas as fontes podem ser usadas pelo dono no app; bot continua só de leitura.

O perfil orienta as respostas, conforme o contrato da T27. Não apaga nem oculta histórico financeiro que o app ainda permite consultar. Instruções são constantes definidas no servidor, nunca texto arbitrário vindo do usuário.

## Banco e limites de escopo

Foi adicionada apenas a tabela `telegramAiUsage` ao schema. Após autorização explícita, `npx drizzle-kit generate --name=telegram_ai_usage` gerou `drizzle/0022_telegram_ai_usage.sql`, snapshot 0022 e registro no journal, depois da 0021 da T27. Comparação dos snapshots confirmou que a única tabela alterada/adicionada é `public.telegram_ai_usage`; a cadeia `prevId` aponta para o snapshot 0021 e os demais metadados permanecem iguais. O SQL contém somente criação dessa tabela e sua FK para `telegram_chat_state`. O SQL avulso `src/server/telegram/b3-schema.sql` foi removido por redundância. **Nenhuma migration foi aplicada**; a 0021 não foi alterada nesta tarefa.

## Riscos e homologação

1. Dados mínimos e pergunta são enviados à Anthropic quando o usuário usa perguntas livres; `/ajuda` informa esse tratamento. A B3 não cria tela de consentimento nem persiste conversas. O dono precisa aprovar o tratamento e comunicar a política do produto antes de ativar a chave.
2. LLM pode interpretar números/períodos incorretamente ou produzir orientação inadequada. As ferramentas continuam sem poder de escrita e com identidade fixa mesmo sob prompt injection. Conferir fatos no app; não usar como consultoria de investimento.
3. Sem memória longa, referência a "o mesmo período" exige perguntar novamente o período. Limites de top cinco devem ser entendidos como amostra/ranking, não como total de todos os dados.
4. Timeout não reverte custo já incorrido; pergunta/replay já admitido pelo webhook não é reexecutado após falha. Pode ser necessário enviar nova pergunta. Quotas não são reiniciadas por desconectar/reconectar o mesmo chat.
5. A quota de IA depende da aplicação autorizada da migration 0022 e a leitura de perfil depende da migration 0021 da T27. Sem essas tabelas/coluna, IA falha de modo amigável; não houve homologação real do banco ou provedor.
6. Há cotas por chat, sem teto global de custo da conta Anthropic. Configurar limite de gasto no provedor e retenção de contadores antes de ampliar uso.

Testes cobrem tool-use, identidade, validação estrita, SQL por dono, limites, prompt injection, tratamento de erro/timeout e ausência de logs/memória longa. Build/verify completos e suíte global permanecem com o Líder/Faxina. Sem commit/push/migration aplicada.

## Ajuste extra de preferências

Após a B3, foi atendido o ajuste solicitado em `telegram-preferences.tsx`: falha passiva no carregamento inicial vira estado neutro de indisponibilidade, com botão para tentar carregar. Erro de leitura só aparece após tentativa explícita do usuário. Falha real de gravação (retornada ou rejeitada) continua visível e jamais vira sucesso sem `ok` do servidor. Cinco testes de regressão cobrem essas transições. O ajuste não altera a página de Configurações nem o perfil da T27.

## Validação final

- `npx vitest run src/server/telegram src/server/actions/telegram.test.ts 'src/app/(app)/configuracoes/telegram-preferences.test.ts'`: 116 testes passando em quinze arquivos.
- `npm run typecheck`: exit 0, após correção pelos autores dos erros externos da T27/T28. Nenhum arquivo desses foi alterado por esta tarefa.
- `npm run lint`: sem erros; último ajuste do serviço também validado por lint específico.
- Detector Impeccable no painel alterado: nenhum achado. `git diff --check`: sem erros de whitespace.
- Sem build/verify completo, suíte global, instalação de dependência, commit, push, aplicação de migration ou chamada real à Anthropic/Telegram.
- Skills usadas: maestri para relatório ao Líder e impeccable para o ajuste extra da UI, preservando componentes/estilo existentes.

## Fontes oficiais consultadas

- [Haiku 5.5: modelo](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Migração: sem temperature/top_p/top_k](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide)
- [Messages API e tool-use](https://platform.claude.com/docs/en/api/messages/create)
- [Thinking: Haiku 5.5 aceita disabled em esforço baixo](https://platform.claude.com/docs/en/build-with-claude/thinking)
