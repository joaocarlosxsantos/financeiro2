import { monthRefToParam, todayRef, type MonthRef } from "./dates";
import type { MonthForecastResult } from "./forecast";

export type ForecastTotals = {
  incomeCents: number;
  expenseCents: number;
  variableCents: number;
  count: number;
};

export function forecastCalendar(ref: MonthRef, now = new Date()) {
  // Convert the real instant once. Ledger dates are civil dates anchored in UTC.
  const today = todayRef(now);
  const selected = monthRefToParam(ref);
  const current = today.slice(0, 7);
  const period = selected < current ? "past" : selected > current ? "future" : "current";
  const daysInMonth = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
  const elapsedDays = period === "past" ? daysInMonth : period === "future" ? 0 : Number(today.slice(8, 10));
  return { period, today, daysInMonth, elapsedDays,
    daysRemaining: period === "current" ? daysInMonth - elapsedDays : 0 } as const;
}

export type DashboardForecast = MonthForecastResult & {
  period: "past" | "current" | "future";
  hasData: boolean;
  realizedIncomeCents: number;
  realizedExpenseCents: number;
  realizedBalanceCents: number;
  receivableCents: number;
  payableCents: number;
  additionalExpenseCents: number;
};

const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

/**
 * Monthly CASH result, not the combined balances of bank accounts.
 * Past: exact realized income - expenses. Future: known plans, no pace estimate.
 * Current: realized balance + remaining income - commitments - extra variable spending.
 * Registered income is a monthly target, never added on top of received/planned income.
 * Known variable commitments replace the corresponding part of the pace estimate.
 */
export function dashboardForecast(input: {
  ref: MonthRef;
  now?: Date;
  expectedIncomeCents: number;
  realized: ForecastTotals;
  scheduled: ForecastTotals;
}): DashboardForecast {
  const calendar = forecastCalendar(input.ref, input.now);
  const past = calendar.period === "past";
  const current = calendar.period === "current";
  const hasData = input.realized.count > 0 || (!past && input.scheduled.count > 0);
  const realizedIncomeCents = cents(input.realized.incomeCents);
  const realizedExpenseCents = cents(input.realized.expenseCents);
  const realizedBalanceCents = realizedIncomeCents - realizedExpenseCents;
  const variableCents = Math.min(realizedExpenseCents, cents(input.realized.variableCents));
  const payableCents = past ? 0 : cents(input.scheduled.expenseCents);
  const knownVariable = Math.min(payableCents, cents(input.scheduled.variableCents));
  const receivableCents = past || !hasData ? 0 : Math.max(
    cents(input.scheduled.incomeCents),
    cents(input.expectedIncomeCents) - realizedIncomeCents,
  );
  const additionalExpenseCents = current && hasData
    ? Math.max(0, Math.round(variableCents * calendar.daysRemaining / Math.max(1, calendar.elapsedDays)) - knownVariable)
    : 0;
  const projectedExpenseCents = realizedExpenseCents + payableCents + additionalExpenseCents;
  const projectedIncomeCents = realizedIncomeCents + receivableCents;
  const projectedBalanceCents = realizedBalanceCents + receivableCents - payableCents - additionalExpenseCents;
  const status = projectedBalanceCents < 0 ? "negative"
    : projectedIncomeCents > 0 && projectedBalanceCents < projectedIncomeCents * 0.1 ? "warning" : "positive";

  return {
    period: calendar.period, hasData,
    realizedIncomeCents, realizedExpenseCents, realizedBalanceCents,
    receivableCents, payableCents, additionalExpenseCents,
    dailyAvgCents: current ? Math.round(variableCents / Math.max(1, calendar.elapsedDays)) : 0,
    daysRemaining: calendar.daysRemaining,
    projectedExpenseCents, projectedBalanceCents, status,
    savingsRatePct: projectedIncomeCents > 0 ? Math.round(projectedBalanceCents / projectedIncomeCents * 100) : 0,
  };
}
