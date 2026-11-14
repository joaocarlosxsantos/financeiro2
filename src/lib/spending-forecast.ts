import { formatCents } from "./money";
import type { MonthForecastResult } from "./forecast";
import type { DailyBudgetResult } from "./daily-budget";

export type SpendingEntry = {
  date: string;
  amountCents: number;
  kind: string;
  nature: string;
  description: string;
  category: string;
  accountType: string;
  isTransfer: boolean;
  isCardPayment: boolean;
  externalStatus: string | null;
  recurringRuleId: string | null;
  installmentGroupId: string | null;
};
export type Commitment = { date: string; amountCents: number; kind: string; name: string };
const DAY = 86_400_000;
const stamp = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const sum = (rows: { amountCents: number }[]) => rows.reduce((n, r) => n + r.amountCents, 0);
const label = (s: string) => s.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, 45);
const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function isConsumption(row: SpendingEntry) {
  return !row.isTransfer && !row.isCardPayment && row.accountType !== "INVESTMENT"
    && (row.externalStatus === null || row.externalStatus === "POSTED" || row.externalStatus === "PENDING");
}
export function isVariableSpending(row: SpendingEntry) {
  return row.kind === "EXPENSE" && row.nature === "VARIABLE" && !row.recurringRuleId && !row.installmentGroupId;
}
// With eight weekly samples, removing the extremes keeps zero-spend days and
// ordinary variation while preventing one exceptional purchase from repeating.
function robustMean(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const trim = sorted.length >= 3 ? Math.max(1, Math.floor(sorted.length * 0.25)) : 0;
  const kept = sorted.slice(trim, sorted.length - trim);
  return kept.length ? Math.round(kept.reduce((n, v) => n + v, 0) / kept.length) : 0;
}

/** Monthly income/expense result, not an account balance. Civil ledger days are UTC. */
export function spendingForecast(input: {
  today: string; entries: SpendingEntry[]; commitments: Commitment[]; expectedIncomeCents: number;
  budgets?: { category: string; limitCents: number }[];
}) {
  const { today } = input;
  const time = stamp(today);
  const date = new Date(time);
  const month = today.slice(0, 7);
  const monthStart = stamp(`${month}-01`);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const day = date.getUTCDate();
  const daysInMonth = new Date(end - DAY).getUTCDate();
  const eligible = input.entries.filter(isConsumption);
  const posted = eligible.filter(r => r.externalStatus !== "PENDING" && r.date <= today);
  const realized = posted.filter(r => r.date.startsWith(month));
  const expense = sum(realized.filter(r => r.kind === "EXPENSE"));
  const received = sum(realized.filter(r => r.kind === "INCOME"));
  const scheduledRows = eligible.filter(r => r.date.startsWith(month) && (r.date > today || r.externalStatus === "PENDING"));
  const commitments: Commitment[] = [...scheduledRows.map(r => ({ ...r, name: r.description })), ...input.commitments];
  const committed = sum(commitments.filter(r => r.kind === "EXPENSE"));
  const income = Math.max(input.expectedIncomeCents, received + sum(commitments.filter(r => r.kind === "INCOME")));
  const historical = posted.filter(r => isVariableSpending(r) && r.date < today && stamp(r.date) >= time - 56 * DAY);
  // Do not manufacture eight weeks of zeros for a newly connected account.
  const oldest = posted.filter(r => stamp(r.date) >= time - 56 * DAY && r.date < today).map(r => stamp(r.date));
  const historyStart = oldest.length ? Math.max(time - 56 * DAY, Math.min(...oldest)) : time;
  const totals = new Map<string, number>();
  for (const row of historical) totals.set(row.date, (totals.get(row.date) ?? 0) + row.amountCents);
  const samples: number[][] = Array.from({ length: 7 }, () => []);
  for (let t = historyStart; t < time; t += DAY) samples[new Date(t).getUTCDay()].push(totals.get(iso(t)) ?? 0);
  const fallback = robustMean(samples.flat());
  const weekdayCents = samples.map(v => time - historyStart < 7 * DAY ? 0 : v.length >= 3 ? robustMean(v) : fallback);
  let additionalExpenseCents = 0;
  let weightTotal = 0;
  const todayWeight = weekdayCents[date.getUTCDay()];
  for (let t = time; t < end; t += DAY) {
    const weight = weekdayCents[new Date(t).getUTCDay()];
    weightTotal += weight;
    if (t === time) continue;
    // Known variable purchases replace only that day's variable estimate.
    const known = sum(scheduledRows.filter(r => r.date === iso(t) && isVariableSpending(r)));
    additionalExpenseCents += Math.max(0, weight - known);
  }
  const projectedExpenseCents = expense + committed + additionalExpenseCents;
  const projectedBalanceCents = income - projectedExpenseCents;
  const forecast: MonthForecastResult = {
    dailyAvgCents: Math.round(weekdayCents.reduce((n, v) => n + v, 0) / 7),
    projectedExpenseCents, projectedBalanceCents, daysRemaining: daysInMonth - day,
    status: projectedBalanceCents < 0 ? "negative" : projectedBalanceCents < income * 0.1 ? "warning" : "positive",
    savingsRatePct: income > 0 ? Math.round(projectedBalanceCents / income * 100) : 0,
  };
  const spentToday = sum(realized.filter(r => r.date === today && isVariableSpending(r)));
  const free = income - expense - committed;
  // Reconstruct today's envelope before subtracting today's consumption once.
  const allowance = Math.max(0, Math.floor((free + spentToday) * (weightTotal > 0 ? todayWeight / weightTotal : 1 / (daysInMonth - day + 1))));
  const remaining = Math.max(0, Math.min(free, allowance - spentToday));
  const daily: DailyBudgetResult = {
    dailyAllowanceCents: allowance, remainingTodayCents: remaining,
    availableForRestOfMonthCents: free, daysRemainingWithToday: daysInMonth - day + 1,
    status: free <= 0 ? "exceeded" : remaining < 2000 ? "tight" : "ok",
  };
  const spending = posted.filter(r => r.kind === "EXPENSE");
  const on = (d: string) => sum(spending.filter(r => r.date === d));
  const yesterday = iso(time - DAY);
  const yesterdaySpent = on(yesterday);
  const comparison = (name: string, current: number, previous: number) => previous > 0
    ? `${name}: ${Math.round(Math.abs(current - previous) / previous * 100)}% ${current >= previous ? "mais" : "menos"} (${formatCents(current)}).`
    : `${name}: ${formatCents(current)}; sem gasto na referência.`;
  const insights: string[] = [];
  if (historyStart <= time - 8 * DAY) {
    insights.push(comparison("Ontem vs mesmo dia da semana passada", yesterdaySpent, on(iso(time - 8 * DAY))));
    insights.push(comparison(`Ontem vs padrão de ${weekdays[new Date(time - DAY).getUTCDay()]}`, sum(spending.filter(r => r.date === yesterday && isVariableSpending(r))), weekdayCents[new Date(time - DAY).getUTCDay()]));
  }
  const prevStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  const prevDays = new Date(monthStart - DAY).getUTCDate();
  const elapsed = Math.min(day - 1, prevDays);
  if (elapsed > 0 && posted.some(r => stamp(r.date) >= prevStart && stamp(r.date) < monthStart)) {
    insights.push(comparison(`Mês vs anterior até dia ${elapsed}`, sum(spending.filter(r => stamp(r.date) >= monthStart && stamp(r.date) < monthStart + elapsed * DAY)), sum(spending.filter(r => stamp(r.date) >= prevStart && stamp(r.date) < prevStart + elapsed * DAY))));
  }
  const recent = spending.filter(r => r.date >= iso(time - 7 * DAY) && r.date < today);
  const prior = spending.filter(r => r.date >= iso(time - 14 * DAY) && r.date < iso(time - 7 * DAY));
  const rises = [...new Set(recent.map(r => r.category))].map(category => ({ category,
    delta: sum(recent.filter(r => r.category === category)) - sum(prior.filter(r => r.category === category)),
  })).filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
  if (rises.length) insights.push(`Categorias que subiram na semana: ${rises.map(r => `${label(r.category)} +${formatCents(r.delta)}`).join(", ")}.`);
  const atypical = recent.filter(r => isVariableSpending(r) && r.amountCents > Math.max(10000, weekdayCents[new Date(stamp(r.date)).getUTCDay()] * 3)).sort((a, b) => b.amountCents - a.amountCents)[0];
  if (atypical) insights.push(`Maior gasto atípico: ${label(atypical.description)}, ${formatCents(atypical.amountCents)}.`);
  if (income > 0) insights.push(`Ritmo vs renda mensal: ${Math.round(projectedExpenseCents / income * 100)}% projetados; teto restante hoje ${formatCents(remaining)}.`);
  for (const budget of input.budgets ?? []) {
    if (budget.limitCents <= 0) continue;
    const spent = sum(realized.filter(r => r.kind === "EXPENSE" && r.category === budget.category));
    if (spent > budget.limitCents * day / daysInMonth) insights.push(`Ritmo acima do orçamento em ${label(budget.category)}: ${formatCents(spent)} de ${formatCents(budget.limitCents)} (${Math.round(spent / budget.limitCents * 100)}%).`);
  }
  const maxWeekday = weekdayCents.indexOf(Math.max(...weekdayCents));
  if (weekdayCents[maxWeekday] > 0) insights.push(`Dia mais caro: ${weekdays[maxWeekday]}, padrão de ${formatCents(weekdayCents[maxWeekday])}.`);
  const upcoming = commitments.filter(r => r.kind === "EXPENSE" && stamp(r.date) >= time && stamp(r.date) <= time + 7 * DAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2);
  if (upcoming.length) insights.push(`Próximos compromissos: ${upcoming.map(r => `${label(r.name)} ${r.date.slice(8)}/${r.date.slice(5, 7)}: ${formatCents(r.amountCents)}`).join(", ")}.`);
  insights.push(`Fim do mês: ${projectedBalanceCents >= 0 ? "sobra" : "falta"} de ${formatCents(Math.abs(projectedBalanceCents))} no resultado mensal.`);
  return { forecast, daily, insights, weekdayCents, committedCents: committed, historyDays: Math.round((time - historyStart) / DAY) };
}
