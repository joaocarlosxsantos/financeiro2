"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Sparkles, TrendingUp } from "lucide-react";
import { applyAllBudgetSuggestions, applyBudgetSuggestion, setBudget } from "@/server/actions/budgets";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  const confirm = useConfirm();
  const [applyingAll, startTransition] = useTransition();

  if (!rows.length) {
    return (
      <p className="muted px-5 py-10 text-center text-[0.8125rem]">
        Nenhuma categoria de gasto com movimento ou limite neste mês.
      </p>
    );
  }

  const rowsWithSuggestion = rows.filter(
    (r) =>
      r.suggestedLimitCents !== null &&
      r.suggestedLimitCents !== undefined &&
      r.suggestedLimitCents > 0,
  );

  async function handleApplyAll() {
    if (!rowsWithSuggestion.length) return;
    const willOverwrite = rowsWithSuggestion.filter(
      (r) => r.limitCents !== null && r.limitCents !== r.suggestedLimitCents,
    );

    const ok = await confirm({
      title: "Aplicar todas as sugestões?",
      description:
        willOverwrite.length > 0
          ? `Deseja aplicar as sugestões em ${rowsWithSuggestion.length} categoria(s)? ${willOverwrite.length} categoria(s) já possuem limite definido e serão atualizadas.`
          : `Deseja definir o limite sugerido para as ${rowsWithSuggestion.length} categoria(s)?`,
      confirmLabel: "Aplicar todas",
    });

    if (!ok) return;

    startTransition(async () => {
      await applyAllBudgetSuggestions(
        monthRef,
        rowsWithSuggestion.map((r) => ({
          categoryId: r.categoryId,
          limitCents: r.suggestedLimitCents!,
        })),
      );
    });
  }

  return (
    <div>
      {rowsWithSuggestion.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--surface-2)]/40 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Sparkles className="size-3.5 text-[var(--color-brand)]" aria-hidden="true" />
            <span>Sugestões calculadas com base na média dos últimos 3 meses fechados.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={applyingAll}
            onClick={handleApplyAll}
            className="min-h-9 text-xs font-medium"
          >
            {applyingAll ? "Aplicando..." : `Aplicar todas (${rowsWithSuggestion.length})`}
          </Button>
        </div>
      ) : null}

      <ul className="space-y-3 sm:space-y-0 sm:divide-y 2xl:grid 2xl:grid-cols-2 2xl:gap-x-6 2xl:divide-y-0 2xl:[&>li]:border-b">
        {rows.map((row) => (
          <Row key={row.categoryId} row={row} monthRef={monthRef} />
        ))}
      </ul>
    </div>
  );
}

function Row({ row, monthRef }: { row: BudgetRow; monthRef: MonthRef }) {
  const confirm = useConfirm();
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

  async function handleApplySuggestion() {
    if (!row.suggestedLimitCents) return;
    if (row.limitCents !== null && row.limitCents !== row.suggestedLimitCents) {
      const ok = await confirm({
        title: `Substituir limite de ${row.name}?`,
        description: `O limite atual é ${formatCents(row.limitCents)}. Deseja substituir pela sugestão de ${formatCents(row.suggestedLimitCents)} (${row.suggestionLabel})?`,
        confirmLabel: "Substituir limite",
      });
      if (!ok) return;
    }

    start(async () => {
      await applyBudgetSuggestion({
        categoryId: row.categoryId,
        year: monthRef.year,
        month: monthRef.month,
        limitCents: row.suggestedLimitCents!,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  const projetaEstouro =
    row.limitCents !== null && row.status !== "estourou" && row.projectedCents > row.limitCents;

  const hasSuggestion = Boolean(row.suggestedLimitCents && row.suggestedLimitCents > 0);

  return (
    <li
      className={cn(
        "min-w-0 rounded-xl border bg-[var(--surface)] px-3 py-3 transition-opacity sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-4",
        pending && "opacity-50",
      )}
    >
      <div className="mb-2.5 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
        <span title={row.name} className="min-w-0 truncate text-[0.875rem] font-medium">
          {row.name}
        </span>
        {row.nature === "FIXED" ? (
          <span className="muted rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-medium ring-1 ring-[var(--border)] ring-inset">
            fixo
          </span>
        ) : null}

        <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-2">
          <span className="tnum w-full break-all text-[0.875rem] font-semibold sm:w-auto">
            {formatCents(row.spentCents)}
          </span>
          <span className="muted text-[0.8125rem]">de</span>
          <div className="relative min-w-0 flex-1 sm:ml-auto sm:flex-none">
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
              className="input-base tnum min-h-12 min-w-0 max-w-full w-full py-0 pl-8 text-right text-base! sm:w-40"
            />
          </div>
          <span className="w-4 shrink-0">
            {saved ? <Check className="size-4 text-[var(--text-in)]" /> : null}
          </span>
        </div>
      </div>

      {hasSuggestion ? (
        <div className="mb-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/60 px-2.5 py-1.5 text-xs">
          <span className="text-[var(--text-muted)]">
            sugerido{" "}
            <strong className="font-semibold text-[var(--foreground)]">
              {formatCents(row.suggestedLimitCents!)}
            </strong>{" "}
            <span className="text-[0.6875rem] text-[var(--text-muted)]">
              ({row.suggestionLabel})
            </span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={handleApplySuggestion}
            className="inline-flex min-h-7 items-center rounded px-2 py-0.5 text-xs font-medium text-[var(--text-brand)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 cursor-pointer"
          >
            Aplicar sugestão
          </button>
        </div>
      ) : null}

      {row.limitCents !== null ? (
        <>
          <Progress
            label={`${row.name}: ${row.usedPct}% do limite`}
            value={row.usedPct}
            color={color}
            height={7}
          />
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs [overflow-wrap:anywhere]">
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
