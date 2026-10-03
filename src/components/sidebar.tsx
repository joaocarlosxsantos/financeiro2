"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ReceiptText,
  Wallet,
  TrendingDown,
  Repeat,
  PiggyBank,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Mês",
    items: [
      { href: "/painel", label: "Painel", icon: LayoutDashboard },
      { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
      { href: "/contas", label: "Saldos", icon: Wallet },
      { href: "/contas-a-pagar", label: "Contas a pagar", icon: ReceiptText },
    ],
  },
  {
    title: "Planejar",
    items: [
      { href: "/orcamento", label: "Orçamento", icon: PiggyBank },
      { href: "/metas", label: "Metas e reserva", icon: Target },
      { href: "/projecoes", label: "Projeções", icon: TrendingUp },
      { href: "/recorrentes", label: "Recorrentes", icon: Repeat },
    ],
  },
  {
    title: "Dívidas",
    items: [
      { href: "/dividas", label: "Dívidas", icon: TrendingDown },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/insights", label: "Insights", icon: Sparkles },
      { href: "/importar", label: "Importar extrato", icon: FileUp },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export function Sidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex-1 space-y-4 overflow-y-auto" aria-label="Navegação principal">
      {sections.map((section) => (
        <div key={section.title} className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[0.6875rem] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-[0.8125rem] transition-colors rounded-r-sm",
                    active
                      ? "border-[var(--text-brand)] font-semibold text-[var(--text-brand)] bg-transparent"
                      : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-[var(--text-brand)]" : "text-[var(--text-muted)] group-hover:text-[var(--text)]",
                    )}
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* topo mobile */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b bg-[var(--surface)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-brand)]">
            <span className="font-display text-base font-bold leading-none">F</span>
          </div>
          <span className="font-display text-base font-medium tracking-tight text-[var(--text)]">
            Financeiro <span className="text-xs font-normal text-[var(--text-muted)]">2.0</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      <div className="h-14 lg:hidden" />

      {open ? (
        <div className="fixed inset-x-0 top-14 z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b bg-[var(--surface)] p-4 lg:hidden">
          {links}
          <form action={logoutAction} className="mt-4 border-t pt-3">
            <button className="flex w-full cursor-pointer items-center gap-2.5 border-l-2 border-transparent px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              <LogOut className="size-4 text-[var(--text-muted)]" />
              Sair
            </button>
          </form>
        </div>
      ) : null}

      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-[var(--surface)] p-4 lg:flex">
        <div className="mb-6 flex items-center justify-between px-1 pt-1">
          <Link href="/painel" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-brand)]">
              <span className="font-display text-base font-bold leading-none">F</span>
            </div>
            <span className="font-display text-base font-medium tracking-tight text-[var(--text)]">
              Financeiro <span className="text-xs font-normal text-[var(--text-muted)]">2.0</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>

        {links}

        <div className="mt-auto border-t pt-3">
          <div className="px-2.5 py-1.5">
            <p className="truncate text-[0.8125rem] font-medium text-[var(--text)]">{userName}</p>
            <p className="muted truncate text-xs">{userEmail}</p>
          </div>
          <form action={logoutAction}>
            <button className="flex w-full cursor-pointer items-center gap-2.5 border-l-2 border-transparent px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              <LogOut className="size-4 text-[var(--text-muted)]" />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
