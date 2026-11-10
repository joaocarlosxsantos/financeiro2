"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { UserMenuFooter } from "@/components/user-menu-footer";
import { NavigationSections } from "@/components/navigation-sections";
import { getNavigationSections } from "@/components/navigation-model";
import { useUsageProfile } from "@/components/usage-profile";
import { canUseCapability } from "@/lib/usage-profile";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { BottomNav, QuickEntry } from "@/components/bottom-nav";
import type { PlainAccount, PlainCategory } from "@/app/(app)/lancamentos/types";

export function Sidebar({ userName, accounts, categories }: {
  userName: string;
  accounts: PlainAccount[]; categories: PlainCategory[];
}) {
  const pathname = usePathname();
  const profile = useUsageProfile();
  const manualEntry = canUseCapability(profile, "manual-entry");
  const [newOpen, setNewOpen] = useState(false);
  const brand = <Link href="/painel" className="flex min-h-11 items-center" aria-label="Mutano Contas — ir para o painel">
    <Logo compacto />
  </Link>;
  return <>
    <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-[var(--bg)] px-4 lg:fixed lg:top-0 lg:left-0 lg:z-10 lg:w-[232px] lg:border-b-0 lg:pt-4">
      {brand}<ThemeToggle />
    </header>
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg)] p-4 pt-[84px] lg:flex">
      {manualEntry && <button type="button" onClick={() => setNewOpen(true)} aria-haspopup="dialog"
        className="mb-5 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--acento)] px-3 text-sm font-medium text-[var(--on-acento)]">
        <Plus aria-hidden="true" className="size-5" />Novo lançamento
      </button>}
      <nav aria-label="Navegação principal desktop" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <NavigationSections sections={getNavigationSections(profile, "desktop")} pathname={pathname} surface="desktop" />
      </nav>
      <UserMenuFooter userName={userName} pathname={pathname} />
    </aside>
    <BottomNav userName={userName} onNew={() => setNewOpen(true)} />
    {newOpen && manualEntry && <QuickEntry accounts={accounts} categories={categories} onClose={() => setNewOpen(false)} />}
  </>;
}
