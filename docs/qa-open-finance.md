# Relatório de Execução QA — Tarefa T1c (Integração Open Finance)

**Data:** 06/11/2026  
**Ambiente:** http://localhost:4100  
**Usuário de Teste:** qa-teste@financeiro.local (da nota `qa-conta`)  
**Responsável:** Vistoria (QA)

---

## 1) `/configuracoes/integracao` — **OK**
* **Acesso Autenticado:** Acesso direto à rota estando autenticado abre normalmente sem erro, exibindo o título `"Integração — Financeiro 2.0"`.
* **Estrutura do Formulário:**
  * Campo `clientId`: `input type="text"`, autoComplete="off".
  * Campo `clientSecret`: `input type="password"`, autoComplete="new-password", adequadamente mascarado.
  * Campo `itemId`: `input type="text"`, obrigatório (`required`).
  * Campo `label` ("Nome desta conexão"): `input type="text"`, maxLength=100.
  * Campo `importFromDate` ("Data inicial de importação"): `input type="date"`, com valor inicial padrão no primeiro dia do mês corrente (`2026-11-01`).
* **Validação de Entrada e Feedback:**
  * Campo `itemId` vazio: validação HTML5 do navegador acionada (`validationMessage: "Preencha este campo."`).
  * Campos inválidos / comprimentos fora do limite (ex.: `clientId` < 4 caracteres, `clientSecret` < 8 caracteres, `itemId` < 4 caracteres): exibe mensagem clara no rodapé do formulário: `"Confira os campos informados."`.
  * Data futura (ex.: `2030-01-01`): exibe mensagem clara: `"A data inicial precisa ser válida e não futura."`.
  * Credenciais fictícias com formato válido sem conectividade Pluggy real: chamada segura à API com captura de erro e mensagem controlada `"unavailable"` (sem expor stack trace).
* **Inspeção de Segredos:**
  * HTML / SSR: O objeto de estado inicial não inclui `clientSecret`, `clientId` nem chaves de criptografia.
  * Console do navegador: Verificado via captura de logs — nenhum erro ou vazamento registrado.
  * Limpeza no DOM: Após submissão, os campos `clientId`, `clientSecret` e `itemId` são programaticamente limpos do formulário no cliente.

---

## 2) Escolha Manual x Integração e Modo Manual — **OK**
* **Vínculo por Conta/Cartão:** Na seção "Contas vinculadas" da página de integração, cada conta local (corrente, poupança, cartão de crédito) possui seleção para vinculação a uma conta externa compatível retornada pela Pluggy.
* **Bloqueio sem Conexão Válida:** Quando não há conexão externa Pluggy carregada, a interface bloqueia a transição e instrui: `"Escolha uma conexão e carregue as contas para fazer os vínculos locais."`. Tentativas programáticas diretas de vínculo sem credenciais válidas retornam erro no servidor (`"Escolha uma conta Pluggy válida."`).
* **Preservação do Modo Manual:** Testado ciclo completo em `/lancamentos`:
  * **Criação:** Criado lançamento de teste com prefixo `"QA Teste Manual Lancamento"` no valor de `R$ 50,00` em conta corrente manual.
  * **Edição:** Alterada a categoria do lançamento de `"Sem categoria"` para `"Compras"`, atualizado imediatamente na tabela.
  * **Exclusão:** Acionado botão de exclusão, exibindo o diálogo modal de confirmação (`alertdialog`). Após confirmação, o lançamento foi excluído e a lista retornou ao estado original sem resíduos.

---

## 3) Redirecionamento sem Login — **OK**
* Requisição HTTP não autenticada para `http://localhost:4100/configuracoes/integracao` retorna status `HTTP 307` com cabeçalho `location: /login`.
* Navegação via browser sem sessão ativa redireciona imediatamente para a tela `/login` (`Entrar — Financeiro 2.0`).

---

## 4) Telas Principais e Total Incompleto — **OK**
* **Status das Rotas Principais:**
  * `/painel`: `HTTP 200` — Carregado sem erro 500, sem erros no console.
  * `/lancamentos`: `HTTP 200` — Carregado sem erro 500, sem erros no console.
  * `/contas`: `HTTP 200` — Carregado sem erro 500, sem erros no console.
  * `/metas`: `HTTP 200` — Carregado sem erro 500, sem erros no console.
  * `/contas-a-pagar`: `HTTP 200` — Carregado sem erro 500, sem erros no console.
  * `/cartoes`: Rota isolada inexistente (`HTTP 404`); a administração de cartões de crédito é centralizada em `/contas` e `/configuracoes`.
* **Total Incompleto:**
  * Verificado na consulta (`src/server/queries.ts`) e no componente visual (`src/app/(app)/contas/page.tsx`):
  * Regra: `totalIncomplete = accounts.some(a => a.financeMode === "integracao" && a.bankBalanceCents === null)`.
  * Quando acionado, renderiza o alerta `"Total incompleto: Há conta integrada sem snapshot bancário disponível. O consolidado fica incompleto até a próxima sincronização."` e substitui o valor consolidado de patrimônio líquido pela mensagem `"Total incompleto"`.

---

## 5) Responsividade e Medidas por Tamanho de Tela — **OK**
Testado com popups/toasts fechados nas páginas `/configuracoes/integracao` e `/painel`:

| Resolução Alvo | Viewport Obtido | Document ScrollWidth | ClientWidth | Overflow Horizontal? | Resultado |
|---|---|---|---|---|---|
| **1280 x 720** | 1280 x 720 | 1272 px | 1272 px | Não (`false`) | **OK** |
| **1366 x 768** | 1366 x 768 | 1358 px | 1358 px | Não (`false`) | **OK** |
| **1440 x 900** | 1440 x 900 | 1432 px | 1432 px | Não (`false`) | **OK** |
| **1920 x 1080** | 1920 x 1080 | 1912 px | 1912 px | Não (`false`) | **OK** |
| **390 x 844** (Mobile) | 390 x 844 | 382 px | 382 px | Não (`false`) | **OK** |
| **360 x 640** (Mobile) | 360 x 640 | 352 px | 352 px | Não (`false`) | **OK** |

Em nenhuma das resoluções houve quebra de grid, botões cortados ou rolagem horizontal indesejada.

---

## 6) Análise de Segurança — **OK**
* **Injeção de Código (SQLi e XSS):**
  * Submetidos payloads de injeção nos campos (`' OR '1'='1`, `item' OR 1=1--`, `<script>alert(1)</script>`, `QA <svg onload=window.xss=1>`).
  * Nenhum script foi executado (`window.xss === false`).
  * O Drizzle ORM emprega queries parametrizadas em todas as operações de banco de dados.
* **Autenticação e Autorização de Rotas:**
  * 14 rotas privadas testadas sem sessão: `/painel`, `/lancamentos`, `/contas`, `/contas-a-pagar`, `/orcamento`, `/metas`, `/projecoes`, `/recorrentes`, `/dividas`, `/insights`, `/importar`, `/configuracoes`, `/configuracoes/integracao` e `/api/exportar/backup`.
  * Todas responderam com `HTTP 307` redirecionando para `/login`.
* **Exposição de Segredos:**
  * `APP_ENCRYPTION_KEY` e segredos Pluggy não são expostos no bundle compilado do cliente (`.next/static`) nem no código HTML das páginas.
  * O arquivo `.env` permanece estritamente local e excluído pelo `.gitignore`.

---

## Estado dos Portais
* Portal `"QA Portal"` navegado para `about:blank` e encerrado.
* **Confirmado:** portais fechados (nenhum portal ativo na sessão).
