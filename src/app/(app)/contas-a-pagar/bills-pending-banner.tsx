"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { generateBillsForMonth } from "@/server/actions/bills";
import { Button } from "@/components/ui/button";
import type { MonthRef } from "@/lib/dates";

export type PendingRule = { id: string; name: string };

/**
 * Aviso de contas recorrentes que ainda não têm registro neste mês. Um clique
 * cria a linha do mês para cada uma (valor começa em zero — o valor de cada
 * mês é preenchido depois, na própria conta). Nada é criado sem o usuário mandar.
 */
export function BillsPendingBanner({
  monthRef,
  monthName,
  pending,
}: {
  monthRef: MonthRef;
  monthName: string;
  pending: PendingRule[];
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!pending.length) return null;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-brand-200 p-4 dark:border-brand-400/30">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/12 dark:text-brand-300">
        <CalendarClock className="size-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-medium">
          {pending.length} conta{pending.length > 1 ? "s" : ""} recorrente{pending.length > 1 ? "s" : ""} ainda
          sem registro em <span className="first-letter:uppercase">{monthName}</span>
        </p>
        <p className="muted mt-0.5 truncate text-[0.8125rem]">
          {pending.map((r) => r.name).join(", ")}
          {message ? ` — ${message}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const { created, error } = await generateBillsForMonth(monthRef);
              setMessage(error ?? `${created} conta(s) criada(s) — falta preencher o valor.`);
            })
          }
        >
          {busy ? "Criando..." : "Criar deste mês"}
        </Button>
      </div>
    </div>
  );
}
