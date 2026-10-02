"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, CreditCard, Repeat, Trash2, Users } from "lucide-react";
import {
  deleteTransaction,
  setTransactionCategory,
  setTransactionTransfer,
} from "@/server/actions/transactions";
import { formatCents } from "@/lib/money";
import { formatDayMonth } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SplitDialog } from "./split-dialog";
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
    <div className="divide-y divide-[var(--line)]">
      {grouped.map(([date, items]) => {
        const dayTotalCents = items
          .filter((t) => !t.isTransfer)
          .reduce(
            (acc, t) => acc + (t.kind === "INCOME" ? t.amountCents : -t.amountCents),
            0,
          );
        return (
          <div key={date}>
            <div className="flex items-center justify-between border-y border-[var(--line)] bg-[var(--surface-2)]/80 px-4 py-1.5 text-xs font-medium text-[var(--text-muted)]">
              <span className="capitalize">{formatDayMonth(date)}</span>
              <span
                className={cn(
                  "tnum font-mono text-xs font-semibold",
                  dayTotalCents > 0
                    ? "text-[var(--text-in)]"
                    : dayTotalCents < 0
                      ? "text-[var(--text-out)]"
                      : "text-[var(--text-muted)]",
                )}
              >
                {dayTotalCents > 0 ? "+" : dayTotalCents < 0 ? "−" : ""}{" "}
                {formatCents(Math.abs(dayTotalCents))}
              </span>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {items.map((t) => (
                <Row key={t.id} tx={t} categories={categories} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Row({ tx, categories }: { tx: PlainTransaction; categories: PlainCategory[] }) {
  const [pending, start] = useTransition();
  const [splitOpen, setSplitOpen] = useState(false);
  const confirm = useConfirm();
  const options = categories.filter((c) => c.kind === tx.kind);
  const canSplit = tx.kind === "EXPENSE" && !tx.isTransfer;
  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5 transition-opacity", pending && "opacity-50")}>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: tx.categoryColor ?? "var(--text-muted)" }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium text-[var(--text)]">{tx.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
          <select
            aria-label="Categoria"
            value={tx.categoryId ?? ""}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setTransactionCategory(tx.id, e.target.value || null);
              })
            }
            className="cursor-pointer rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text)]"
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
              className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-brand)]"
              title="Movimento entre contas suas — fora dos totais"
            >
              <ArrowLeftRight className="size-3" />
              transferência
            </span>
          ) : tx.kind === "EXPENSE" ? (
            <span className="rounded-[var(--radius-xs)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] ring-1 ring-[var(--border)] ring-inset">
              {tx.nature === "FIXED" ? "fixo" : "variável"}
            </span>
          ) : null}
          {tx.isCard && !tx.isTransfer ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--color-warn-soft)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-warn)]"
              title="Compra no cartão — demonstrativo"
            >
              <CreditCard className="size-3" />
              cartão
            </span>
          ) : null}
          {tx.installmentNumber && tx.installmentTotal ? (
            <span
              className="rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-brand)]"
              title="Compra parcelada"
            >
              parcela {tx.installmentNumber}/{tx.installmentTotal}
            </span>
          ) : null}
          {tx.recurringRuleId ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] ring-1 ring-[var(--border)] ring-inset"
              title="Gerado por uma recorrência"
            >
              <Repeat className="size-3" />
              recorrente
            </span>
          ) : null}
          {isSplit ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-brand)]"
              title={tx.splits!.map((s) => `${s.name}: ${formatCents(s.amountCents)}`).join(", ")}
            >
              <Users className="size-3" />
              dividido com {tx.splits!.length}
            </span>
          ) : null}
          <span className="truncate text-[0.6875rem]">{tx.accountName}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={cn(
            "tnum font-mono block text-sm font-semibold",
            tx.isTransfer
              ? "text-[var(--text-muted)]"
              : tx.kind === "INCOME"
                ? "text-[var(--text-in)]"
                : "text-[var(--text-out)]",
          )}
        >
          {tx.isTransfer ? "" : tx.kind === "INCOME" ? "+" : "−"} {formatCents(tx.amountCents)}
        </span>
        {isSplit ? (
          <span
            className="tnum font-mono block text-[0.6875rem] text-[var(--text-muted)]"
            title="Sua parte nesta despesa"
          >
            sua parte: {formatCents(tx.myShareCents ?? tx.amountCents)}
          </span>
        ) : null}
      </div>

      {canSplit ? (
        <button
          type="button"
          aria-label={
            isSplit
              ? `Editar divisão de ${tx.description}`
              : `Dividir ${tx.description}`
          }
          title={
            isSplit
              ? `Dividido com ${tx.splits!.length} pessoa(s). Clique para editar`
              : "Dividir despesa com outras pessoas"
          }
          disabled={pending}
          onClick={() => setSplitOpen(true)}
          className={cn(
            "shrink-0 cursor-pointer rounded-[var(--radius-xs)] p-1.5 transition-colors hover:bg-[var(--surface-2)]",
            isSplit ? "text-[var(--text-brand)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Users className="size-3.5" />
        </button>
      ) : null}

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
          "shrink-0 cursor-pointer rounded-[var(--radius-xs)] p-1.5 transition-colors hover:bg-[var(--surface-2)]",
          tx.isTransfer ? "text-[var(--text-brand)]" : "text-[var(--text-muted)]",
        )}
      >
        <ArrowLeftRight className="size-3.5" />
      </button>

      <button
        type="button"
        aria-label={`Excluir ${tx.description}`}
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Excluir "${tx.description}"?`,
            confirmLabel: "Excluir",
            tone: "danger",
          });
          if (!ok) return;
          start(async () => {
            await deleteTransaction(tx.id);
          });
        }}
        className="shrink-0 cursor-pointer rounded-[var(--radius-xs)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
      >
        <Trash2 className="size-3.5" />
      </button>

      {splitOpen ? (
        <SplitDialog
          isOpen={splitOpen}
          onClose={() => setSplitOpen(false)}
          transaction={tx}
          initialSplits={tx.splits}
        />
      ) : null}
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
