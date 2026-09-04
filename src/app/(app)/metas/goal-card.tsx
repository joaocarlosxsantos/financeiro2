"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { contributeToGoal, deleteGoal } from "@/server/actions/goals";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatCents, pct } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
}: {
  goal: PlainGoal;
  monthsAtCurrentPace: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const progress = goal.targetCents ? (goal.savedCents / goal.targetCents) * 100 : 0;
  const done = goal.savedCents >= goal.targetCents;

  return (
    <div className={cn("px-5 py-5 transition-opacity", pending && "opacity-50")}>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: goal.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold">{goal.name}</h3>
            <span className="muted rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-[var(--border)] ring-inset">
              {KIND_LABEL[goal.kind] ?? "Meta"}
            </span>
            {done ? (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300">
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
            start(async () => void (await deleteGoal(goal.id)));
          }}
          className="muted shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="tnum text-lg font-semibold">{formatCents(goal.savedCents)}</span>
        <span className="muted tnum text-[0.8125rem]">
          {pct(goal.savedCents, goal.targetCents)}% de {formatCents(goal.targetCents)}
        </span>
      </div>
      <Progress value={progress} color={goal.color} label={`Progresso da meta ${goal.name}`} />

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
          className="ml-auto cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-300"
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
            <Input name="amount" inputMode="decimal" placeholder="0,00" required />
          </div>
          <input type="hidden" name="mode" value="add" />
          <Button type="submit" size="sm">
            Guardar
          </Button>
          <Button type="submit" name="mode" value="withdraw" variant="outline" size="sm">
            Resgatar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
