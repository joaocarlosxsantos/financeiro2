import { asc, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { formatCents } from "@/lib/money";
import { getNowInSaoPaulo, todayRef } from "@/lib/dates";
import { loadPeriodMovements } from "@/server/telegram/daily-summary";
import { loadInsightData } from "@/server/telegram/insight-data";
import { loadForecastAlert } from "@/server/telegram/alerts";
import { proactiveLines } from "@/server/telegram/proactive-copy";
import { DEFAULT_PREFERENCES } from "@/server/telegram/insights";
import { loadMonthlyReport } from "@/server/telegram/monthly-report";
import { notificationDispatcher } from "./dispatcher";
import { notificationDrivers } from "./drivers";
import { loadAlertEvents } from "./alerts";
import { eventSchema, type NotificationEvent } from "./policy";
import { notificationWindow, type NotificationCronDependencies, type NotificationCronMode } from "./cron";

export async function sourceEvents(userId: string, mode: NotificationCronMode, now: Date): Promise<NotificationEvent[]> {
  const prefs = await notificationDrivers.preferences(userId), key = notificationWindow(mode, now)!;
  if (mode === "alerts") return loadAlertEvents(userId, now);
  if (mode === "monthly") return prefs.summary ? [eventSchema.parse({ userId, category: "summary", type: "MONTHLY_SUMMARY", body: await loadMonthlyReport(userId, now, db, prefs), actionUrl: "/painel", dedupeKey: key })] : [];
  if (mode === "daily") {
    if (!prefs.summary) return [];
    const weekly = getNowInSaoPaulo(now).getDay() === 1;
    const [balance, movement] = await Promise.all([getBalances(userId), loadPeriodMovements(userId, now, weekly ? 7 : 1)]);
    const partial = balance.totalIncomplete ? " (parcial)" : "";
    return [eventSchema.parse({ userId, category: "summary", type: weekly ? "WEEKLY_SUMMARY" : "DAILY_SUMMARY", actionUrl: "/painel", dedupeKey: key,
      body: `Resumo ${weekly ? "semanal" : "diário"}: entrou ${formatCents(movement.incomeCents)} · gastou ${formatCents(movement.expenseCents)} · disponível ${formatCents(balance.availableCents)}${partial}.\nInvestido: ${formatCents(balance.investedCents)} · patrimônio: ${formatCents(balance.netWorthCents)}${partial}.` })];
  }
  const day = todayRef(now), hour = getNowInSaoPaulo(now).getHours();
  const window = { day, key, hour: (hour >= 20 ? 20 : hour >= 14 ? 14 : 8) as 8 | 14 | 20 };
  const date = new Date(`${day}T12:00:00Z`);
  const [raw, forecast, balances] = await Promise.all([
    loadInsightData(userId, window), loadForecastAlert(userId, date), getBalances(userId),
  ]);
  const data = { ...raw, forecast, cashBalanceCents: !balances.totalIncomplete && balances.accounts.some(a => a.type !== "INVESTMENT") ? balances.availableCents : undefined };
  const events: NotificationEvent[] = [];
  // Faturas, contas, orçamento, metas e sync têm alertas deterministas no cron `alerts`.
  for (const category of ["negativeForecast", "spending"] as const) {
    if (!prefs[category]) continue;
    const flags = { ...DEFAULT_PREFERENCES, summary: false, spending: false, dueBills: false, budget: false, cardInvoice: false, negativeForecast: false, [category]: true };
    const lines = proactiveLines(data, flags);
    for (const body of lines) events.push(eventSchema.parse({ userId, category, type: `INSIGHT_${category}`, body,
      actionUrl: "/painel",
      dedupeKey: `${key}:${category}:${createHash("sha256").update(body).digest("hex").slice(0, 20)}` }));
  }
  return events.slice(0, 3);
}
export const notificationCronDependencies: NotificationCronDependencies = {
  users: after => db.select({ id: users.id }).from(users).where(after ? gt(users.id, after) : undefined).orderBy(asc(users.id)).limit(100),
  events: sourceEvents, dispatch: (event, now) => notificationDispatcher.dispatch(event, now),
};
