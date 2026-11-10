import { and, eq, gt, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramDeliveries, telegramLinks, telegramPreferences } from "@/db/schema";
import { loadInsightData } from "./insight-data";
import { DEFAULT_PREFERENCES, type InsightWindow, type Preferences } from "./insights";
import type { CronDependencies } from "./cron";
import { todayRef } from "@/lib/dates";
import { buildInsight } from "./insights";

export async function getTelegramPreferences(userId: string): Promise<Preferences> {
  const [row] = await db.select().from(telegramPreferences).where(eq(telegramPreferences.userId, userId)).limit(1);
  if (!row) return { ...DEFAULT_PREFERENCES, hours: [...DEFAULT_PREFERENCES.hours] };
  return { enabled: row.enabled, hours: row.hours as Preferences["hours"], summary: row.summary, spending: row.spending, dueBills: row.dueBills, budget: row.budget };
}

export async function setTelegramPreferences(userId: string, prefs: Preferences) {
  await db.insert(telegramPreferences).values({ userId, ...prefs })
    .onConflictDoUpdate({ target: telegramPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
}

export const cronDependencies: CronDependencies = {
  async candidates(window, afterUserId) {
    const rows = await db.select({ userId: telegramLinks.userId, chatId: telegramLinks.chatId, prefs: telegramPreferences })
      .from(telegramLinks).innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(and(afterUserId ? gt(telegramLinks.userId, afterUserId) : undefined,
        eq(telegramPreferences.enabled, true), sql`${telegramPreferences.hours} @> ARRAY[${window.hour}]::integer[]`,
        notExists(db.select({ id: telegramDeliveries.id }).from(telegramDeliveries).where(and(
          eq(telegramDeliveries.userId, telegramLinks.userId), eq(telegramDeliveries.windowKey, window.key),
        )))))
      .orderBy(telegramLinks.userId).limit(100);
    return rows.map((row) => ({ ...row, prefs: { ...row.prefs, hours: row.prefs.hours as Preferences["hours"] } }));
  },
  data: loadInsightData,
  async claim(userId, windowKey) {
    const [row] = await db.insert(telegramDeliveries).values({ userId, windowKey })
      .onConflictDoNothing().returning({ id: telegramDeliveries.id });
    return Boolean(row);
  },
  async stillEnabled(recipient, window) {
    const [row] = await db.select({ id: telegramLinks.userId }).from(telegramLinks)
      .innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(and(eq(telegramLinks.userId, recipient.userId), eq(telegramLinks.chatId, recipient.chatId),
        eq(telegramPreferences.enabled, true), sql`${telegramPreferences.hours} @> ARRAY[${window.hour}]::integer[]`,
        eq(telegramPreferences.summary, recipient.prefs.summary), eq(telegramPreferences.spending, recipient.prefs.spending),
        eq(telegramPreferences.dueBills, recipient.prefs.dueBills), eq(telegramPreferences.budget, recipient.prefs.budget))).limit(1);
    return Boolean(row);
  },
  async send(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("telegram_unavailable");
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, protect_content: true }),
      cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    const body: unknown = await result.json();
    if (!result.ok || !(body as { ok?: boolean })?.ok) throw new Error("telegram_send_failed");
  },
  async finish(userId, windowKey, status) {
    await db.update(telegramDeliveries).set({ status }).where(and(eq(telegramDeliveries.userId, userId), eq(telegramDeliveries.windowKey, windowKey)));
  },
};

/** /resumo é uma leitura sob demanda, independente do opt-in dos avisos. */
export async function manualSummary(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()) {
  const day = todayRef(now);
  const window: InsightWindow = { key: `${day}:20`, day, hour: 20 };
  return buildInsight(await loadInsightData(userId, window, connection), DEFAULT_PREFERENCES, window, true) ?? "Nenhum aviso para hoje.";
}
