"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { BottomNav, QuickEntry, mainDestinations, moreDestinations, isDestinationActive } from "@/components/bottom-nav";
import type { PlainAccount, PlainCategory } from "@/app/(app)/lancamentos/types";

export function Sidebar({ userName, userEmail, accounts, categories }: {
  userName: string; userEmail: string;
  accounts: PlainAccount[]; categories: PlainCategory[];
}) {
  const pathname = usePathname();
  const [newOpen, setNewOpen] = useState(false);
  const brand = <Link href="/painel" className="flex min-h-11 items-center" aria-label="Mutano Contas — ir para o painel">
    <Logo compacto />
  </Link>;
  return <>
    <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-[var(--bg)] px-4 lg:fixed lg:top-0 lg:left-0 lg:z-10 lg:w-[232px] lg:border-b-0 lg:pt-4">
      {brand}<ThemeToggle />
    </header>
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg)] p-4 pt-[84px] lg:flex">
      <button type="button" onClick={() => setNewOpen(true)} aria-haspopup="dialog"
        className="mb-5 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--acento)] px-3 text-sm font-medium text-[var(--on-acento)]">
        <Plus aria-hidden="true" className="size-5" />Novo lançamento
      </button>
      <nav aria-label="Navegação principal desktop" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {[...mainDestinations, ...moreDestinations].map(({ href, label, icon: Icon }) => {
          const active = isDestinationActive(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors motion-reduce:transition-none", active ? "bg-[var(--surface-2)] font-medium text-[var(--text)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}>
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />{label}
          </Link>;
        })}
      </nav>
      <div className="mt-4 shrink-0 border-t pt-3">
        <p className="truncate px-3 text-sm font-medium">{userName}</p>
        <p className="muted mt-1 truncate px-3 text-xs">{userEmail}</p>
        <form action={logoutAction}><button className="mt-2 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"><LogOut aria-hidden="true" className="size-5" />Sair</button></form>
      </div>
    </aside>
    <BottomNav onNew={() => setNewOpen(true)} />
    {newOpen && <QuickEntry accounts={accounts} categories={categories} onClose={() => setNewOpen(false)} />}
  </>;
}
