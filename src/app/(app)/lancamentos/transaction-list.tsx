"use client";

import { useTransition } from "react";
import { ArrowLeftRight, Repeat, Trash2 } from "lucide-react";
import {
  deleteTransaction,
  setTransactionCategory,
  setTransactionTransfer,
} from "@/server/actions/transactions";
import { formatCents } from "@/lib/money";
import { formatDayMonth } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { PlainAccount, PlainCategory, PlainTransaction } from "./types";

export function TransactionList({
  transactions,
  categories,
}: {
  transactions: PlainTransaction[];
  categories: PlainCategory[];
  accounts: PlainAccount[];
}) {
  const grouped = groupByDate(transactions);

  return (
    <div className="divide-y">
      {grouped.map(([date, items]) => (
        <div key={date}>
          <div className="muted flex items-center justify-between bg-[var(--surface-2)] px-5 py-2 text-xs font-medium">
            <span className="capitalize">{formatDayMonth(date)}</span>
            <span className="tnum">
              {formatCents(
                items
                  .filter((t) => !t.isTransfer)
                  .reduce(
                    (acc, t) => acc + (t.kind === "INCOME" ? t.amountCents : -t.amountCents),
                    0,
                  ),
              )}
            </span>
          </div>
          <ul className="divide-y">
            {items.map((t) => (
              <Row key={t.id} tx={t} categories={categories} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Row({ tx, categories }: { tx: PlainTransaction; categories: PlainCategory[] }) {
  const [pending, start] = useTransition();
  const options = categories.filter((c) => c.kind === tx.kind);

  return (
    <li className={cn("flex items-center gap-3 px-5 py-3.5 transition-opacity", pending && "opacity-50")}>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: tx.categoryColor ?? "#94a3b8" }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium">{tx.description}</p>
        <div className="muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <select
            aria-label="Categoria"
            value={tx.categoryId ?? ""}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setTransactionCategory(tx.id, e.target.value || null);
              })
            }
            className="cursor-pointer rounded-md border bg-[var(--surface-2)] px-1.5 py-0.5 text-xs"
          >
            <option value="">Sem categoria</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {tx.isTransfer ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-1.5 py-0.5 font-medium text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-300"
              title="Movimento entre contas suas — fora dos totais"
            >
              <ArrowLeftRight className="size-3" />
              transferência
            </span>
          ) : tx.kind === "EXPENSE" ? (
            <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 ring-1 ring-[var(--border)] ring-inset">
              {tx.nature === "FIXED" ? "fixo" : "variável"}
            </span>
          ) : null}
          {tx.installmentNumber && tx.installmentTotal ? (
            <span
              className="rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700 dark:bg-brand-500/12 dark:text-brand-300"
              title="Compra parcelada"
            >
              parcela {tx.installmentNumber}/{tx.installmentTotal}
            </span>
          ) : null}
          {tx.recurringRuleId ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 ring-1 ring-[var(--border)] ring-inset"
              title="Gerado por uma recorrência"
            >
              <Repeat className="size-3" />
              recorrente
            </span>
          ) : null}
          <span className="truncate">{tx.accountName}</span>
        </div>
      </div>

      <span
        className={cn(
          "tnum shrink-0 text-[0.9375rem] font-semibold",
          tx.isTransfer
            ? "muted"
            : tx.kind === "INCOME"
              ? "text-[var(--text-in)]"
              : "text-[var(--text-out)]",
        )}
      >
        {tx.isTransfer ? "" : tx.kind === "INCOME" ? "+" : "−"} {formatCents(tx.amountCents)}
      </span>

      <button
        type="button"
        aria-label={
          tx.isTransfer
            ? `Voltar a contar ${tx.description} nos totais`
            : `Marcar ${tx.description} como transferência`
        }
        title={
          tx.isTransfer
            ? "Voltar a contar nos totais"
            : "Marcar como transferência entre contas suas"
        }
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setTransactionTransfer(tx.id, !tx.isTransfer);
          })
        }
        className={cn(
          "shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-2)]",
          tx.isTransfer ? "text-cyan-600 dark:text-cyan-300" : "muted",
        )}
      >
        <ArrowLeftRight className="size-4" />
      </button>

      <button
        type="button"
        aria-label={`Excluir ${tx.description}`}
        disabled={pending}
        onClick={() => {
          if (!confirm(`Excluir "${tx.description}"?`)) return;
          start(async () => {
            await deleteTransaction(tx.id);
          });
        }}
        className="muted shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function groupByDate(items: PlainTransaction[]): [string, PlainTransaction[]][] {
  const map = new Map<string, PlainTransaction[]>();
  for (const t of items) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return [...map.entries()];
}
