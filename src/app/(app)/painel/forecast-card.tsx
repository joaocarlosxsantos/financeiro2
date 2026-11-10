import { TrendingUp, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { MonthForecastResult } from "@/lib/forecast";

interface ForecastCardProps {
  forecast: MonthForecastResult;
  monthName: string;
  className?: string;
}

export function ForecastCard({ forecast, monthName, className }: ForecastCardProps) {
  const isNegative = forecast.projectedBalanceCents < 0;
  const isWarning = forecast.status === "warning";

  return (
    <Card className={`min-w-0 ${className ?? ""}`} aria-label="Previsão de fim do mês">
      <CardHeader
        title="Previsão de fim do mês"
        subtitle={`Projeção baseada no ritmo de gastos dos dias decorridos em ${monthName}.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Ritmo Diário */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Ritmo diário</span>
          </div>
          <div className="mt-1.5">
            <Money
              cents={forecast.dailyAvgCents}
              size="md"
              className="text-base font-semibold"
            />
            <span className="text-xs text-[var(--text-muted)]"> / dia</span>
          </div>
          <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
            Média diária gasta até hoje
          </p>
        </div>

        {/* Gasto Projetado */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            <Calendar className="h-3.5 w-3.5" />
            <span>Gasto projetado</span>
          </div>
          <div className="mt-1.5">
            <Money
              cents={forecast.projectedExpenseCents}
              tone="out"
              size="md"
              className="text-base font-semibold"
            />
          </div>
          <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
            {forecast.daysRemaining} {forecast.daysRemaining === 1 ? "dia restante" : "dias restantes"} no mês
          </p>
        </div>

        {/* Saldo Projetado de Fechamento */}
        <div className={`rounded-xl border p-3 ${
          isNegative
            ? "border-[var(--color-money-out)]/30 bg-[var(--color-money-out)]/5"
            : isWarning
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-[var(--border)] bg-[var(--surface)]"
        }`}>
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            {isNegative ? (
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-money-out)]" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-money-in)]" />
            )}
            <span>Saldo projetado</span>
          </div>
          <div className="mt-1.5">
            <Money
              cents={forecast.projectedBalanceCents}
              tone={isNegative ? "out" : undefined}
              size="md"
              className="text-base font-semibold"
            />
          </div>
          <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
            {isNegative
              ? "Gastos no ritmo atual superam a receita"
              : isWarning
              ? "Margem apertada para o fechamento"
              : `Poupança estimada de ${forecast.savingsRatePct}% da renda`}
          </p>
        </div>
      </div>
    </Card>
  );
}
