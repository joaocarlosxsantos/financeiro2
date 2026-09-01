"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { generateRecurring } from "@/server/actions/recurring";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { monthRefToParam, type MonthRef } from "@/lib/dates";

/**
 * Aviso de recorrências que ainda não viraram lançamento no mês.
 * Um clique lança todas — nada é criado sem o usuário mandar.
 */
export function RecurringBanner({
  monthRef,
  monthName,
  count,
  incomeCents,
  expenseCents,
}: {
  monthRef: MonthRef;
  monthName: string;
  count: number;
  incomeCents: number;
  expenseCents: number;
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!count) return null;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-brand-200 p-4 dark:border-brand-400/30">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/12 dark:text-brand-300">
        <CalendarClock className="size-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-medium">
          {count} recorrência{count > 1 ? "s" : ""} ainda não lançada{count > 1 ? "s" : ""} em{" "}
          <span className="first-letter:uppercase">{monthName}</span>
        </p>
        <p className="muted mt-0.5 text-[0.8125rem]">
          {formatCents(incomeCents)} a entrar · {formatCents(expenseCents)} a sair
          {message ? ` — ${message}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/recorrentes?m=${monthRefToParam(monthRef)}`}
          className="rounded-xl px-3 py-2 text-[0.8125rem] font-medium hover:bg-[var(--surface-2)]"
        >
          Ver quais
        </Link>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const { created, error } = await generateRecurring(monthRef);
              setMessage(error ?? `${created} lançamento(s) criado(s).`);
            })
          }
        >
          {busy ? "Lançando..." : "Lançar todas"}
        </Button>
      </div>
    </div>
  );
}
