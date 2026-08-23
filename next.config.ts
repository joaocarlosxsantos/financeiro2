import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Prévia de importação envia o conteúdo do arquivo por Server Action.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
