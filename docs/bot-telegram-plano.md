# T26 — Bot Telegram do Mutano Contas

## Atualização T31 — aplicação das migrations

Em 10/11/2026, por autorização expressa do dono, foi adotada a premissa de que `DATABASE_URL`/`DIRECT_URL` do `.env` local apontam para produção (host mascarado `ep-g***eon.tech`); não foi alegada confirmação independente das credenciais secretas da Vercel. As migrations 0019–0022 foram revisadas como aditivas e aplicadas com `npm run db:migrate` antes do push. O journal passou de dezenove para 23 entradas e os quatro hashes/timestamps conferem com os arquivos locais. Foram verificadas seis tabelas Telegram, 28 colunas e `users.usage_profile` não nula com default `hibrido`; a conexão `DATABASE_URL` também enxerga o schema novo. Typecheck, lint e os 474 testes passaram. Nenhum webhook nem variável de ambiente foi configurado. As menções a migrations não aplicadas nas fases abaixo descrevem as entregas anteriores à T31.

## Decisão de arquitetura e escopo

BotFather cria o bot e entrega o token. Toda a lógica roda no próprio app Next na Vercel, sem serviço de bot separado. O webhook é `POST /api/telegram/webhook`, em runtime Node.js, e exige o header `X-Telegram-Bot-Api-Secret-Token`. Nenhum comando financeiro recebe `user_id` do texto ou do cliente: a identidade vem exclusivamente do vínculo persistido com o chat privado.

Os guias locais de Route Handlers e Server Actions em `node_modules/next/dist/docs/` foram consultados antes da implementação. Migration apenas escrita: **não aplicada**. Sem commit/push. As tabelas precisam existir antes de ativar a integração em produção.

## B1 — Esquema, vínculo e comandos (implementado)

- [x] `telegram_link_codes`: um código pendente por usuário, SHA-256 do código e expiração em dez minutos. Código original gerado com 32 bytes criptográficos, compatível com deep link Telegram; não persiste em texto puro.
- [x] `telegram_links`: um chat por usuário e um usuário por chat, com constraints únicas e exclusão em cascata ao excluir o usuário.
- [x] `telegram_chat_state`: estado compartilhado no Postgres para taxa e replay; não depende da memória de uma instância Vercel.
- [x] Migration `drizzle/0019_telegram_b1.sql`, snapshot e journal gerados offline, sem `migrate`/`push`.
- [x] Configurações: usuário autenticado gera `https://t.me/<bot>?start=<codigo>`. O nome do bot é consultado por `getMe`, com timeout; não exige uma quinta variável de ambiente. Gerar outro link invalida o anterior.
- [x] Desconectar na mesma tela remove vínculo e código pendente. Gerar e desconectar serializam pelo usuário. Não há substituição silenciosa de vínculos; para trocar conta/chat é preciso desconectar primeiro.
- [x] `/start <codigo>` consome o código com `DELETE ... RETURNING` e validade no próprio predicado SQL, dentro de transação; uso simultâneo não pode consumir o mesmo código duas vezes. Conflito de vínculo não reatribui outro usuário/chat e consome o código apresentado.
- [x] `/start` orienta sobre vínculo; `/ajuda` lista comandos; `/saldo` reutiliza `getBalances(userId)` do app, informa total parcial e saldos iniciais ausentes. Cartões não compõem o saldo disponível, conforme a regra existente do app.
- [x] Somente mensagens novas de texto em chat privado cujo remetente humano é o próprio chat. Grupos, canais, bots, mensagens editadas, anexos e eventos não suportados são ignorados.
- [x] Segredo comparado com `timingSafeEqual`; configuração ausente falha fechado. Máximo de 16 KiB do corpo real, incluindo stream sem `Content-Length`; máximo de 512 caracteres por mensagem; dez mensagens por minuto por chat, inclusive não vinculado. Excesso é ignorado com HTTP 200 para evitar tempestade de retries.
- [x] Estado de chat atualizado atomicamente com `ON CONFLICT ... WHERE`: IDs duplicados/anteriores não repetem comandos. Após sete dias de inatividade permite novo ID aleatório do Telegram.
- [x] Erros retornam mensagens genéricas sem logar token, código, chat, usuário, texto ou finanças. Respostas HTTP usam `Cache-Control: no-store`.
- [x] Testes de protocolo, webhook, actions autenticadas e persistência com mocks e inspeção do SQL compilado. Testes de concorrência em Postgres real e smoke de produção ficam para homologação após aplicação autorizada da migration.

### Entrega de respostas e limites conhecidos

A B1 responde usando o mecanismo oficial de resposta ao webhook (`method: sendMessage`, `protect_content: true`), sem chamada externa adicional a cada comando. O segredo protege a entrada; o token é usado para identificar o bot na emissão de link. O Telegram não devolve o resultado de execução de `sendMessage` nesse modo. Pode ocorrer perda de resposta se a conexão cair depois do commit: reenviar o mesmo update não reaplica o vínculo. O usuário pode enviar um novo `/saldo` ou gerar novo link. Uma outbox com envio/retry controlado é evolução para maior garantia de entrega.

O marcador por chat prioriza não repetir comandos: updates fora de ordem com ID menor são ignorados. Não suporta entrega de todas as mensagens fora de ordem; essa limitação precisa ser considerada antes de ampliar o bot. A tabela de estado não tem vínculo com `users`, pois também limita chats não vinculados; contém identificadores técnicos. Definir retenção e limpeza na B2, respeitando a janela de replay. A proteção atual de emissão de links usa o rate limiter existente em memória (cinco tentativas por quinze minutos por usuário); não constitui limite global entre instâncias. O limite de mensagens do webhook é distribuído no banco.

## B2 — Insights deterministas, Cron e preferências (implementado)

- [x] `GET /api/cron/insights`, somente leitura financeira e envio Telegram, protegido por `Authorization: Bearer <CRON_SECRET>` com comparação em tempo constante e falha fechada sem segredo. Responde somente contadores agregados; parâmetros de query não escolhem usuário, data ou horário.
- [x] `vercel.json` com três chamadas diárias, às 11h, 17h e 23h UTC: 08h, 14h e 20h em America/Sao_Paulo. Vercel usa UTC; confirmar capacidade do plano para três jobs antes de publicar. Configuração escrita, nenhum deploy efetuado.
- [x] `telegram_preferences`: opt-in desativado por padrão, seleção das janelas 08h/14h/20h e quatro tipos (resumo, gasto acima da média, contas a vencer, orçamento estourado). UI em Configurações e actions autenticadas com validação estrita, sem `user_id` do cliente.
- [x] `/resumo` consulta os dados de hoje sob demanda, mesmo com avisos desativados; `/pausar` persiste `enabled=false` para o dono vinculado. `/saldo` continua disponível. Desconectar também desativa avisos; reconectar não reativa automaticamente.
- [x] `telegram_deliveries`: índice único usuário/janela `AAAA-MM-DD:hora`, reserva atômica antes de qualquer envio e status `CLAIMED`, `SENT`, `FAILED` ou `CANCELLED`. Cron duplicado/concomitante não tenta novamente usuário/janela já reservado.
- [x] Lote paginado por usuário (cem por página), cinco destinatários concorrentes, falhas individuais isoladas. Limite de processamento de 240 segundos entre sublotes; rota com duração máxima de 300 segundos. Ao atingir o limite, retorna `remaining=true`: repetir a chamada autenticada **na mesma janela** processa somente os não reservados.
- [x] Revalida vínculo, chat, opt-in, janela e tipos imediatamente antes do envio. Timeout HTTP de cinco segundos, texto sem `parse_mode`, `protect_content=true`, erros genéricos sem logs sensíveis. Falha em atualizar o status não libera a reserva.
- [x] Migration `0020_telegram_insights_b2.sql` e metadados gerados offline; não aplicada, assim como a B1.
- [x] Testes com relógio fixo, escopo SQL por usuário, concorrência, paginação, preferências desativadas, pausa/desconexão, falhas e idempotência. Nenhuma chamada LLM na B2.

### Regras deterministas da B2

- **Manhã (08h):** resumo do dia civil anterior; **tarde (14h):** alerta de gasto por categoria hoje; **noite (20h):** fechamento parcial do dia atual. Contas a vencer e orçamento estourado podem aparecer em qualquer janela selecionada. Sem fatos e sem resumo habilitado, não envia.
- **Gasto acima da média:** gasto de hoje maior que 150% da média diária dos trinta dias civis anteriores e diferença mínima de R$ 10; exige pelo menos cinco despesas distribuídas em três dias históricos. Dias sem despesas entram como zero na média. Mostra a base de comparação, sem inferir previsão.
- **Contas a vencer:** contas ainda não pagas com vencimento hoje ou nos próximos três dias, incluindo virada de mês/ano; dia 31 é limitado ao último dia real do mês. Sem dia de vencimento não gera alerta. Valor exibido é o total da conta (inclusive conta em grupo), não a parte pessoal.
- **Orçamento estourado:** gasto registrado da categoria desde o início do mês até hoje maior que o limite configurado, inclusive limite zero. Não inclui lançamentos de dias futuros.
- **Dados:** valores em centavos; datas de lançamento usam o dia civil ancorado em UTC adotado pelo app, e a escolha do dia/janela usa São Paulo. Exclui transferências, pagamento de cartão e status externos diferentes de `POSTED`; mantém lançamentos manuais com status nulo e compras no cartão conforme os relatórios do app. Estornos seguem o `kind` registrado: entradas compõem entradas e não são subtraídas artificialmente do histórico de despesas.
- **Volume:** até três itens por tipo e mensagem limitada a 3.800 caracteres. Horários selecionáveis são janelas fixas, sem minuto exato ou timezone individual. Resumo semanal, fatura de cartão a vencer, orçamento em atenção (80%), outbox com retentativas e horários arbitrários ficam como evolução, fora do recorte B2 solicitado.

### Riscos e operação da B2

Entrega adota **no máximo uma tentativa por usuário/janela**. Timeout, falha após a reserva, 429/403 do Telegram ou interrupção da função podem perder o aviso; não há reenvio automático de resultado incerto. Isso evita duplicação, mas não equivale a entrega exatamente uma vez. Falha no lote inteiro não remove reservas já feitas. Registrar status não persiste texto financeiro, chat nem resposta do provedor.

A pausa/desconexão cancela entregas ainda não enviadas quando a revalidação percebe a mudança; um envio já em trânsito pode chegar depois. Um alerta de orçamento/conta pode reaparecer em outra janela selecionada no mesmo dia (máximo de três mensagens diárias), pois a idempotência é por janela, não por fato. Avaliar cooldown por fato em evolução.

Em base grande, monitorar `remaining` e falhas agregadas; usar fila/agendador antes de exceder a duração do cron. Cinco envios simultâneos não constituem um rate limiter global para limites de broadcast do Telegram: 429 encerra aquela tentativa sem retry. Definir retenção de `telegram_deliveries` e `telegram_chat_state` antes da expansão; não apagar reservas da janela atual. Sem migration autorizada, bot/segredos e homologação, não houve envio real nem validação na Vercel.

## B3 — Perguntas livres com IA (implementado, provedor configurável)

- [x] Google Gemini via REST/fetch, `gemini-3.8-flash`, e Anthropic Claude via REST/fetch, `claude-haiku-5-5`. Sem dependência nova. O ID estável do Gemini, function calling e Free Tier de entrada/saída foram confirmados em 10/11/2026 nas páginas oficiais de [modelo](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [preços](https://ai.google.dev/gemini-api/docs/pricing) e [API](https://ai.google.dev/api/generate-content). A camada gratuita tem quotas e condições; não equivale a uso ilimitado nem garante gratuidade de uma conta com billing.
- [x] `AI_PROVIDER=gemini|anthropic` escolhe explicitamente. Sem valor, prioriza Gemini se `GEMINI_API_KEY` estiver preenchida, depois Anthropic se `ANTHROPIC_API_KEY` existir. Sem nenhuma chave, IA desligada: perguntas livres recebem orientação amigável, sem consumir quota nem chamar provedor/banco de perfil. `/saldo`, `/resumo`, `/ajuda` e cron determinista continuam independentes da IA. Provedor explícito sem sua chave ou valor inválido também desliga IA; não há failover silencioso para outro provedor/custo/tratamento de dados.
- [x] Cinco ferramentas exclusivamente de leitura: saldo agregado, gastos por categoria/período, maiores despesas, comparativo de meses e contas a vencer. Identidade vem do vínculo, nunca do texto. Schemas estritos não aceitam `user_id`, SQL, URL ou instrução de escrita. Gemini usa `functionDeclarations`/`functionCall`/`functionResponse` nativos, com nomes/IDs associados e `thoughtSignature` preservada sem alteração no histórico transitório.
- [x] Mesmo núcleo de proteção nos dois provedores: prompt e dados não confiáveis, funções permitidas por lista fechada, validação por ferramenta, limite de duas perguntas por minuto e vinte por dia/chat no Postgres. Até três chamadas de modelo, quinhentos tokens por chamada, quatro tools, 2.500 bytes por resultado, 16 KiB de histórico da pergunta, 32 KiB de resposta HTTP, dezoito segundos de timeout e 1.800 caracteres finais. Sem memória longa e sem log financeiro.
- [x] Nenhuma ferramenta de escrita/navegação/envio. Sem descrição privada, notas, contas bancárias ou participantes nas saídas. Links, credenciais conhecidas e padrões de chaves são removidos; pergunta e dados mínimos vão somente ao provedor selecionado. Resposta financeira sem ferramenta bem-sucedida vira orientação determinista.
- [x] Integração de leitura com o perfil T27 (`integracao_total`, `hibrido`, `manual`), sem editar o perfil. `/ajuda` informa o uso do provedor configurado e o envio de dados mínimos. A chave privada habilita o provedor; não foi criada tela de consentimento nesta fase. Aprovar e comunicar a política de tratamento antes da ativação.
- [x] Testes com fetch mockado: chamadas nativas, preservação de assinatura, associação de resultados, provedor/default/desligado, quotas, identidade fixa, tentativa de escrita, prompt injection, tamanho, ciclos, timeout/429/bloqueio e segredo/links removidos. Sem chamada real, commit, push ou migration aplicada.

**Operação e riscos:** configurar `AI_PROVIDER`, `GEMINI_API_KEY` e/ou `ANTHROPIC_API_KEY` apenas no ambiente privado; nunca `NEXT_PUBLIC_`. O [Free Tier do Google](https://ai.google.dev/gemini-api/docs/pricing) declara uso de dados para melhorar produtos, diferentemente da camada paga; avaliar essa política para dados financeiros antes de habilitar. Limites locais de chat não substituem quotas/cotas de gasto da conta do provedor. Erro ou 429 retorna mensagem amigável e não muda de provedor. Modelos podem interpretar números incorretamente; conferir fatos no app. Thinking baixo do Gemini usa parte do limite de saída: uma resposta truncada é tratada como falha. Detalhes e migration 0022 de quota em `src/server/telegram/B3-notas.md`.

## Checklist do dono e ativação

- [ ] Criar o bot no BotFather e fornecer `TELEGRAM_BOT_TOKEN` diretamente nas variáveis privadas do ambiente Vercel; nunca no Git, conversa ou `.env.example`.
- [ ] Gerar segredo aleatório forte e configurar `TELEGRAM_WEBHOOK_SECRET`, usando o mesmo valor em `setWebhook.secret_token`. Não prefixar com `NEXT_PUBLIC_`.
- [ ] Definir domínio HTTPS de produção e ambiente de homologação separado, com bot/segredos próprios. Um bot tem um webhook ativo; não apontar o bot de produção para preview.
- [ ] Revisar e autorizar **separadamente** a aplicação de `0019_telegram_b1.sql` e `0020_telegram_insights_b2.sql`, nessa ordem, e só então aplicar pelo fluxo de migrations do projeto. Esta tarefa não aplica migration.
- [ ] Registrar webhook com URL `https://<dominio>/api/telegram/webhook`, `secret_token`, `allowed_updates: ["message"]` e `max_connections: 1` para reduzir reordenação. Fazer a operação fora de histórico de shell/logs que exponham token ou segredo. Não foi feita nesta tarefa.
- [ ] Consultar `getWebhookInfo` sem compartilhar token/resposta sensível; verificar pendências e erros. Cadastrar no BotFather comandos `start`, `ajuda`, `saldo`, `resumo`, `pausar`.
- [ ] Homologar usuário A e B: gerar/vincular, código expirado/usado, conflito de chat, consulta isolada de saldo, desconectar e confirmar que `/saldo` perde acesso; verificar limite e payloads rejeitados.
- [ ] B2: fornecer `CRON_SECRET` privado, aprovar janelas/tipos e capacidade do plano Vercel; testar cron com segredo incorreto/correto, execução duplicada e dois usuários isolados. Ativar opt-in em Configurações e confirmar que `/pausar` e desconectar impedem avisos seguintes. Nenhum Cron foi publicado nesta tarefa.
- [ ] B3: para ativar, fornecer `GEMINI_API_KEY` ou `ANTHROPIC_API_KEY` e, opcionalmente, definir `AI_PROVIDER=gemini|anthropic`; aprovar orçamento, quotas e tratamento de dados do provedor. Para operar sem IA, deixar ambas as chaves ausentes. Sem chamada LLM real nesta tarefa.

As variáveis constam sem valores reais em `.env.example`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `AI_PROVIDER`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`.

## Segurança: achados e riscos residuais

1. O rate limiter existente em `src/lib/rate-limit.ts` é local ao processo; reutilizá-lo para o webhook permitiria contornar o limite entre instâncias. O webhook novo usa estado atômico no Postgres. A emissão de links mantém a limitação local existente, declarada acima.
2. Link de `/start` é credencial bearer: quem o receber antes do dono poderá vincular o próprio chat. Mitigações: 256 bits, dez minutos, hash no banco, código único por usuário, uso único, aviso para não compartilhar, `no-referrer` no link e desconexão autenticada. Não há confirmação em dois canais na B1.
3. Reatribuir vínculo por upsert abriria risco de troca de dono/chat. A criação de vínculo usa `ON CONFLICT DO NOTHING`; só a sessão autenticada pode desconectar. Código não contém identificador do usuário.
4. Respostas financeiras chegam à infraestrutura do Telegram e ao dispositivo do dono; `protect_content` reduz encaminhamento, mas não impede captura de tela nem acesso ao dispositivo. Nenhum conteúdo financeiro é enviado para IA na B1.
5. Sem aplicação autorizada da migration e credenciais, não foi possível validar Telegram/Vercel/Postgres reais. Os testes locais usam doubles de banco; constraints e SQL foram inspecionados, mas não são prova de integração em produção.
6. A leitura de saldo dentro do processamento transacional precisa reutilizar a conexão reservada. Abrir consultas no pool global enquanto todas as conexões estão reservadas por webhooks pode paralisar o processamento. `getBalances` e `getTotalSavedCents` agora aceitam a conexão de leitura, mantendo o comportamento padrão para o restante do app; há teste que falha se alguma leitura escapar da conexão fornecida.

## Validação local

- Atualização Gemini: 139 testes específicos passando em dezessete arquivos (`src/server/telegram`, actions Telegram e regressão de preferências); `npm run lint` e `npm run typecheck` com exit 0. Fetch dos provedores mockado; sem chamada real, instalação de dependência, commit, push ou migration aplicada.

- `npx vitest run src/server/telegram src/server/actions/telegram.test.ts`: 35 testes passando em cinco arquivos; suíte específica da B1, sem acessar banco real.
- `npm run lint`: lint do projeto sem erros.
- `npm run typecheck`: TypeScript sem erros.
- Detector Impeccable nas duas superfícies alteradas: nenhum achado.
- B2: suíte específica ampliada para 69 testes em nove arquivos; lint e TypeScript sem erros. Detector também sem achados no painel de preferências. Sem teste visual autenticado em browser e sem integração Telegram/Postgres real.
- Não executados: build/verify completos, aplicação de migration, deploy, registro de webhook, commit e push. A suíte global fica com a revisão do Líder/Faxina, conforme o papel deste implementador.

## Referências

- [Telegram Bot API: setWebhook e resposta ao webhook](https://core.telegram.org/bots/api#setwebhook)
- [Telegram Bot Features: deep linking](https://core.telegram.org/bots/features#deep-linking)
- [Telegram Bot API: Update](https://core.telegram.org/bots/api#update)
- [Vercel Cron Jobs: configuração e UTC](https://vercel.com/docs/schedules/cron-jobs)
- [Vercel Cron Jobs: Bearer, concorrência e idempotência](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)

Nota sobre a revisão B1: a documentação oficial em [Available types](https://core.telegram.org/bots/api#available-types) garante inteiro assinado de 32 bits para campos `Integer` sem exceção expressa; `Update.update_id` não declara exceção. O alerta de overflow no relatório externo de B1 não foi confirmado contra esse contrato atual. IDs de chat/remetente, que têm exceção expressa, já usam número seguro na entrada e texto no banco.
