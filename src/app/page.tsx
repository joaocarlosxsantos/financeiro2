import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  ChartPie,
  FileUp,
  LifeBuoy,
  BookOpen,
  Target,
  TrendingUp,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";

const features = [
  {
    icon: ChartPie,
    title: "Fixo x variável, na hora",
    text: "Todo gasto entra classificado. Você vê na hora o que é compromisso do mês e o que dá para cortar.",
  },
  {
    icon: LifeBuoy,
    title: "Reserva de emergência guiada",
    text: "O sistema calcula quanto você precisa guardar com base no seu custo de vida real — não em um número genérico.",
  },
  {
    icon: Target,
    title: "Metas que se acompanham sozinhas",
    text: "Defina o objetivo e o prazo. A cada aporte, você vê o quanto falta e se o ritmo está dando conta.",
  },
  {
    icon: FileUp,
    title: "Extrato e fatura importados",
    text: "Suba o CSV ou OFX do banco e do cartão. As categorias vêm sugeridas e duplicatas são bloqueadas.",
  },
  {
    icon: TrendingUp,
    title: "Projeções com cenários",
    text: "Veja onde seu patrimônio chega em 1, 5 ou 10 anos mudando o quanto você guarda por mês.",
  },
  {
    icon: BookOpen,
    title: "Didático de propósito",
    text: "Cada número vem com a explicação do porquê ele importa. Controle financeiro sem jargão.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <Link href="/" aria-label="Razão" className="inline-flex min-h-11 items-center"><Logo /></Link>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-2)]"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-[var(--on-acento)] shadow-sm transition-colors hover:bg-brand-700"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="pt-14 pb-16 text-center sm:pt-20">
          <h1 className="mx-auto max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            Clareza no que entra, no que sai e no que sobra
          </h1>
          <p className="muted mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty">
            Um controle financeiro que não te deixa sozinho com uma planilha. Ele separa gasto fixo de
            variável, calcula sua reserva, acompanha metas e mostra onde você chega se mantiver o ritmo.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/cadastro"
              className="inline-flex min-h-11 items-center inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-medium text-[var(--on-acento)] shadow-sm transition-colors hover:bg-brand-700"
            >
              Começar agora
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center inline-flex h-11 items-center rounded-xl border bg-[var(--surface)] px-6 text-sm font-medium transition-colors hover:bg-[var(--surface-2)]"
            >
              Já tenho conta
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="min-w-0 border-t border-[var(--line)] py-6">
              <div className="mb-3 text-[var(--text-muted)]">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </div>
              <h2 className="text-heading font-medium">{title}</h2>
              <p className="muted mt-1.5 text-[0.875rem] leading-relaxed">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 flex flex-col items-start gap-4 border-t border-[var(--line)] py-8 text-left">
          <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-balance">
            Está endividado? O primeiro passo é enxergar o tamanho real do buraco.
          </h2>
          <p className="muted max-w-lg text-[0.9375rem] leading-relaxed">
            Cadastre suas dívidas como metas de quitação, veja quanto de juros você paga por mês e
            descubra quanto precisa direcionar para sair no prazo que der para você.
          </p>
          <Link
            href="/cadastro"
            className="inline-flex min-h-11 items-center inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-medium text-[var(--on-acento)] transition-colors hover:bg-brand-700"
          >
            Criar minha conta
            <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="muted mx-auto max-w-6xl px-4 py-6 sm:px-6 text-xs">
          Razão — seus dados ficam na sua conta. Este sistema é uma ferramenta de organização
          e não substitui orientação profissional de investimentos.
        </div>
      </footer>
    </div>
  );
}
