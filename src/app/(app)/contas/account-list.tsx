"use client";

import { useState, useTransition } from "react";
import { Check, CreditCard, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { saveOpeningBalance } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatCents, formatCentsPlain } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

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

export function AccountList({ accounts }: { accounts: Account[] }) {
  if (!accounts.length) {
    return <p className="muted px-5 py-8 text-center text-[0.8125rem]">Nada por aqui.</p>;
  }
  return (
    <ul className="divide-y">
      {accounts.map((account) => (
        <Row key={account.id} account={account} />
      ))}
    </ul>
  );
}

function Row({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const Icon = ICONS[account.type] ?? Wallet;

  const negativo = account.balanceCents < 0;

  return (
    <li className={cn("px-5 py-4 transition-opacity", pending && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${account.color} 14%, transparent)`,
            color: account.color,
          }}
        >
          <Icon className="size-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-medium">{account.name}</p>
          <p className="muted truncate text-xs">
            {TYPE_LABEL[account.type] ?? account.type}
            {account.institution ? ` · ${account.institution}` : ""}
            {` · ${account.transactionCount} lançamento(s)`}
          </p>
        </div>

        <div className="text-right">
          <p
            className="tnum text-[1.0625rem] font-semibold tracking-tight"
            style={negativo ? { color: "var(--text-out)" } : undefined}
          >
            {formatCents(account.balanceCents)}
          </p>
          <p className="muted text-xs">saldo atual</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="muted">
          Inicial {formatCents(account.openingBalanceCents)}
          {account.openingBalanceDate ? ` em ${formatDate(account.openingBalanceDate)}` : ""}
        </span>
        <span className="muted">
          + {formatCents(account.incomeCents)} entraram · − {formatCents(account.expenseCents)}{" "}
          saíram
        </span>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-[var(--text-in)]">
            <Check className="size-3.5" />
            salvo
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="ml-auto cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          {editing ? "Fechar" : "Ajustar saldo inicial"}
        </button>
      </div>

      {editing ? (
        <form
          className="mt-3 grid grid-cols-1 gap-3 rounded-xl border bg-[var(--surface-2)] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          action={(formData) => {
            start(async () => {
              await saveOpeningBalance({
                accountId: account.id,
                amount: String(formData.get("amount") ?? "0"),
                date: String(formData.get("date") ?? "") || null,
              });
              setEditing(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            });
          }}
        >
          <Field label="Saldo inicial (R$)">
            <Input
              name="amount"
              inputMode="decimal"
              defaultValue={formatCentsPlain(account.openingBalanceCents)}
            />
          </Field>
          <Field label="Nesta data" hint="Lançamentos anteriores param de contar.">
            <Input name="date" type="date" defaultValue={account.openingBalanceDate ?? ""} />
          </Field>
          <Button type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
      ) : null}
    </li>
  );
}
