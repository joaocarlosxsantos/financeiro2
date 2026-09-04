"use client";

import { useTransition } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { deleteRecurringRule, toggleRecurringRule } from "@/server/actions/recurring";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { MonthRef } from "@/lib/dates";

type Rule = {
  id: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  dayOfMonth: number;
  active: boolean;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string;
  generated: boolean;
  dueThisMonth: boolean;
  endYear: number | null;
  endMonth: number | null;
};

export function RuleList({ rules }: { rules: Rule[]; monthRef: MonthRef }) {
  return (
    <ul className="divide-y">
      {rules.map((rule) => (
        <Row key={rule.id} rule={rule} />
      ))}
    </ul>
  );
}

function statusOf(rule: Rule): { label: string; className: string } {
  if (!rule.active) {
    return { label: "pausada", className: "bg-[var(--surface-2)] text-[var(--text-muted)]" };
  }
  if (rule.generated) {
    return {
      label: "lançada no mês",
      className:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
    };
  }
  if (rule.dueThisMonth) {
    return {
      label: "pendente",
      className: "bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300",
    };
  }
  return { label: "fora do período", className: "bg-[var(--surface-2)] text-[var(--text-muted)]" };
}

function Row({ rule }: { rule: Rule }) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const status = statusOf(rule);

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", pending && "opacity-50")}>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: rule.categoryColor ?? "#94a3b8" }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[0.875rem] font-medium">{rule.description}</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium", status.className)}>
            {status.label}
          </span>
        </div>
        <p className="muted mt-1 truncate text-xs">
          todo dia {rule.dayOfMonth} · {rule.categoryName ?? "sem categoria"} · {rule.accountName}
          {rule.endYear && rule.endMonth
            ? ` · até ${String(rule.endMonth).padStart(2, "0")}/${rule.endYear}`
            : ""}
        </p>
      </div>

      <span
        className="tnum shrink-0 text-[0.9375rem] font-semibold"
        style={{
          color: rule.kind === "INCOME" ? "var(--text-in)" : "var(--text-out)",
        }}
      >
        {rule.kind === "INCOME" ? "+" : "−"} {formatCents(rule.amountCents)}
      </span>

      <button
        type="button"
        aria-label={rule.active ? `Pausar ${rule.description}` : `Retomar ${rule.description}`}
        title={rule.active ? "Pausar" : "Retomar"}
        disabled={pending}
        onClick={() => start(async () => void (await toggleRecurringRule(rule.id, !rule.active)))}
        className="muted shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-[var(--surface-2)]"
      >
        {rule.active ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <button
        type="button"
        aria-label={`Excluir ${rule.description}`}
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Excluir a recorrência "${rule.description}"?`,
            description: "Os lançamentos já criados continuam no histórico.",
            confirmLabel: "Excluir",
            tone: "danger",
          });
          if (!ok) return;
          start(async () => void (await deleteRecurringRule(rule.id)));
        }}
        className="muted shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
