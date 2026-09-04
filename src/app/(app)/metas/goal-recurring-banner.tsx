"use client";

import { useState, useTransition } from "react";
import { PiggyBank } from "lucide-react";
import { generateGoalRecurring } from "@/server/actions/goal-recurring";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { currentMonthRef } from "@/lib/dates";

/**
 * Aviso de aportes automáticos que ainda não caíram na meta este mês —
 * mesmo espírito do RecurringBanner de lançamentos, só que para metas.
 */
export function GoalRecurringBanner({
  count,
  amountCents,
}: {
  count: number;
  amountCents: number;
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!count) return null;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-cyan-200 p-4 dark:border-cyan-400/30">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-300">
        <PiggyBank className="size-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-medium">
          {count} aporte{count > 1 ? "s" : ""} automático{count > 1 ? "s" : ""} ainda não{" "}
          {count > 1 ? "caíram" : "caiu"} este mês
        </p>
        <p className="muted mt-0.5 text-[0.8125rem]">
          {formatCents(amountCents)} no total{message ? ` — ${message}` : ""}
        </p>
      </div>

      <Button
        size="sm"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const { created, error } = await generateGoalRecurring(currentMonthRef());
            setMessage(error ?? `${created} aporte(s) lançado(s).`);
          })
        }
      >
        {busy ? "Lançando..." : "Lançar todos"}
      </Button>
    </div>
  );
}
