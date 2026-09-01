import Link from "next/link";
import { AlertTriangle, PiggyBank } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCents } from "@/lib/money";
import { monthRefToParam, type MonthRef } from "@/lib/dates";
import type { BudgetOverview } from "@/server/queries";

/** Resumo do orçamento no painel — mostra o que precisa de atenção agora. */
export function BudgetCard({ overview, monthRef }: { overview: BudgetOverview; monthRef: MonthRef }) {
  const href = `/orcamento?m=${monthRefToParam(monthRef)}`;
  const hasBudgets = overview.totalLimitCents > 0;

  if (!hasBudgets) {
    return (
      <Card>
        <CardHeader title="Orçamento do mês" subtitle="Nenhum limite definido ainda." />
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
            <PiggyBank className="size-5 opacity-60" />
          </div>
          <p className="muted mb-4 max-w-xs text-[0.8125rem] leading-relaxed">
            Um teto por categoria é o que transforma &ldquo;preciso gastar menos&rdquo; em um número que
            dá para acompanhar durante o mês.
          </p>
          <Link
            href={href}
            className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            Definir meus limites
          </Link>
        </div>
      </Card>
    );
  }

  const usage = (overview.budgetedSpentCents / overview.totalLimitCents) * 100;
  // A barra usa a cor de marca (mínimo 3:1); o texto usa a versão escurecida.
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
    <Card>
      <CardHeader
        title="Orçamento do mês"
        subtitle="Quanto dos seus limites já foi consumido."
        action={
          <Link
            href={href}
            className="text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Gerenciar
          </Link>
        }
      />

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="tnum text-2xl font-semibold tracking-tight">
          {formatCents(overview.budgetedSpentCents)}
        </span>
        <span className="muted tnum text-[0.8125rem]">
          de {formatCents(overview.totalLimitCents)}
        </span>
      </div>
      <Progress
        label="Quanto do orçamento do mês já foi consumido"
        value={usage}
        color={color}
        height={10}
      />

      {atRisk.length ? (
        <ul className="mt-4 space-y-2.5">
          {atRisk.map((row) => (
            <li key={row.categoryId} className="flex items-center gap-2 text-[0.8125rem]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="truncate font-medium">{row.name}</span>
              <span
                className="tnum ml-auto shrink-0 font-semibold"
                style={{
                  color:
                    row.status === "estourou" ? "var(--text-out)" : "var(--text-warn)",
                }}
              >
                {row.usedPct}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted mt-4 text-[0.8125rem] leading-relaxed">
          Nenhuma categoria perto do limite. Mês tranquilo até aqui.
        </p>
      )}

      {overview.unbudgetedSpentCents > 0 ? (
        <p className="muted mt-4 flex items-start gap-2 text-xs leading-snug">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {formatCents(overview.unbudgetedSpentCents)} gastos em categorias sem limite definido.
        </p>
      ) : null}
    </Card>
  );
}
