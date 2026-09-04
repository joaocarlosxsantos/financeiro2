"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChartPie,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Wallet,
  TrendingDown,
  Repeat,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

const nav = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/recorrentes", label: "Recorrentes", icon: Repeat },
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank },
  { href: "/dividas", label: "Dívidas", icon: TrendingDown },
  { href: "/metas", label: "Metas e reserva", icon: Target },
  { href: "/projecoes", label: "Projeções", icon: TrendingUp },
  { href: "/importar", label: "Importar extrato", icon: FileUp },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="space-y-1" aria-label="Navegação principal">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "hover:bg-[var(--surface-2)] text-[var(--text)]",
            )}
          >
            <Icon className={cn("size-4.5", active ? "" : "opacity-65")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* topo mobile */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b bg-[var(--surface)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <ChartPie className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Financeiro 2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl border"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      <div className="h-14 lg:hidden" />

      {open ? (
        <div className="fixed inset-x-0 top-14 z-30 border-b bg-[var(--surface)] p-4 lg:hidden">
          {links}
          <form action={logoutAction} className="mt-3 border-t pt-3">
            <button className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]">
              <LogOut className="size-4.5 opacity-65" />
              Sair
            </button>
          </form>
        </div>
      ) : null}

      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-[var(--surface)] p-4 lg:flex">
        <div className="mb-7 flex items-center justify-between px-1 pt-2">
          <Link href="/painel" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <ChartPie className="size-4.5" />
            </div>
            <span className="text-[0.9375rem] font-semibold tracking-tight">Financeiro 2.0</span>
          </Link>
          <ThemeToggle />
        </div>

        {links}

        <div className="mt-auto border-t pt-3">
          <div className="px-3 py-2">
            <p className="truncate text-[0.8125rem] font-medium">{userName}</p>
            <p className="muted truncate text-xs">{userEmail}</p>
          </div>
          <form action={logoutAction}>
            <button className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]">
              <LogOut className="size-4.5 opacity-65" />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
