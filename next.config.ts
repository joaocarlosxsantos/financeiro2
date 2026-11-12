import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Prévia de importação envia o conteúdo do arquivo por Server Action.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // O pdfkit resolve as fontes padrão (Helvetica etc.) via um "imports" subpath
  // do próprio pacote (`#standard-fonts/Helvetica`), através de um `require`
  // indireto que o rastreador de arquivos da Vercel não reconhece como tal —
  // por isso esses arquivos ficam de fora do pacote da função serverless e o
  // PDF só falha em produção ("Cannot find module '#standard-fonts/Helvetica'"),
  // nunca localmente (onde o node_modules inteiro está disponível). Força a
  // inclusão de todo o pacote na rota que gera o relatório em PDF.
  outputFileTracingIncludes: {
    "/api/exportar/relatorio": ["./node_modules/pdfkit/**/*"],
  },
  // Cabeçalhos de segurança que o app não tinha (a Vercel já garante HTTPS,
  // mas nenhum deles vem por padrão do Next.js): impedem o site de ser
  // carregado dentro de um <iframe> em outro site (clickjacking), impedem o
  // navegador de "adivinhar" o tipo de um arquivo servido (MIME sniffing), e
  // reduzem a URL enviada como referrer para fora do próprio site.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // Baseline for assets/API; document responses receive a per-request
          // nonce policy in src/proxy.ts (see docs/csp.md).
          { key: "Content-Security-Policy", value: "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
        ],
      },
      // Service Worker: nunca cachear o próprio arquivo; CSP restritiva para SW.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          // SW roda em contexto isolado; só precisa de self.
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // Página offline estática: pode ser cacheada pelo browser/SW mas não por CDNs.
      {
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          // CSP estrita para a página offline (sem scripts ou frames).
          { key: "Content-Security-Policy", value: "default-src 'self'; style-src 'unsafe-inline'; img-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
