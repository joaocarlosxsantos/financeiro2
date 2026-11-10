"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { contributeToGoal, deleteGoal } from "@/server/actions/goals";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/field";
import { formatCents, pct } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { monthlySavingsNeeded } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/hint";
import { GoalRecurringControl, type PlainGoalRecurringRule } from "./goal-recurring-control";

const KIND_LABEL: Record<string, string> = {
  EMERGENCY_FUND: "Reserva",
  PURCHASE: "Compra",
  TRIP: "Viagem",
  DEBT_PAYOFF: "Quitar dívida",
  INVESTMENT: "Investimento",
  CUSTOM: "Meta",
};

export type PlainGoal = {
  id: string;
  name: string;
  kind: string;
  targetCents: number;
  savedCents: number;
  targetDate: string | null;
  color: string;
  note: string | null;
};

export function GoalCard({
  goal,
  monthsAtCurrentPace,
  recurringRule,
}: {
  goal: PlainGoal;
  monthsAtCurrentPace: number | null;
  recurringRule?: PlainGoalRecurringRule | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const progress = goal.targetCents ? (goal.savedCents / goal.targetCents) * 100 : 0;
  const done = goal.savedCents >= goal.targetCents;
  const savingsNeeded = !done ? monthlySavingsNeeded(goal.targetCents, goal.savedCents, goal.targetDate) : null;

  return (
    <div className={cn("min-w-0 rounded-xl border bg-[var(--surface)] px-3 py-3 transition-opacity sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-5", pending && "opacity-50")}>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: "var(--text-info)" }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 title={goal.name} className="min-w-0 break-words text-[0.9375rem] font-semibold [overflow-wrap:anywhere]">{goal.name}</h3>
            <span className="muted rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-medium ring-1 ring-[var(--border)] ring-inset">
              {KIND_LABEL[goal.kind] ?? "Meta"}
            </span>
            {done ? (
              <span className="rounded-md bg-[var(--color-money-in-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-in)]">
                concluída
              </span>
            ) : null}
          </div>
          {goal.note ? <p className="muted mt-1 text-[0.8125rem] leading-snug">{goal.note}</p> : null}
        </div>
        <button
          type="button"
          aria-label={`Excluir meta ${goal.name}`}
          onClick={async () => {
            const ok = await confirm({
              title: `Excluir a meta "${goal.name}"?`,
              confirmLabel: "Excluir",
              tone: "danger",
            });
            if (!ok) return;
            start(async () => {
              const result = await deleteGoal(goal.id);
              if (result.error) {
                setError(result.error);
              }
            });
          }}
          className="inline-flex items-center justify-center min-h-11 min-w-11 muted shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3" role="alert">
          <Hint tone="warn" className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="min-h-11 min-w-11 ml-auto text-[0.75rem] font-medium hover:underline"
            >
              Fechar
            </button>
          </Hint>
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-3">
        <span className="tnum break-all text-lg font-semibold">{formatCents(goal.savedCents)}</span>
        <span className="muted tnum text-[0.8125rem]">
          {pct(goal.savedCents, goal.targetCents)}% de {formatCents(goal.targetCents)}
        </span>
      </div>
      <Progress value={progress} color={done ? "var(--text-in)" : "var(--text-info)"} label={`Progresso da meta ${goal.name}`} />

      {savingsNeeded !== null && savingsNeeded > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[var(--text-brand)]">Quanto guardar por mês:</span>
            <strong className="tnum font-semibold text-[var(--text-primary)]">{formatCents(savingsNeeded)}/mês</strong>
          </div>
          {goal.targetDate ? <span className="muted">para atingir até {formatDate(goal.targetDate)}</span> : null}
        </div>
      ) : null}

      <div className="muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>Falta {formatCents(Math.max(0, goal.targetCents - goal.savedCents))}</span>
        {goal.targetDate ? <span>Prazo: {formatDate(goal.targetDate)}</span> : null}
        {!done && monthsAtCurrentPace !== null ? (
          <span>
            No ritmo atual: ~{monthsAtCurrentPace} {monthsAtCurrentPace === 1 ? "mês" : "meses"}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-h-11 min-w-11 ml-auto cursor-pointer font-medium text-[var(--text-brand)] hover:underline"
        >
          {open ? "Fechar" : "Registrar aporte"}
        </button>
      </div>

      {open ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border bg-[var(--surface-2)] p-3"
          action={async (formData) => {
            await contributeToGoal(goal.id, formData);
            setOpen(false);
          }}
        >
          <div className="min-w-36 flex-1">
            <label className="mb-1.5 block text-xs font-medium">Valor</label>
            <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="amount" inputMode="decimal" placeholder="0,00" required />
          </div>
          <Button className="min-h-11 min-w-11" type="submit" name="mode" value="add" size="sm">
            Guardar
          </Button>
          <Button className="min-h-11 min-w-11" type="submit" name="mode" value="withdraw" variant="outline" size="sm">
            Resgatar
          </Button>
        </form>
      ) : null}

      <GoalRecurringControl goalId={goal.id} rule={recurringRule ?? null} />
    </div>
  );
}
