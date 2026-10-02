import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { formatCents, pct } from "@/lib/money";
import type { DebtOverview } from "@/server/queries";
import { cn } from "@/lib/cn";

export function DebtCard({
  overview,
  incomeCents,
  className,
}: {
  overview: DebtOverview;
  incomeCents: number;
  className?: string;
}) {
  if (!overview.debts.length) return null;

  const share = incomeCents ? pct(overview.totalMonthlyInterestCents, incomeCents) : 0;

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}
      aria-label="Impacto das dívidas"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-money-out-soft)] text-[var(--text-out)]"
          aria-hidden="true"
        >
          <TrendingDown className="size-4" />
        </span>
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Saldo devedor
          </p>
          <p className="tnum font-mono text-base font-semibold tracking-tight text-[var(--text)]">
            {formatCents(overview.totalBalanceCents)}
          </p>
        </div>
      </div>

      <div className="border-l border-[var(--line)] pl-4">
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Juros por mês
        </p>
        <p className="tnum font-mono text-base font-semibold text-[var(--text-out)]">
          {formatCents(overview.totalMonthlyInterestCents)}
          {share > 0 ? (
            <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
              ({share}% da renda)
            </span>
          ) : null}
        </p>
      </div>

      <div className="ml-auto">
        <Link
          href="/dividas"
          className="inline-flex h-7 items-center rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
        >
          Ver plano de quitação
        </Link>
      </div>
    </div>
  );
}
