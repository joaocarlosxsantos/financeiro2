import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financeiro 2.0 — clareza para a sua vida financeira",
  description:
    "Organize gastos fixos e variáveis, monte sua reserva de emergência, acompanhe metas e importe extratos e faturas.",
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
