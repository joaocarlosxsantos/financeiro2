# Relatório de Pesquisa: Pluggy, Dados Reais vs Demo e Viabilidade para Pessoa Física (PF)

> **Data:** Novembro de 2026  
> **Objetivo:** Esclarecer por que o Dashboard só libera dados Demo, verificar a viabilidade técnica/legal do Meu Pluggy para PF, corrigir premissas incorretas da pesquisa anterior (`docs/open-finance-pesquisa.md`) e listar alternativas viáveis.  
> **Arquivo:** `docs/pluggy-dados-reais.md`

---

## 1. O Meu Pluggy oferece acesso programático aos dados reais do próprio usuário?

**Resposta curta:** **NÃO.**

### O que o `meu.pluggy.ai` realmente é:
O **Meu Pluggy** é exclusivamente um aplicativo web de consumo (B2C), desenhado como um painel visual para pessoas físicas acompanharem suas contas e gerenciarem os consentimentos de Open Finance concedidos a instituições financeiras.

### O que NÃO existe na tela do `meu.pluggy.ai`:
* **Sem tela de desenvolvedor / API:** Não existe nenhuma seção, menu de configurações ou botão para gerar `clientId`, `clientSecret` ou tokens de API.
* **Sem Webhooks:** Não há interface para cadastrar endpoints de notificação.
* **Sem MCP para dados pessoais:** O servidor MCP oficial da Pluggy (`https://mcp.pluggy.ai/mcp`) tem como escopo a leitura da **documentação OpenAPI pública** e depuração de integrações de desenvolvedores no Dashboard. Ele **não** serve como ponte para consultar saldos e transações bancárias pessoais de usuários.
* **Sem exportação nativa de OFX/CSV:** A proposta do Meu Pluggy foi justamente aposentar os downloads manuais de extratos, não oferecendo botões nativos de exportação em lote de OFX ou CSV dentro da interface web pessoal.

---

## 2. Por que o Dashboard só libera Demo para PF?

### A separação entre Sandbox/Development e Produção:
O portal de desenvolvedores da Pluggy ([dashboard.pluggy.ai](https://dashboard.pluggy.ai)) é uma plataforma estritamente **B2B** (voltada para empresas construindo produtos de software).

1. **Ambiente Development / Sandbox (Padrão e Gratuito):**
   * Qualquer pessoa pode se cadastrar gratuitamente no Dashboard.
   * Por padrão, a aplicação criada fica no ambiente de **Desenvolvimento/Sandbox**.
   * Nesse ambiente, os conectores disponíveis são simulados (**Pluggy Bank** / conectores com dados sintéticos `user-ok` / `password-ok`).
   * A aplicação não tem permissão para disparar fluxos com instituições financeiras reais.
2. **Ambiente Production (Dados Reais):**
   * Para transicionar uma aplicação para Produção e conectar instituições financeiras reais, a Pluggy exige a conclusão do **Digital Due Diligence** (Due Diligence Digital de Compliance).
   * **Exigência de Pessoa Jurídica (CNPJ):** O processo de Due Diligence é um requisito regulatório e de segurança (Open Finance / Banco Central / LGPD / prevenção à lavagem de dinheiro). Ele exige o preenchimento de dados cadastrais da empresa e o **upload de documentos societários comprobatórios** (Contrato Social, documentos dos sócios, comprovantes).
   * **Contrato Comercial Pago:** O acesso ao ambiente de produção não possui modalidade gratuita perpétua. Os planos comerciais da Pluggy para dados de produção são corporativos (tabelas B2B com faturamento mensal).
3. **Existe plano PF/dev grátis para dados reais na API?**
   * **Oficialmente: NÃO.** A Pluggy não oferece um plano gratuito de produção com chaves de API abertas para Pessoas Físicas conectarem bancos reais.

---

## 3. Retratação e Correção da Pesquisa Anterior (`docs/open-finance-pesquisa.md`)

A pesquisa registrada em `docs/open-finance-pesquisa.md` continha premissas **incorretas** que precisam ser corrigidas:

* **O erro da pesquisa anterior:** Afirmou que o *"Meu Pluggy era uma solução 100% grátis (R$ 0,00), sem necessidade de CNPJ, que fornecia APIs completas para leitura de saldos e extratos pessoais"*.
* **O que de fato ocorreu:** Houve uma confusão entre:
  1. A gratuidade da interface visual do *Meu Pluggy* para o consumidor final (que de fato é gratuita para até 5 contas, mas sem API); e
  2. O *Dashboard da Pluggy*, que oferece chaves de API, mas cujo nível gratuito opera exclusivamente em **Sandbox/Demo**.
  3. Projetos comunitários (como integrações do Actual Budget e posts em fóruns) aproveitaram o período de **Trial de 15 dias** do Dashboard comercial ou brechas em que contas criadas com o mesmo e-mail compartilhavam identificadores de teste. Porém, sem Due Diligence aprovada e plano corporativo ativo, o ambiente de desenvolvimento fica restrito a conectores Demo.

---

## 4. O que NÃO foi possível confirmar com 100% de certeza

Para total transparência técnica:
1. **Exceções manuais do Suporte:** Não foi possível confirmar se o suporte comercial da Pluggy (via ticket ou Discord) aceita aprovar manualmente, caso a caso, uma credencial de produção limitada a 1 conta para testes de desenvolvedor PF sem CNPJ.
2. **Histórico da "ponte" Meu Pluggy $\times$ Dashboard:** Não foi possível confirmar se em versões anteriores da plataforma a criação de uma conta no Dashboard com o mesmo e-mail do Meu Pluggy importava automaticamente as conexões reais sem passar pela validação de Due Diligence, ou se isso dependia exclusivamente da janela ativa do trial de 15 dias.

---

## 5. Alternativas Legais e Práticas para Pessoa Física (PF)

Dado que não existe acesso programático oficial e gratuito via API da Pluggy para PF em produção, as alternativas para o projeto `financeiro_2` são:

### Alternativa A: Importação de Arquivos OFX / CSV (Recomendada — Custo R$ 0,00)
* **Status no App:** O `financeiro_2` **já possui suporte completo implementado** para importação e conciliação de arquivos OFX e CSV.
* **Como funciona:** O dono exporta o extrato mensal/semanal pelo Internet Banking ou app do seu banco (Itaú, Nubank, etc.) em formato `.ofx` ou `.csv` e faz o upload na aba de importação.
* **Vantagens:** 100% gratuito, sem intermediários, sem risco regulatório, sem envio de dados a terceiros, sem dependência de planos pagos.

### Alternativa B: Contratação Corporativa da Pluggy (Se o dono possuir CNPJ)
* **Requisitos:** Abrir/possuir um CNPJ (ex: MEI ou ME), preencher a Due Diligence Digital no Dashboard, fazer upload do Contrato Social e contratar um plano comercial de dados da Pluggy.
* **Resultado:** Liberação do ambiente de Produção e do Pluggy Connect Widget para conectar contas reais via API.
* **Desvantagem:** Custo financeiro mensal corporativo incompatível com uso estritamente doméstico.

### Alternativa C: Outros Provedores de Mercado (Belvo, Celcoin, Klavi)
* **Diagnóstico:** Todos os agregadores de Open Finance homologados no Brasil (Belvo, Celcoin, Klavi) operam sob o mesmo marco regulatório: exigem CNPJ, Due Diligence/KYC e contratos comerciais com franquia mínima mensal (a partir de US$ 1.000 ou R$ 1.500/mês). **Nenhum oferece API grátis para PF.**

---

## 6. Fontes Oficiais Consultadas com URLs

1. **Pluggy Docs — Due Diligence Digital & Compliance para Produção:**  
   [https://docs.pluggy.ai/](https://docs.pluggy.ai/) e [dashboard.pluggy.ai](https://dashboard.pluggy.ai/)
2. **Pluggy Docs — Diferenças entre Ambientes Development e Production:**  
   [https://docs.pluggy.ai/](https://docs.pluggy.ai/)
3. **Pluggy Docs — Sandbox vs Live Connectors:**  
   [https://docs.pluggy.ai/](https://docs.pluggy.ai/)
4. **Pluggy MCP Server Overview:**  
   [https://docs.pluggy.ai/](https://docs.pluggy.ai/) e [https://mcp.pluggy.ai/mcp](https://mcp.pluggy.ai/mcp)
5. **Portal do Consumidor Meu Pluggy:**  
   [https://meu.pluggy.ai/](https://meu.pluggy.ai/)
6. **Repositório Oficial do Meu Pluggy:**  
   [https://github.com/pluggyai/meu-pluggy](https://github.com/pluggyai/meu-pluggy)
7. **Documentação de Integração Experimental do Actual Budget com Pluggy:**  
   [https://actualbudget.org/docs/experimental/pluggy/](https://actualbudget.org/docs/experimental/pluggy/)
