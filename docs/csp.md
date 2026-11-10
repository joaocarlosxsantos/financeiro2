# CSP e cabeçalhos HTTP

Política aplicada (enforcement), sem `unsafe-eval` em produção. Referência:
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (Next 16).

- `next.config.ts` aplica nosniff, DENY, referrer restrito, Permissions-Policy
  (câmera, microfone, localização, pagamentos e USB desativados) e CSP restritiva
  para respostas de assets/API.
- `src/proxy.ts` substitui a CSP nas rotas de documentos por uma política com
  nonce criptográfico novo de 32 bytes por requisição. Sobrescreve também headers
  de entrada, impedindo nonce fornecido pelo cliente. Envia a mesma CSP ao render
  do Next e à resposta. Inclui prefetch/RSC para não criar caminhos sem nonce.
- O layout lê `headers()` assincronamente, tornando as páginas dinâmicas; o
  themeScript recebe nonce. Next aplica o nonce aos scripts do runtime/streaming.
  Não compartilhar HTML com nonce entre requisições nem adicionar cache público.
- Scripts: self + nonce + strict-dynamic. `unsafe-eval` somente em desenvolvimento.
  Estilos inline continuam permitidos para React, Recharts e atributos dinâmicos.
- Fontes next/font são hospedadas em self. Imagens: self, data e blob (prévia
  local). Conexões: somente self; HMR ws/wss apenas em desenvolvimento.
  Pluggy é chamada em `src/server/open-finance/client.ts`, no servidor; o browser
  não chama api.pluggy.ai e não precisa dessa permissão. Sem scripts externos.
- Objetos, frames e ancestrais: none; formulários e base: self. Sem
  upgrade-insecure-requests para permitir QA HTTP local; Vercel fornece HTTPS.

Validação: testes de política/nonce, build de produção e portal em `next start`.
Conferir ausência de violações CSP, hidratação, alternância de tema, navegação e
respostas de fontes/imagens. Fluxos autenticados e serviços externos também
devem passar pela vistoria de produção; teste público local não os substitui.

T16b: TypeScript e 275 testes passaram. Respostas de `/`, `/login` e `/cadastro`
contêm nonce em todos os scripts (incluindo streaming); nonces mudam entre
requisições. Portal: landing → login e troca para tema claro funcionaram,
fontes carregadas, console sem violações CSP. A janela minimizada atrasou frames
e impediu screenshot, mas a árvore de acessibilidade confirmou os formulários
após a renderização. Não foram executadas operações em dados de usuários.
