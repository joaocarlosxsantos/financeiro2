import { createHash } from "node:crypto";
import { todayRef } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { safeLabel } from "@/server/telegram/ai-policy";
import type { InsightData } from "@/server/telegram/insights";
import type { loadSpendingForecast } from "@/server/telegram/spending-forecast";
import { eventSchema, type NotificationEvent } from "./policy";

type Balance = { availableCents: number; totalIncomplete: boolean; investedCents?: number; netWorthCents?: number; accounts?: { type: string }[] };
type Analysis = Awaited<ReturnType<typeof loadSpendingForecast>>;
const money = (cents: number) => formatCents(cents).replace(/\u00a0/g, " ");
const label = (value: string) => safeLabel(value).replace(/[\r\n\t]/g, " ").slice(0, 45);
const identity = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

export function dailyFinancialEvent(userId: string, key: string, now: Date, weekly: boolean, balance: Balance,
  movement: { incomeCents: number; expenseCents: number }, analysis: Analysis | undefined) {
  const lines: string[] = [];
  if (analysis?.forecast) {
    const projected = analysis.forecast.projectedBalanceCents;
    const limits = [analysis.historyDays < 14 ? "histórico curto" : "", balance.totalIncomplete ? "dados parciais" : ""].filter(Boolean);
    lines.push(`Projeção mensal: ${projected >= 0 ? "sobra" : "falta"} de ${money(Math.abs(projected))}${limits.length ? ` (${limits.join(", ")})` : ""}. Confira o mês no app.`);
  }
  if (!analysis) lines.push("Projeção mensal e gasto possível de hoje indisponíveis com os dados atuais.");
  if (analysis && Number.isFinite(analysis.spentTodayCents)) {
    lines.push(`Hoje: gasto variável ${money(analysis.spentTodayCents)} de teto estimado ${money(analysis.daily.dailyAllowanceCents)}; restante ${money(analysis.daily.remainingTodayCents)} (renda prevista).`);
  }
  const day = todayRef(now);
  const end = new Date(`${day}T00:00:00Z`).getTime() - 86_400_000;
  const start = end - (weekly ? 6 : 0) * 86_400_000;
  const short = (t: number) => { const iso = new Date(t).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; };
  lines.push(`${weekly ? `Últimos sete dias (${short(start)}–${short(end)})` : `Ontem (${short(end)})`}: entrou ${money(movement.incomeCents)} · gastou ${money(movement.expenseCents)}.`);
  lines.push(`Disponível${balance.totalIncomplete ? " parcial" : ""}: ${money(balance.availableCents)}. Investido: ${money(balance.investedCents ?? 0)}.`);
  return eventSchema.parse({ userId, category: "summary", type: weekly ? "WEEKLY_SUMMARY" : "DAILY_SUMMARY", body: lines.join("\n"), actionUrl: "/painel", dedupeKey: key });
}

/** Financial fact + civil period, never a hash of a mutable amount/message. */
export function financialInsightEvents(userId: string, day: string, raw: InsightData, spendingEnabled: boolean): NotificationEvent[] {
  const events: NotificationEvent[] = [];
  if (!spendingEnabled) return events;
  for (const c of raw.categories) {
    const mean = c.historyCents / 30;
    if (c.historyCount < 5 || c.historyDays < 3 || mean <= 0 || c.todayCents <= mean * 1.5 || c.todayCents - mean < 1000) continue;
    events.push(eventSchema.parse({ userId, category: "spending", type: "CATEGORY_SPENDING", body: `Gasto registrado hoje acima do usual em ${label(c.name)}: ${money(c.todayCents)}. Reveja os lançamentos no app.`,
      actionUrl: "/insights", dedupeKey: `spending:${c.id ?? identity(c.name)}:${day}` }));
  }
  for (const sub of raw.subscriptions ?? []) {
    // A projected recurrence has no posted occurrence date and cannot trigger a charge alert.
    if (sub.lastChargedOn !== day || sub.currentCents <= 0) continue;
    const increased = sub.hasPriceIncrease && sub.previousCents !== undefined && sub.previousCents > 0 && sub.currentCents > sub.previousCents;
    const detail = increased ? `; antes ${money(sub.previousCents!)}, aumento de ${money(sub.currentCents - sub.previousCents!)}` : "";
    events.push(eventSchema.parse({ userId, category: "spending", type: "SUBSCRIPTION_CHARGE",
      body: `Assinatura cobrada: ${label(sub.name)}, ${money(sub.currentCents)}${detail}. Confira em Recorrentes.`, actionUrl: "/recorrentes",
      dedupeKey: `subscription:${sub.lastChargeId ?? identity(`${sub.name}:${sub.lastChargedOn}`)}` }));
  }
  return events;
}
