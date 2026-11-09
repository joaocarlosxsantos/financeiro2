# Relatório de Teste de Funcionalidade Pós-T12

**Data:** 09/11/2026  
**Ambiente:** http://localhost:4100 (Dev Server Turbopack no ar)  
**Conta de Teste:** `qa-teste@financeiro.local` (nota `qa-conta`)  
**Responsável:** Vistoria (QA)

---

### Resumo Executivo
* **Dev Server:** Confirmado ativo e respondendo em `http://localhost:4100`.
* **Fluxos Testados:** Login, /configuracoes/integracao, /lancamentos, /contas, /recorrentes, /contas-a-pagar, /dividas, /metas, exportação de backup, tema claro/escuro, responsividade (6 resoluções) e validação de entrada.
* **Console:** Sem erros nas telas navegadas.
* **Portais:** Todos os portais abertos foram encerrados com `about:blank` e `portal close`. Confirmado: portais fechados.
* **Resultado:** **1 FALHA BLOQUEANTE ENCONTRADA** na edição de categoria de lançamentos. Demais fluxos OK.

---

### Detalhamento por Fluxo

#### 1. Login e Autenticação — **OK**
* Acesso inicial e login com `qa-teste@financeiro.local` / `Qa40283-Teste!x`.
* Validação de campos vazios aciona mensagens nativas em português (`"Preencha este campo."`).
* Redirecionamento correto para `/painel` após autenticação.

#### 2. `/configuracoes/integracao` — **OK**
* Acesso autenticado com título `"Integração — Financeiro 2.0"`.
* Validação de entrada:
  * Campos curtos/inválidos exibem alerta com mensagem clara: `"Confira os campos informados."`.
  * Data futura (ex.: `2030-01-01`): exibe `"A data inicial precisa ser válida e não futura."`.
  * Campo obrigatório (`itemId`) vazio: foca o campo com `"Preencha este campo."`.
* Textos em português com acentuação correta e sem caracteres corrompidos.
* Select de conexão configurado para chaveamento quando múltiplas conexões cadastradas.
* Console sem erros.

#### 3. `/lancamentos` — **FALHA BLOQUEANTE (BUG ENCONTRADO)**
* **Listagem:** Carrega normalmente (HTTP 200).
* **Criação de Lançamento:** Criado `"QA Teste T12"` (R$ 75,50) com sucesso.
* **Categorias:** Rótulos com acentos corretos no select (`"Alimentação fora"`, `"Dívidas e juros"`, `"Educação"`, `"Saúde"`, `"Salário"`).
* **Exclusão de Lançamento:** Excluído com modal de confirmação (`alertdialog`). Lista limpa sem resíduos.
* **BUG ENCONTRADO (Edição de categoria):**
  * **Gravidade:** **Bloqueante**
  * **Tela:** `/lancamentos`
  * **Passos para reproduzir:** Selecionar qualquer categoria no select de categoria inline de um lançamento da lista.
  * **Esperado:** A categoria do lançamento ser atualizada no banco.
  * **Obtido:** Erro 500 / Runtime Error no servidor: `PostgresError: relation "category_rules" does not exist` disparado por `src\server\actions\transactions.ts (593:5) @ setTransactionCategory`. Falta criar ou rodar a migration da tabela `category_rules` no banco de dados Neon.

#### 4. `/contas` — **OK**
* Carregamento HTTP 200, patrimônio líquido consolidado correto, console limpo.
* Modal de ajuste de saldo inicial abre e fecha sem erros.

#### 5. `/recorrentes` — **OK**
* Criação de regra recorrente (`"QA Recorrente Manual"` dia 10, R$ 120,00).
* Lançamento individual / Lançar todas gera o lançamento na tabela do mês correspondente.
* Lógica de contas integradas verificada: ignora contas com `financeMode === "integracao"` avisando `"X conta(s) integrada(s) ignorada(s)."`.
* Regra e lançamento gerado devidamente excluídos no teste. Console limpo.

#### 6. `/contas-a-pagar` (T12) — **OK**
* Abas `"Contas"` e `"Compartilhadas"` funcionais com contadores corretos.
* Criação de conta a pagar (`"QA Conta Luz"`, vencimento dia 15).
* Alternância de status pendente <-> paga funcional.
* Exclusão com confirmação modal funcional. Console limpo.

#### 7. `/dividas` — **OK**
* Carregamento HTTP 200, console limpo.
* Validação de campos obrigatórios foca o campo nome com aviso `"Preencha este campo."`.

#### 8. `/metas` — **OK**
* Carregamento HTTP 200, progresso da reserva de emergência e lista de metas visíveis, console limpo.
* Validação de campos obrigatórios foca o nome da meta.

#### 9. Exportar Backup — **OK**
* Chamada a `/api/exportar/backup` retorna `HTTP 200`, `Content-Type: application/json; charset=utf-8` e `Content-Disposition: attachment; filename="backup-financeiro-2026-11-09.json"`.

#### 10. Tema Claro / Escuro — **OK**
* Botão de alternância no menu lateral remove/adiciona a classe `dark` no elemento `<html>` e atualiza o rótulo acessível `"Usar tema claro"` / `"Usar tema escuro"` perfeitamente.

---

### Responsividade e Medidas por Tamanho de Tela

Testado nas páginas principais (`/painel` e `/contas-a-pagar`), com popups e avisos fechados:

| Resolução | Viewport Real | ScrollWidth | ClientWidth | Overflow Horizontal? | Status |
|---|---|---|---|---|---|
| **1280 x 720** | 1280 x 720 | 1272 px | 1272 px | Não (`overflow: false`) | **OK** |
| **1366 x 768** | 1366 x 768 | 1358 px | 1358 px | Não (`overflow: false`) | **OK** |
| **1440 x 900** | 1440 x 900 | 1432 px | 1432 px | Não (`overflow: false`) | **OK** |
| **1920 x 1080** | 1920 x 1080 | 1912 px | 1912 px | Não (`overflow: false`) | **OK** |
| **390 x 844** (Mobile) | 390 x 844 | 382 px | 382 px | Não (`overflow: false`) | **OK** |
| **360 x 640** (Mobile) | 360 x 640 | 352 px | 352 px | Não (`overflow: false`) | **OK** |

Nenhum elemento estourou o viewport horizontal.

---

### Estado dos Portais
* Portal `"QA Portal"` navegado para `about:blank` e encerrado.
* **Portais fechados** confirmados no `maestri list`.
