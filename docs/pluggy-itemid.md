# Pesquisa: Pluggy Item ID, Meu Pluggy e API

Documento de referência sobre identificadores de conexão (`itemId`), comportamento da conta pessoal (*Meu Pluggy*) em relação ao Developer Dashboard e fluxo oficial de conexão.

---

## 1. Existe endpoint que LISTA os items a partir da apiKey? Como o dono acha o itemId?

### Endpoint de Listagem: `GET /v2/items`
- **Existe:** Sim, o endpoint oficial é **`GET /v2/items`** (com paginação por cursor e filtros por `clientUserId` e `connectorId`).
- **Restrição crítica:** Este endpoint vem **desabilitado por padrão** por motivos de segurança e retorna **`403 Forbidden`** com o erro `LIST_ITEMS_FEATURE_NOT_ENABLED`.
- **Regra de planos:** A Pluggy ativa esse endpoint apenas para planos pagos mediante solicitação ao suporte. **Ele não pode ser ativado em planos Free ou contas de uso pessoal do Meu Pluggy**.
- **Fonte oficial:**
  - [Pluggy Docs - List Items (`GET /v2/items`)](https://docs.pluggy.ai/)
  - [Pluggy Docs - Error Codes (`LIST_ITEMS_FEATURE_NOT_ENABLED`)](https://docs.pluggy.ai/)

### Como o dono acha o `itemId` de cada banco conectado no Meu Pluggy:

1. **Pelo Pluggy Dashboard (Demo App):**
   - Acesse [dashboard.pluggy.ai](https://dashboard.pluggy.ai/) com o **mesmo e-mail** cadastrado no `meu.pluggy.ai`.
   - Acesse a aba **Applications** e selecione a aplicação criada.
   - Clique em **"Ir para Demo"** (Demo App).
   - No menu de três pontos (`⋮`) ao lado da instituição conectada, clique em **"Copiar Item ID"** (Copy Item ID).
2. **Pelos Logs / Eventos do Dashboard:**
   - Acesse a página de eventos em [dashboard.pluggy.ai/events](https://dashboard.pluggy.ai/events).
   - Eventos como `item/created` ou sincronizações recentes exibem o `itemId` (UUID).
3. **Pelo DevTools do Navegador no Meu Pluggy (`meu.pluggy.ai`):**
   - Acesse [meu.pluggy.ai](https://meu.pluggy.ai) logado.
   - Abra as Ferramentas de Desenvolvedor (`F12`) na aba **Network** (Rede).
   - Atualize a página e filtre por `items` ou `accounts`.
   - Nas respostas JSON das chamadas de API, o UUID de cada conexão bancária está presente no campo `id` / `itemId`.

---

## 2. O Meu Pluggy usa aplicação própria? A apiKey do dono enxerga os items do meu.pluggy.ai?

- **Confirmação:** **Sim, enxerga**, desde que o cadastro no Dashboard use o mesmo e-mail.
- **Funcionamento oficial documentado:**
  - O Meu Pluggy (`meu.pluggy.ai`) é a interface B2C/pessoal da Pluggy.
  - No guia oficial *"Do Meu Pluggy à API Gratuita"*, a Pluggy orienta o usuário a conectar as contas bancárias no `meu.pluggy.ai` e criar uma conta no [dashboard.pluggy.ai](https://dashboard.pluggy.ai) utilizando **o mesmo e-mail**.
  - A aplicação de desenvolvimento criada no Dashboard vincula automaticamente as conexões feitas no Meu Pluggy àquela aplicação.
  - As credenciais (`clientId` e `clientSecret`) geradas no Dashboard emitem uma `apiKey` via `POST /auth`. Essa `apiKey` **tem permissão para acessar os dados dos items conectados no Meu Pluggy** diretamente via:
    - `GET /items/{id}` (detalhes da conexão)
    - `GET /accounts?itemId={id}` (contas bancárias associadas)
    - `GET /transactions?accountId={id}` (extratos e transações)
  - *Ressalva importante:* A `apiKey` enxerga os dados dos items específicos, mas devido à restrição do plano pessoal (questão 1), ela **não pode listar** via `GET /v2/items`. Portanto, o dono precisa obter o `itemId` previamente pelo Dashboard/Demo App/DevTools e injetá-lo na aplicação.
- **Fontes oficiais:**
  - [Pluggy Docs - Guia de Uso Pessoal / Meu Pluggy](https://docs.pluggy.ai/)
  - [Pluggy Portal - dashboard.pluggy.ai](https://dashboard.pluggy.ai/)

---

## 3. Caminho Oficial para Aplicações Próprias (Pluggy Connect Widget)

Se o objetivo for permitir que o usuário conecte bancos diretamente pela interface da própria aplicação (sem depender do Meu Pluggy ou de copiar IDs manualmente):

- **Fluxo Oficial:** **Pluggy Connect Widget** com **Connect Token**.
- **Passo a passo:**
  1. **Backend:** Autentica na Pluggy com `CLIENT_ID` e `CLIENT_SECRET` via `POST /auth` para obter a `apiKey`.
  2. **Backend:** Gera um token temporário chamando:
     ```http
     POST https://api.pluggy.ai/connect_token
     X-API-KEY: {apiKey}
     Content-Type: application/json

     {
       "clientUserId": "user-uuid-ou-email"
     }
     ```
     O token gerado tem validade de 30 minutos e escopo restrito.
  3. **Frontend:** Abre o widget Pluggy Connect (via `@pluggy.io/react-connect` ou SDK JavaScript) passando o `connectToken`:
     ```javascript
     const pluggyConnect = new PluggyConnect({
       connectToken: connectTokenFromBackend,
       onSuccess: (itemData) => {
         // itemData.item.id contém o itemId gerado
         saveItemIdInDatabase(itemData.item.id);
       },
       onError: (err) => console.error(err)
     });
     pluggyConnect.init();
     ```
  4. **Persistência:** No callback `onSuccess` ou via webhook `item/created`, a aplicação captura e salva o `itemId` associado ao usuário.
- **Fontes oficiais:**
  - [Pluggy Docs - Pluggy Connect Overview](https://docs.pluggy.ai/docs/pluggy-connect-widget)
  - [Pluggy Docs - Create Connect Token (`POST /connect_token`)](https://docs.pluggy.ai/)
