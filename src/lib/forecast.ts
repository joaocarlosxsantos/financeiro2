import { formatCents } from "./money";

export type MonthForecastInput = {
  incomeCents: number;
  expenseSoFarCents: number;
  dayOfMonth: number;
  daysInMonth: number;
};

export type MonthForecastResult = {
  dailyAvgCents: number;
  projectedExpenseCents: number;
  projectedBalanceCents: number;
  daysRemaining: number;
  status: "positive" | "warning" | "negative";
  savingsRatePct: number;
};

/**
 * Projeta o fechamento do mês (gastos e saldo final) no ritmo atual de consumo.
 */
export function monthForecast({
  incomeCents,
  expenseSoFarCents,
  dayOfMonth,
  daysInMonth,
}: MonthForecastInput): MonthForecastResult {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const clampedDay = Math.min(safeDaysInMonth, Math.max(0, dayOfMonth));
  const daysRemaining = Math.max(0, safeDaysInMonth - clampedDay);

  let dailyAvgCents = 0;
  let projectedExpenseCents = expenseSoFarCents;

  if (clampedDay > 0) {
    dailyAvgCents = Math.round(expenseSoFarCents / clampedDay);
    projectedExpenseCents = Math.round(dailyAvgCents * safeDaysInMonth);
  }

  const projectedBalanceCents = incomeCents - projectedExpenseCents;

  let status: "positive" | "warning" | "negative" = "positive";
  if (projectedBalanceCents < 0) {
    status = "negative";
  } else if (incomeCents > 0 && projectedBalanceCents < incomeCents * 0.1) {
    status = "warning";
  }

  const savingsRatePct = incomeCents > 0
    ? Math.round((projectedBalanceCents / incomeCents) * 100)
    : 0;

  return {
    dailyAvgCents,
    projectedExpenseCents,
    projectedBalanceCents,
    daysRemaining,
    status,
    savingsRatePct,
  };
}

/**
 * Formata o resumo da previsão para o bot do Telegram ou mensagens de texto.
 */
export function formatForecastSummary(forecast: MonthForecastResult, monthLabelName: string): string {
  const daily = formatCents(forecast.dailyAvgCents);
  const projectedExp = formatCents(forecast.projectedExpenseCents);
  const balance = formatCents(Math.abs(forecast.projectedBalanceCents));
  const days = forecast.daysRemaining;

  const balanceText = forecast.projectedBalanceCents >= 0
    ? `saldo positivo estimado de ${balance} (sobra)`
    : `déficit estimado de ${balance} (gastos superando receitas)`;

  return (
    `Previsão de fim do mês (${monthLabelName}): no ritmo atual de ${daily}/dia, ` +
    `os gastos fecharão em cerca de ${projectedExp}. ` +
    `Resultado projetado: ${balanceText}. ` +
    `(restam ${days} ${days === 1 ? "dia" : "dias"} no mês).`
  );
}
