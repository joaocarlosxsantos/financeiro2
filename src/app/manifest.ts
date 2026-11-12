import type { MetadataRoute } from "next";

/**
 * Permite instalar o app na tela inicial (Android/desktop) e define o ícone
 * usado nesse contexto. Os PNGs ficam em `public/` porque o manifesto precisa
 * de URLs estáveis — os ícones de `src/app/` recebem hash no nome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mutano Contas",
    short_name: "Mutano Contas",
    description:
      "Seu livro-caixa pessoal: gastos fixos e variáveis, reserva de emergência, metas e extratos.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
