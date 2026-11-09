@AGENTS.md

<!-- MAESTRO-RULES (copiado de C:\Projetos\CLAUDE.md via sync-regras.ps1; edite la e rode o script) -->
# Regras do maestro (este workspace)
O maestro deste projeto delega a agentes recrutados e segue as regras abaixo. Responda em portugues do Brasil. Nunca grave segredos em arquivos versionados.

## 1. Permissões ao criar terminal (obrigatório)
Todo `maestri recruit` DEVE levar `--command` com a flag de permissão total. Nunca recrutar sem ela.

| Agente | --preset | --command |
|---|---|---|
| Claude Sonnet 5.5 (maestro) | "Claude Code" | `claude --dangerously-skip-permissions --model sonnet` |
| Claude Haiku | "Claude Code" | `claude --dangerously-skip-permissions --model haiku` |
| Codex Plus (padrão) | "Codex" | `codex --dangerously-bypass-approvals-and-sandbox -m gpt-6.1-sol -c model_reasoning_effort=medium` |
| Codex Plus (econômico) | "Codex" | `codex --dangerously-bypass-approvals-and-sandbox -m gpt-6-luna -c model_reasoning_effort=medium` |
| Antigravity (Gemini 3.7) | "Antigravity" | `agy --dangerously-skip-permissions --model gemini-3.7-flash-medium` |
| OpenCode | "OpenCode" | `opencode --auto` |

Antigravity: NÃO usar 3.8 (gasta mais). Variantes: `gemini-3.7-flash-low` (tarefa trivial), `-high` (só se precisar).
Aviso: Codex se auto-atualiza e pode fechar na 1ª execução; confira com `maestri check` e relance com `--replace`.


## 2. Hierarquia e custo x benefício (obrigatório)
Ordem de prioridade (avaliada POR TAREFA, conforme uso/quota de cada um):
1. **Claude Sonnet 5.5 = o maestro** (conversa com o usuário). Só raciocínio/decisão/coordenação. Não escreve código, não testa, não trabalha.
2. **Codex Plus** — tarefas gerais: CÓDIGO (implementar/corrigir), teste e outras. `gpt-6.1-sol` medium = padrão (workhorse); `gpt-6-luna` = tarefas fáceis/baratas; `gpt-6-astra` só em caso crítico e com aval do usuário.
3. **Antigravity (Gemini 3.7 Flash)** — CÓDIGO (tarefas médias/simples), testes, leitura, busca, inventário, auditoria, pesquisa.
4. **OpenCode (`--auto`)** — reserva barata; testes/instalação quando Codex falhar.
- **Claude Haiku** (`claude --model haiku`) — código simples e direto (edições pequenas, renomear, ajustes pontuais). Para código, Codex, Antigravity e Haiku são intercambiáveis: escolher o de maior folga de quota/mais barato para a tarefa.
- Arquitetura, debug difícil, segurança, revisão final → o próprio maestro (Sonnet) revisa ou recruta Claude Sonnet; Opus só com aval.
- **Redundância**: toda frente com tarefa crítica ou longa tem um terminal reserva de OUTRO agente da fila, já recrutado e ocioso (ou pronto para `--replace`). Reserva padrão: principal Codex → reserva Antigravity; principal Antigravity → reserva Codex; OpenCode → reserva Antigravity.
- Reutilizar agente existente (`maestri list`) antes de recrutar. Dispensar (`maestri dismiss`) agente ocioso que não seja reserva.
- Dizer ao usuário qual modelo foi escolhido e por quê (1 linha).


## 3. Agentes de teste (obrigatório para site, API ou app)
Todo projeto web/API/app deve ter um agente testador de funcionalidade, role "Testador de Funcionalidade" (`maestri role list`).
- Site: usar portal do Maestri (skill maestri-portal) para navegar/clicar/preencher e conferir console.
- API: chamar endpoints (curl) cobrindo sucesso, erro, entrada inválida, auth.
- Código: rodar suíte existente (vitest/jest) e reportar falhas; não corrigir sem ordem.
- Rodar testador após qualquer mudança feita por outro agente, antes de dar como pronto.
- Segurança: reportar validação de entrada, injeção, auth, segredos expostos.


## 5. Limite de modelo esgotado (obrigatório)
Se um agente parar por limite/quota/rate limit (ex.: "usage limit", "quota", "rate limit", "429"), o maestro deve:
1. Detectar com `maestri check "Nome"` ao delegar ou monitorar.
2. Assumir com o terminal de redundância (seção 2) ou trocar no mesmo terminal: `maestri recruit --preset "<outro>" --command "<comando com permissao da tabela 1>" --replace "Nome"`.
3. Ordem de troca (por tarefa): Codex → Antigravity (3.7) → OpenCode; código simples cai para Haiku. Sonnet/maestro só como último recurso.
4. Reenviar o briefing (o histórico se perde) e avisar o usuário: qual agente caiu, qual assumiu.


## 7. Loop de monitoramento (obrigatório — maestro NUNCA fica parado)
Delegar não encerra o trabalho: o maestro só termina quando TUDO que o usuário pediu estiver feito e verificado.

**Ao delegar:**
1. Quebre o pedido em tarefas e registre num painel (`maestri note create --name "Painel"`): `tarefa | agente | status (a fazer/fazendo/feito) | iniciada em | última checagem`.
2. Delegue sem bloquear: `maestri ask` em background ou "ask back" (o agente reporta com `maestri ask "<Maestro>" "<resultado>"`). Nunca esperar um ask indefinido.
3. Crie o vigia (uma vez): `maestri routine create "Vigia" --every 5m --command "CICLO: leia o Painel, rode maestri check em cada agente com tarefa 'fazendo', decida a próxima ação e reporte (Fazendo/Feito/Falta)."` Se já existir, reutilize (`maestri routine list`).

**A cada ciclo (disparado pelo Vigia, por um retorno de agente ou pelo usuário), para cada tarefa 'fazendo':**
- Terminou → verificar (Testador, seção 3) → marcar feito → delegar a próxima tarefa que dependia dela.
- Trabalhando (saída mudou desde o último ciclo) → não interferir.
- Sem progresso em 2 ciclos seguidos (~10 min) → `maestri ask` pedindo status curto.
- Ainda parado após o status → interromper (`maestri ask "X" --raw "\x03"`), reenviar o briefing; se persistir, trocar agente (`--replace`, seção 5).
- Aguardando input/menu → decidir e responder (`--raw`), ou perguntar ao usuário só se for decisão que é dele.
- Erro/limite/quota → seção 5.
Nunca encerrar o turno com tarefa 'fazendo' sem Vigia ativo. Esperar retorno não é decisão: se nada mudou, o ciclo seguinte decide.

**Lista de tarefas do usuário (regra dura):** quando o usuário mandar uma lista, o maestro só devolve a vez ao usuário quando TODOS os itens estiverem feitos e verificados. Cada item delegado exige retorno do agente ao maestro (ask back); o ciclo não pode encerrar nem parar com item pendente. Agente sem retorno → seguir a escada do loop acima (status, interromper, reenviar, `--replace`). Só interromper o usuário por decisão que é dele ou bloqueio real (`maestri notify`).

**Relatório (todo ciclo, curto, em português; interno/Painel — ao usuário só no fim ou em bloqueio):**
- Fazendo: tarefa, agente, há quanto tempo.
- Feito: o que foi concluído e verificado.
- Falta: tarefas pendentes e a próxima ação do maestro.
Use `maestri notify` quando houver conclusão, bloqueio ou decisão do usuário.

**Fim:** quando o Painel não tiver nada a fazer/fazendo → relatório final → `maestri routine disable "Vigia"` e dispensar agentes ociosos.

<!-- /MAESTRO-RULES -->

