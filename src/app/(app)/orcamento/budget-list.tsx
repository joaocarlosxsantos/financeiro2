"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, TrendingUp } from "lucide-react";
import { setBudget } from "@/server/actions/budgets";
import { Progress } from "@/components/ui/progress";
import { formatCents, formatCentsPlain } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { BudgetRow, BudgetStatus } from "@/server/queries";
import type { MonthRef } from "@/lib/dates";

/** Cor da barra — marca, mínimo de 3:1. */
const STATUS_COLOR: Record<BudgetStatus, string> = {
  ok: "var(--color-money-in)",
  atencao: "var(--color-variable)",
  estourou: "var(--color-money-out)",
  "sem-limite": "var(--text-muted)",
};

/** Mesma semântica, escurecida para uso em texto (mínimo de 4.5:1). */
const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: "var(--text-in)",
  atencao: "var(--text-warn)",
  estourou: "var(--text-out)",
  "sem-limite": "var(--text-muted)",
};

export function BudgetList({ rows, monthRef }: { rows: BudgetRow[]; monthRef: MonthRef }) {
  if (!rows.length) {
    return (
      <p className="muted px-5 py-10 text-center text-[0.8125rem]">
        Nenhuma categoria de gasto com movimento ou limite neste mês.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <Row key={row.categoryId} row={row} monthRef={monthRef} />
      ))}
    </ul>
  );
}

function Row({ row, monthRef }: { row: BudgetRow; monthRef: MonthRef }) {
  const serverValue = row.limitCents === null ? "" : formatCentsPlain(row.limitCents);

  const [value, setValue] = useState(serverValue);
  const [syncedWith, setSyncedWith] = useState(serverValue);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  // O limite pode mudar por fora deste input (sugerir pelo histórico, copiar do
  // mês anterior, troca de mês). Quando isso acontece, o campo acompanha.
  if (serverValue !== syncedWith) {
    setSyncedWith(serverValue);
    setValue(serverValue);
  }

  const color = STATUS_COLOR[row.status];
  const textColor = STATUS_TEXT[row.status];

  function save() {
    if (value.trim() === serverValue.trim()) return;

    start(async () => {
      await setBudget({
        categoryId: row.categoryId,
        year: monthRef.year,
        month: monthRef.month,
        amount: value.trim() || "0",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  const projetaEstouro =
    row.limitCents !== null && row.status !== "estourou" && row.projectedCents > row.limitCents;

  return (
    <li className={cn("px-5 py-4 transition-opacity", pending && "opacity-50")}>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
        <span className="text-[0.875rem] font-medium">{row.name}</span>
        {row.nature === "FIXED" ? (
          <span className="muted rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-[var(--border)] ring-inset">
            fixo
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="tnum text-[0.875rem] font-semibold">{formatCents(row.spentCents)}</span>
          <span className="muted text-[0.8125rem]">de</span>
          <div className="relative">
            <span className="muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
              R$
            </span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              inputMode="decimal"
              placeholder="sem limite"
              aria-label={`Limite mensal de ${row.name}`}
              className="input-base tnum h-9 w-24 py-0 pl-8 text-right text-[0.8125rem] sm:w-32"
            />
          </div>
          <span className="w-4 shrink-0">
            {saved ? <Check className="size-4 text-[var(--text-in)]" /> : null}
          </span>
        </div>
      </div>

      {row.limitCents !== null ? (
        <>
          <Progress
            label={`${row.name}: ${row.usedPct}% do limite`}
            value={row.usedPct}
            color={color}
            height={7}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="tnum font-medium" style={{ color: textColor }}>
              {row.usedPct}% do limite
            </span>
            <span className="muted tnum">
              {row.remainingCents >= 0
                ? `ainda cabem ${formatCents(row.remainingCents)}`
                : `passou ${formatCents(Math.abs(row.remainingCents))}`}
            </span>
            {projetaEstouro ? (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--text-warn)]">
                <TrendingUp className="size-3.5" />
                No ritmo atual fecha em {formatCents(row.projectedCents)}
              </span>
            ) : null}
            {row.status === "estourou" ? (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--text-out)]">
                <AlertTriangle className="size-3.5" />
                Limite estourado
              </span>
            ) : null}
          </div>
        </>
      ) : row.spentCents > 0 ? (
        <p className="muted text-xs">
          Sem limite definido — este gasto não entra no acompanhamento do orçamento.
        </p>
      ) : null}
    </li>
  );
}
