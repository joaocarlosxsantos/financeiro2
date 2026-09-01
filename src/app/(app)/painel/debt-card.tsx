import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { formatCents, pct } from "@/lib/money";
import type { DebtOverview } from "@/server/queries";

/**
 * Só aparece para quem tem dívida cadastrada.
 * O número que importa aqui não é o saldo — é o quanto os juros levam por mês.
 */
export function DebtCard({
  overview,
  incomeCents,
}: {
  overview: DebtOverview;
  incomeCents: number;
}) {
  if (!overview.debts.length) return null;

  const share = incomeCents ? pct(overview.totalMonthlyInterestCents, incomeCents) : 0;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300">
        <TrendingDown className="size-5" />
      </span>

      <div>
        <p className="muted text-[0.8125rem]">Saldo devedor</p>
        <p className="tnum text-xl font-semibold tracking-tight">
          {formatCents(overview.totalBalanceCents)}
        </p>
      </div>

      <div>
        <p className="muted text-[0.8125rem]">Juros por mês</p>
        <p className="tnum text-xl font-semibold tracking-tight text-[var(--text-out)]">
          {formatCents(overview.totalMonthlyInterestCents)}
        </p>
      </div>

      <p className="muted min-w-48 flex-1 text-[0.8125rem] leading-snug">
        {overview.totalMonthlyInterestCents > 0 ? (
          <>
            Esse é o valor que some todo mês sem você comprar nada
            {share > 0 ? ` — ${share}% da sua renda` : ""}.
          </>
        ) : (
          <>Informe a taxa de juros de cada dívida para ver quanto elas custam por mês.</>
        )}
      </p>

      <Link
        href="/dividas"
        className="inline-flex h-10 shrink-0 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        Ver plano de quitação
      </Link>
    </div>
  );
}
