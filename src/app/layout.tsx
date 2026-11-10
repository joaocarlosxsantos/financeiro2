import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-next",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const description = "Seu livro-caixa pessoal: gastos fixos e variáveis, reserva de emergência, metas e extratos.";

export const metadata: Metadata = {
  title: { default: "Razão", template: "%s — Razão" },
  description,
  applicationName: "Razão",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://financeiro2-delta.vercel.app"),
  openGraph: { type: "website", locale: "pt_BR", siteName: "Razão", title: "Razão", description },
  twitter: { card: "summary_large_image", title: "Razão", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const themeScript = `
try {
  var stored = localStorage.getItem('fin-theme');
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
