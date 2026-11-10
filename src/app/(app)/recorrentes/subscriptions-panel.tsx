import { TrendingUp, AlertTriangle, Sparkles, CheckCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { DetectedSubscription } from "@/lib/subscriptions";

interface SubscriptionsPanelProps {
  subscriptions: DetectedSubscription[];
}

export function SubscriptionsPanel({ subscriptions }: SubscriptionsPanelProps) {
  if (!subscriptions.length) return null;

  const unregisteredCount = subscriptions.filter((s) => !s.isRegistered).length;
  const priceIncreaseCount = subscriptions.filter((s) => s.hasPriceIncrease).length;

  return (
    <Card className="min-w-0" aria-label="Assinaturas e recorrências detectadas">
      <CardHeader
        title="Assinaturas detectadas no extrato"
        subtitle="Identificamos cobranças mensais frequentes nos seus lançamentos recentes."
      />

      {(priceIncreaseCount > 0 || unregisteredCount > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {priceIncreaseCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {priceIncreaseCount} {priceIncreaseCount === 1 ? "aumento de preço detectado" : "aumentos de preço detectados"}
            </span>
          )}
          {unregisteredCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
              <Sparkles className="h-3.5 w-3.5" />
              {unregisteredCount} {unregisteredCount === 1 ? "assinatura não cadastrada em regras" : "assinaturas não cadastradas em regras"}
            </span>
          )}
        </div>
      )}

      <div className="divide-y divide-[var(--line)]">
        {subscriptions.map((sub) => (
          <div key={sub.normalizedName} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-[var(--text)]">
                  {sub.name}
                </p>
                {sub.hasPriceIncrease && (
                  <span className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-money-out)]/30 bg-[var(--color-money-out)]/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-money-out)]">
                    <TrendingUp className="h-3 w-3" />
                    +{sub.priceIncreasePct}%
                  </span>
                )}
                {!sub.isRegistered ? (
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[0.6875rem] text-[var(--text-muted)]">
                    Não cadastrado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-[var(--text-muted)]">
                    <CheckCircle className="h-3 w-3 text-[var(--color-money-in)]" />
                    Regra ativa
                  </span>
                )}
              </div>

              {sub.categoryName && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {sub.categoryName} • Cobrança em {sub.monthOccurrences} meses
                </p>
              )}
            </div>

            <div className="flex items-baseline justify-between sm:flex-col sm:items-end">
              <Money
                cents={sub.currentAmountCents}
                tone="out"
                size="md"
                className="text-sm font-semibold"
              />
              {sub.hasPriceIncrease && sub.previousAmountCents && (
                <span className="text-[0.6875rem] text-[var(--text-muted)]">
                  era <Money cents={sub.previousAmountCents} size="sm" className="inline text-[0.6875rem]" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
