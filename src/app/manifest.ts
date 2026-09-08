import type { MetadataRoute } from "next";

/**
 * Permite instalar o app na tela inicial (Android/desktop) e define o ícone
 * usado nesse contexto. Os PNGs ficam em `public/` porque o manifesto precisa
 * de URLs estáveis — os ícones de `src/app/` recebem hash no nome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financeiro 2.0",
    short_name: "Financeiro",
    description:
      "Organize gastos fixos e variáveis, monte sua reserva de emergência e acompanhe metas.",
    start_url: "/painel",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#294f59",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
