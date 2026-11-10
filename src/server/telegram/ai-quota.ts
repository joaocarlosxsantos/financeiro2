import { sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramAiUsage } from "@/db/schema";
import { todayRef } from "@/lib/dates";
import { AI_DAILY_LIMIT, AI_MINUTE_LIMIT } from "./ai-policy";

/** Uma operação SQL atômica, compartilhada entre instâncias Vercel. */
export async function consumeAiQuota(chatId: string, now = new Date()): Promise<boolean> {
  const day = todayRef(now);
  const newDay = sql`${telegramAiUsage.day} <> ${day}`;
  const newMinute = sql`${telegramAiUsage.minuteStartedAt} <= ${new Date(now.getTime() - 60_000)}`;
  const [row] = await db.insert(telegramAiUsage).values({ chatId, day, dayCount: 1, minuteStartedAt: now, minuteCount: 1 })
    .onConflictDoUpdate({
      target: telegramAiUsage.chatId,
      set: {
        day, dayCount: sql`case when ${newDay} then 1 else ${telegramAiUsage.dayCount} + 1 end`,
        minuteStartedAt: sql`case when ${newMinute} then ${now} else ${telegramAiUsage.minuteStartedAt} end`,
        minuteCount: sql`case when ${newMinute} then 1 else ${telegramAiUsage.minuteCount} + 1 end`,
      },
      setWhere: sql`(${newDay} or ${telegramAiUsage.dayCount} < ${AI_DAILY_LIMIT}) and (${newMinute} or ${telegramAiUsage.minuteCount} < ${AI_MINUTE_LIMIT})`,
    }).returning({ chatId: telegramAiUsage.chatId });
  return Boolean(row);
}
