"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CreditCard, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { saveOpeningBalance } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatCents, formatCentsPlain } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Money } from "@/components/ui/money";

type Account = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  color: string;
  balanceCents: number;
  openingBalanceCents: number;
  openingBalanceDate: string | null;
  incomeCents: number;
  expenseCents: number;
  transactionCount: number;
  financeMode?: string;
  bankBalanceCents?: number | null;
  bankBalanceAt?: string | null;
};

const ICONS: Record<string, LucideIcon> = {
  CHECKING: Landmark,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  CASH: Wallet,
  INVESTMENT: TrendingUp,
};

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  CASH: "Dinheiro",
  INVESTMENT: "Investimento",
};

export function AccountList({ accounts, allowManual = true, showIntegration = true }: { accounts: Account[]; allowManual?: boolean; showIntegration?: boolean }) {
  if (!accounts.length) {
    return <p className="muted px-5 py-8 text-center text-[0.8125rem]">Nada por aqui.</p>;
  }
  return (
    <ul className="space-y-3 sm:space-y-0 sm:divide-y 2xl:grid 2xl:grid-cols-2 2xl:gap-x-6 2xl:divide-y-0 2xl:[&>li]:border-b">
      {accounts.map((account) => (
        <Row key={account.id} account={account} allowManual={allowManual} showIntegration={showIntegration} />
      ))}
    </ul>
  );
}

function Row({ account, allowManual, showIntegration }: { account: Account; allowManual: boolean; showIntegration: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const Icon = ICONS[account.type] ?? Wallet;

  const negativo = account.balanceCents < 0;

  return (
    <li className={cn("min-w-0 rounded-xl border bg-[var(--surface)] px-3 py-3 transition-opacity sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-4", pending && "opacity-50")}>
      <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 sm:flex sm:flex-wrap">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text)]"
        >
          <Icon className="size-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <Link href={`/lancamentos?accountId=${encodeURIComponent(account.id)}`} title={`Ver lançamentos de ${account.name}`} className="inline-flex min-h-11 max-w-full items-center text-sm font-medium underline decoration-[var(--line-strong)] underline-offset-4">{account.name}</Link>
          <p title={`${TYPE_LABEL[account.type] ?? account.type}${account.institution ? ` · ${account.institution}` : ""} · ${account.transactionCount} lançamento(s)`} className="muted truncate text-xs">
            {TYPE_LABEL[account.type] ?? account.type}
            {account.institution ? ` · ${account.institution}` : ""}
            {` · ${account.transactionCount} lançamento(s)`}
          </p>
        </div>

        <div className="col-start-2 min-w-0 max-w-full sm:text-right">
          {account.financeMode === "integracao" && account.bankBalanceCents === null ? <span className="text-sm font-medium">Indisponível</span> : <Money
            cents={account.balanceCents}
            size="md"
            className="text-base font-semibold"
            tone={negativo ? "out" : undefined}
          />}
          <p className="muted text-xs">{account.financeMode === "integracao" ? `${showIntegration ? "Saldo bancário" : "Saldo atualizado"}${account.bankBalanceAt ? ` · ${formatDate(account.bankBalanceAt.slice(0, 10))}` : " indisponível"}` : "saldo atual"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {account.financeMode === "manual" ? <span className="muted">
          Inicial {formatCents(account.openingBalanceCents)}
          {account.openingBalanceDate ? ` em ${formatDate(account.openingBalanceDate)}` : ""}
        </span> : null}
        {account.financeMode === "manual" ? <span className="muted">
          + {formatCents(account.incomeCents)} entraram · − {formatCents(account.expenseCents)}{" "}
          saíram
        </span> : null}
        {saved ? (
          <span className="inline-flex items-center gap-1 text-[var(--text-in)]">
            <Check className="size-3.5" />
            salvo
          </span>
        ) : null}
        {allowManual && account.financeMode === "manual" ? <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="min-h-11 min-w-11 ml-auto cursor-pointer font-medium text-[var(--text-brand)] hover:underline"
        >
          {editing ? "Fechar" : "Ajustar saldo inicial"}
        </button> : null}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-[var(--text-out)]">{error}</p>}
      {editing && allowManual && account.financeMode === "manual" ? (
        <form
          className="mt-3 grid grid-cols-1 gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:grid-cols-[minmax(0,1fr)_1fr_auto] sm:items-end"
          action={(formData) => {
            start(async () => {
              setError("");
              const result = await saveOpeningBalance({
                accountId: account.id,
                amount: String(formData.get("amount") ?? "0"),
                date: String(formData.get("date") ?? "") || null,
              });
              if (result.error) { setError(result.error); return; }
              setEditing(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            });
          }}
        >
          <Field label="Saldo inicial (R$)">
            <Input className="min-h-12 min-w-0 max-w-full text-base!"
              name="amount"
              inputMode="decimal"
              defaultValue={formatCentsPlain(account.openingBalanceCents)}
            />
          </Field>
          <Field label="Nesta data" hint="Lançamentos anteriores param de contar.">
            <Input className="min-h-12 min-w-0 max-w-full text-base!" name="date" type="date" defaultValue={account.openingBalanceDate ?? ""} />
          </Field>
          <Button className="min-h-11 min-w-11" type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
      ) : null}
    </li>
  );
}
