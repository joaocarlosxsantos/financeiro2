import { asc, gt } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { getNowInSaoPaulo, todayRef } from "@/lib/dates";
import { loadPeriodMovements } from "@/server/telegram/daily-summary";
import { loadInsightData } from "@/server/telegram/insight-data";
import { loadSpendingForecast } from "@/server/telegram/spending-forecast";
import { loadMonthlyReport } from "@/server/telegram/monthly-report";
import { notificationDispatcher } from "./dispatcher";
import { notificationDrivers } from "./drivers";
import { loadAlertEvents } from "./alerts";
import { eventSchema, type NotificationEvent } from "./policy";
import { dailyFinancialEvent, financialInsightEvents } from "./financial-content";
import { notificationWindow, type NotificationCronDependencies, type NotificationCronMode } from "./cron";

export async function sourceEvents(userId: string, mode: NotificationCronMode, now: Date): Promise<NotificationEvent[]> {
  const key = notificationWindow(mode, now);
  if (!key) return [];
  const prefs = await notificationDrivers.preferences(userId);
  if (mode === "alerts") return loadAlertEvents(userId, now);
  if (mode === "daily" || mode === "monthly") {
    if (!prefs.summary) return [];
    const weekly = mode === "daily" && getNowInSaoPaulo(now).getDay() === 1;
    const [balance, movement, analysis] = await Promise.all([getBalances(userId), loadPeriodMovements(userId, now, weekly ? 7 : 1),
      loadSpendingForecast(userId, db, now).catch(() => undefined)]);
    if (balance.accounts?.length === 0 && !movement.incomeCents && !movement.expenseCents) return [];
    const summary = dailyFinancialEvent(userId, `summary:${todayRef(now)}`, now, weekly, balance, movement, analysis);
    if (mode === "monthly") {
      const report = await loadMonthlyReport(userId, now, db, prefs);
      return [eventSchema.parse({ ...summary, type: "MONTHLY_SUMMARY", body: `${summary.body}\n\n${report}`.slice(0, 3800) })];
    }
    return [summary];
  }
  const day = todayRef(now), hour = getNowInSaoPaulo(now).getHours();
  const window = { day, key, hour: (hour >= 20 ? 20 : hour >= 14 ? 14 : 8) as 8 | 14 | 20 };
  if (!prefs.spending) return [];
  const raw = await loadInsightData(userId, window, db, { subscriptions: true });
  return financialInsightEvents(userId, day, raw, prefs.spending);
}
export const notificationCronDependencies: NotificationCronDependencies = {
  users: after => db.select({ id: users.id }).from(users).where(after ? gt(users.id, after) : undefined).orderBy(asc(users.id)).limit(100),
  events: sourceEvents, dispatch: (event, now) => notificationDispatcher.dispatch(event, now),
  dispatchBatch: (events, now) => notificationDispatcher.dispatchBatch(events, now),
};
