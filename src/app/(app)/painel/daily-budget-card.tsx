import { Sparkles, AlertCircle, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { DailyBudgetResult } from "@/lib/daily-budget";

interface DailyBudgetCardProps {
  dailyBudget: DailyBudgetResult;
  className?: string;
}

export function DailyBudgetCard({ dailyBudget, className }: DailyBudgetCardProps) {
  const isExceeded = dailyBudget.status === "exceeded";
  const isTight = dailyBudget.status === "tight";

  return (
    <Card className={`min-w-0 ${className ?? ""}`} aria-label="Quanto posso gastar hoje">
      <CardHeader
        title="Quanto posso gastar hoje?"
        subtitle="Limite diário recomendado para fechar o mês com saldo positivo."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <Money
            cents={dailyBudget.remainingTodayCents}
            tone={isExceeded ? "out" : undefined}
            size="hero"
            className="font-semibold text-2xl sm:text-3xl"
          />
          <span className="text-xs text-[var(--text-muted)] font-medium">
            {isExceeded
              ? "sem margem diária"
              : `meta de recomendação: / dia`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
            <Clock className="h-3.5 w-3.5" />
            {dailyBudget.daysRemainingWithToday} {dailyBudget.daysRemainingWithToday === 1 ? "dia restante" : "dias restantes"}
          </span>

          <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 ${
            isExceeded
              ? "border-[var(--color-money-out)]/30 text-[var(--color-money-out)] bg-[var(--color-money-out)]/10"
              : isTight
              ? "border-amber-500/30 text-amber-500 bg-amber-500/10"
              : "border-[var(--color-money-in)]/30 text-[var(--color-money-in)] bg-[var(--color-money-in)]/10"
          }`}>
            {isExceeded ? (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                Limite excedido
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {isTight ? "Orçamento apertado" : "Dentro do planejado"}
              </>
            )}
          </span>
        </div>
      </div>
    </Card>
  );
}
