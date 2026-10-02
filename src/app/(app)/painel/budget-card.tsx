import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatCents } from "@/lib/money";
import { monthRefToParam, type MonthRef } from "@/lib/dates";
import type { BudgetOverview } from "@/server/queries";
import { cn } from "@/lib/cn";

export function BudgetCard({
  overview,
  monthRef,
  className,
}: {
  overview: BudgetOverview;
  monthRef: MonthRef;
  className?: string;
}) {
  const href = `/orcamento?m=${monthRefToParam(monthRef)}`;
  const hasBudgets = overview.totalLimitCents > 0;

  if (!hasBudgets) {
    return (
      <section aria-label="Orçamento do mês" className={cn("h-full", className)}>
        <div className="mb-3 flex items-baseline justify-between border-b border-[var(--line)] pb-2">
          <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Orçamento do mês
          </h2>
          <Link
            href={href}
            className="text-xs font-medium text-[var(--text-brand)] hover:underline"
          >
            Definir limites
          </Link>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed py-2">
          Nenhum limite definido ainda. Defina tetos por categoria para acompanhar seus gastos no mês.
        </p>
      </section>
    );
  }

  const usage = (overview.budgetedSpentCents / overview.totalLimitCents) * 100;
  const color =
    usage > 100
      ? "var(--color-money-out)"
      : usage >= 80
        ? "var(--color-variable)"
        : "var(--color-money-in)";

  const atRisk = overview.rows
    .filter((r) => r.status === "estourou" || r.status === "atencao")
    .slice(0, 3);

  return (
    <section aria-label="Orçamento do mês" className={cn("h-full", className)}>
      <div className="mb-3 flex items-baseline justify-between border-b border-[var(--line)] pb-2">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Orçamento do mês
        </h2>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--text-brand)] hover:underline"
        >
          Gerenciar
        </Link>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="tnum font-mono text-xl font-semibold tracking-tight text-[var(--text)]">
          {formatCents(overview.budgetedSpentCents)}
        </span>
        <span className="tnum font-mono text-xs text-[var(--text-muted)]">
          de {formatCents(overview.totalLimitCents)}
        </span>
      </div>
      <Progress
        label="Consumo do orçamento"
        value={usage}
        color={color}
        height={4}
      />

      {atRisk.length ? (
        <ul className="mt-3.5 space-y-2 text-xs" role="list">
          {atRisk.map((row) => (
            <li key={row.categoryId} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="truncate font-medium text-[var(--text)]">{row.name}</span>
              <span
                className="tnum font-mono ml-auto shrink-0 font-semibold"
                style={{
                  color: row.status === "estourou" ? "var(--text-out)" : "var(--text-warn)",
                }}
              >
                {row.usedPct}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Nenhuma categoria perto do limite.
        </p>
      )}

      {overview.unbudgetedSpentCents > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[0.6875rem] text-[var(--text-muted)]">
          <AlertTriangle className="size-3 shrink-0 text-[var(--text-warn)]" />
          <span>{formatCents(overview.unbudgetedSpentCents)} em categorias sem limite.</span>
        </p>
      ) : null}
    </section>
  );
}
