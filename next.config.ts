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
};

export default nextConfig;
