import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Fonte de texto — Instrument Sans (grotesca editorial limpa e contemporânea)
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

// Fonte serifada de display — Fraunces (títulos e números grandes do caderno de contas)
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

// Fonte mono para valores em dinheiro (`.tnum`) — números tabulares
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Financeiro 2.0",
  description:
    "Organize gastos fixos e variáveis, monte sua reserva de emergência, acompanhe metas e importe extratos e faturas.",
  applicationName: "Financeiro 2.0",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4EFE6" },
    { media: "(prefers-color-scheme: dark)", color: "#14110E" },
  ],
};

const themeScript = `
try {
  var stored = localStorage.getItem('fin-theme');
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${fraunces.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
