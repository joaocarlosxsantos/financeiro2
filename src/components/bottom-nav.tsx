"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { BarChart3, FileUp, LayoutDashboard, LogOut, MoreHorizontal, PiggyBank, Plus, Receipt, ReceiptText, Repeat, Settings, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { createTransaction, createTransfer, type ActionState } from "@/server/actions/transactions";
import { logoutAction } from "@/server/actions/auth";
import { todayRef } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { PlainAccount, PlainCategory } from "@/app/(app)/lancamentos/types";

export const mainDestinations = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/contas", label: "Contas", icon: Wallet },
];
export const moreDestinations = [
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/dividas", label: "Dívidas", icon: TrendingDown },
  { href: "/projecoes", label: "Projeções", icon: TrendingUp },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/recorrentes", label: "Recorrentes", icon: Repeat },
  { href: "/contas-a-pagar", label: "Contas a pagar", icon: ReceiptText },
  { href: "/importar", label: "Importar", icon: FileUp },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
export function isDestinationActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ onNew }: { onNew: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const itemClass = "relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium";
  function destination(item: typeof mainDestinations[number]) {
    const active = isDestinationActive(pathname, item.href);
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      className={cn(itemClass, active ? "text-[var(--text)] before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-[var(--acento)]" : "text-[var(--text-subtle)]")}>
      <item.icon aria-hidden="true" className="size-6" strokeWidth={1.5} />{item.label}
    </Link>;
  }
  return <>
    {/* Keep the standard property alongside the glass recipe's WebKit alias. */}
    <nav aria-label="Navegação principal mobile" style={{ backdropFilter: "blur(20px) saturate(140%)", borderWidth: "1px 0 0" }} className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-2 px-2 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
      {mainDestinations.slice(0, 2).map(destination)}
      <button type="button" aria-label="Novo lançamento" aria-haspopup="dialog" onClick={onNew}
        className={cn(itemClass, "cursor-pointer bg-[var(--acento)] text-[var(--on-acento)]")}>
        <Plus aria-hidden="true" className="size-6" strokeWidth={1.5} /><span>Novo</span>
      </button>
      {destination(mainDestinations[2])}
      <button type="button" aria-label="Mais opções" aria-haspopup="dialog" aria-expanded={moreOpen}
        aria-current={moreDestinations.some((item) => isDestinationActive(pathname, item.href)) ? "true" : undefined}
        onClick={() => setMoreOpen(true)} className={cn(itemClass, "cursor-pointer", moreDestinations.some((item) => isDestinationActive(pathname, item.href)) ? "text-[var(--text)] before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-[var(--acento)]" : "text-[var(--text-subtle)]")}>
        <MoreHorizontal aria-hidden="true" className="size-6" strokeWidth={1.5} />Mais
      </button>
    </nav>
    {moreOpen && <Sheet title="Mais" onClose={() => setMoreOpen(false)}>
      <nav aria-label="Mais destinos" className="grid grid-cols-1 gap-2">
        {moreDestinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href} replace
          onClick={() => setMoreOpen(false)} aria-current={isDestinationActive(pathname, href) ? "page" : undefined}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--surface-2)]">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />{label}
        </Link>)}
      </nav>
      <form action={logoutAction}><button className="mt-2 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm hover:bg-[var(--surface-2)]"><LogOut aria-hidden="true" className="size-5" />Sair</button></form>
    </Sheet>}
  </>;
}

export function QuickEntry({ accounts, categories, userId, onClose }: {
  accounts: PlainAccount[]; categories: PlainCategory[]; userId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState("EXPENSE");
  const [state, action, pending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      const result = kind === "TRANSFER"
        ? await createTransfer(userId, String(form.get("accountId")), String(form.get("toAccountId")), parseMoneyToCents(String(form.get("amount"))), String(form.get("date")), String(form.get("description")))
        : await createTransaction({}, form);
      if (result.ok) { router.refresh(); window.history.back(); onClose(); }
      return result;
    } catch { return { error: "Não foi possível salvar. Tente novamente." }; }
  }, {});
  return <Sheet title="Novo lançamento" onClose={onClose}>
    {!accounts.length ? <p className="py-4 text-sm">Cadastre uma conta em <Link href="/configuracoes" replace onClick={onClose} className="underline">Configurações</Link> antes de lançar.</p> :
      <form action={action} className="space-y-4">
        <fieldset disabled={pending} className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Tipo de lançamento</legend>
          {[["EXPENSE", "Saída"], ["INCOME", "Entrada"], ["TRANSFER", "Transferência"]].map(([value, label]) =>
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}
              className={cn("min-h-11 min-w-0 cursor-pointer rounded-xl border px-1 text-xs", kind === value ? "border-[var(--acento)] bg-[var(--surface-2)]" : "border-[var(--line-strong)]")}>{label}</button>)}
        </fieldset>
        <input type="hidden" name="kind" value={kind} />
        <Field label="Descrição"><Input name="description" required minLength={2} placeholder="Ex.: Mercado" /></Field>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)"><Input name="amount" inputMode="decimal" required placeholder="0,00" className="tnum" /></Field>
          <Field label="Data"><Input name="date" type="date" required defaultValue={todayRef()} /></Field>
        </div>
        <Field label={kind === "TRANSFER" ? "Conta de origem" : "Conta"}><Select name="accountId" required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
        {kind === "TRANSFER" ?
          <Field label="Conta de destino"><Select name="toAccountId" required defaultValue={accounts[1]?.id ?? ""}><option value="" disabled>Selecione a conta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field> : <>
            <Field label="Categoria"><Select key={kind} name="categoryId"><option value="">Sem categoria</option>{categories.filter((category) => category.kind === kind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
            <Field label="Tipo de gasto"><Select name="nature"><option value="VARIABLE">Variável</option><option value="FIXED">Fixo</option></Select></Field>
          </>}
        {state.error && <p role="alert" className="text-sm text-[var(--text-out)]">{state.error}</p>}
        <div className="sticky bottom-0 bg-[var(--surface)] py-3"><SubmitButton className="min-h-12 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]" pendingLabel="Salvando…">Salvar lançamento</SubmitButton></div>
      </form>}
  </Sheet>;
}
