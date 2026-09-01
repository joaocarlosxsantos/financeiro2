"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check } from "lucide-react";
import { generateRecurring } from "@/server/actions/recurring";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import type { MonthRef } from "@/lib/dates";

type Pending = {
  id: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  dayOfMonth: number;
  categoryName: string | null;
  categoryColor: string | null;
};

export function PendingPanel({
  monthRef,
  monthName,
  pending,
  incomeCents,
  expenseCents,
}: {
  monthRef: MonthRef;
  monthName: string;
  pending: Pending[];
  incomeCents: number;
  expenseCents: number;
}) {
  const [busy, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  function generate(ruleId?: string) {
    start(async () => {
      const { created, error } = await generateRecurring(monthRef, ruleId);
      setDone(error ?? `${created} lançamento(s) criado(s).`);
      setTimeout(() => setDone(null), 4000);
    });
  }

  return (
    <Card className="border-brand-200 dark:border-brand-400/30">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/12 dark:text-brand-300">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">
              {pending.length} recorrência(s) ainda não lançada(s) em{" "}
              <span className="first-letter:uppercase">{monthName}</span>
            </h2>
            <p className="muted mt-0.5 text-[0.8125rem]">
              {formatCents(incomeCents)} a entrar · {formatCents(expenseCents)} a sair
            </p>
          </div>
        </div>
        <Button onClick={() => generate()} disabled={busy}>
          {busy ? "Lançando..." : "Lançar todas"}
        </Button>
      </div>

      <ul className="divide-y rounded-xl border">
        {pending.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: p.categoryColor ?? "#94a3b8" }}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{p.description}</span>
            <span className="muted shrink-0 text-xs">dia {p.dayOfMonth}</span>
            <span
              className="tnum shrink-0 font-semibold"
              style={{
                color: p.kind === "INCOME" ? "var(--text-in)" : "var(--text-out)",
              }}
            >
              {p.kind === "INCOME" ? "+" : "−"} {formatCents(p.amountCents)}
            </span>
            <button
              type="button"
              onClick={() => generate(p.id)}
              disabled={busy}
              className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-[var(--surface-2)] dark:text-brand-300"
            >
              lançar
            </button>
          </li>
        ))}
      </ul>

      {done ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-in)]">
          <Check className="size-4" />
          {done}
        </p>
      ) : null}
    </Card>
  );
}
