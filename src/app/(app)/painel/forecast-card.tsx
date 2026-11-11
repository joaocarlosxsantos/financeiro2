import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { formatCents } from "@/lib/money";
import type { DashboardForecast } from "@/lib/dashboard-forecast";

interface ForecastCardProps {
  forecast: DashboardForecast;
  monthName: string;
  className?: string;
}

export function ForecastCard({ forecast, monthName, className }: ForecastCardProps) {
  const past = forecast.period === "past";
  const current = forecast.period === "current";
  const title = past ? "Fechamento do mês" : current ? "Previsão de fim do mês" : "Planejamento do mês";
  const isNegative = forecast.projectedBalanceCents < 0;
  const cells = past ? [
    { label: "Receita realizada", cents: forecast.realizedIncomeCents },
    { label: "Despesa realizada", cents: forecast.realizedExpenseCents },
  ] : current ? [
    { label: "Saldo realizado no mês", cents: forecast.realizedBalanceCents },
  ] : [
    { label: "A receber", cents: forecast.receivableCents },
    { label: "A pagar", cents: forecast.payableCents },
  ];

  return (
    <Card className={`min-w-0 ${className ?? ""}`}>
      <CardHeader title={title} subtitle={past
        ? `Entradas e saídas realizadas em ${monthName}.`
        : current ? `Resultado de caixa estimado para ${monthName}.`
        : `Entradas e saídas previstas para ${monthName}, sem estimativa por média.`} />

      {!forecast.hasData ? (
        <p className="text-sm text-[var(--text-muted)]">Sem movimentações {past ? "realizadas" : "ou recorrências previstas"} neste mês. Nenhum resultado estimado.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cells.map(cell => <div key={cell.label} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs font-medium text-[var(--text-muted)]">{cell.label}</p>
              <div className="mt-1.5"><Money cents={cell.cents} size="md" className="text-base font-semibold" /></div>
            </div>)}
            {current && <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs font-medium text-[var(--text-muted)]">A receber / a pagar</p>
              <div className="mt-1.5 space-y-1 text-sm">
                <p>+ {formatCents(forecast.receivableCents)}</p>
                <p>− {formatCents(forecast.payableCents)}</p>
              </div>
            </div>}
            <div className={`min-w-0 rounded-xl border p-3 ${isNegative
              ? "border-[var(--color-money-out)]/30 bg-[var(--color-money-out)]/5"
              : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <p className="text-xs font-medium text-[var(--text-muted)]">{past ? "Resultado realizado" : current ? "Resultado estimado" : "Resultado previsto"}</p>
              <div className="mt-1.5"><Money cents={forecast.projectedBalanceCents} tone={isNegative ? "out" : undefined} size="md" className="text-base font-semibold" /></div>
            </div>
          </div>
          {current && <p className="mt-3 text-xs text-[var(--text-muted)]">
            {forecast.daysRemaining} {forecast.daysRemaining === 1 ? "dia restante" : "dias restantes"} · Ritmo variável: {formatCents(forecast.dailyAvgCents)}/dia.
            {" "}Gastos adicionais estimados: {formatCents(forecast.additionalExpenseCents)}.
          </p>}
          {!past && <p className="mt-2 text-xs text-[var(--text-muted)]">
            A receber considera a renda mensal cadastrada ainda não recebida e as entradas previstas, sem duplicar valores. Resultado do mês, sem saldo inicial das contas.
          </p>}
        </>
      )}
    </Card>
  );
}
