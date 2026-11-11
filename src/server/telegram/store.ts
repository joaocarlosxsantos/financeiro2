import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramChatState, telegramLinkCodes, telegramLinks, telegramPreferences, users } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { loadMonthlyReport } from "./monthly-report";
import { manualDailyBudget, manualForecast, manualSubscriptionsInsight } from "./insight-store";
import { renderDailySummary } from "./daily-summary";
import { loadCardSummary } from "./card-summary";
import { CHAT_MAX_REQUESTS, CHAT_WINDOW_MS, commandReply, isFreeQuestion, newLinkCode, type TelegramMessage } from "./protocol";
import { answerQuestion } from "./ai-service";

export async function issueLink(userId: string) {
  const token = newLinkCode();
  await db.transaction(async (tx) => {
    // Serializa geração e desconexão para o mesmo usuário.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx.insert(telegramLinkCodes).values({ userId, codeHash: token.codeHash, expiresAt: token.expiresAt })
      .onConflictDoUpdate({ target: telegramLinkCodes.userId, set: { codeHash: token.codeHash, expiresAt: token.expiresAt } });
  });
  return token;
}

export async function disconnect(userId: string) {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
    await tx.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
    await tx.insert(telegramPreferences).values({ userId, enabled: false })
      .onConflictDoUpdate({ target: telegramPreferences.userId, set: { enabled: false, updatedAt: new Date() } });
  });
}

export async function processMessage(updateId: number, message: TelegramMessage): Promise<string | null> {
  const chatId = String(message.chat.id);
  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - CHAT_WINDOW_MS).toISOString();
    const staleWatermark = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
    const expired = sql`${telegramChatState.windowStartedAt} <= ${windowStart}::timestamptz`;
    const [state] = await tx.insert(telegramChatState).values({
      chatId, lastUpdateId: updateId, windowStartedAt: now, requestCount: 1,
    }).onConflictDoUpdate({
      target: telegramChatState.chatId,
      set: {
        lastUpdateId: updateId,
        windowStartedAt: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${telegramChatState.windowStartedAt} end`,
        requestCount: sql`case when ${expired} then 1 else least(${telegramChatState.requestCount} + 1, ${CHAT_MAX_REQUESTS + 1}) end`,
      },
      // Telegram pode sortear outro update_id após uma semana sem updates.
      setWhere: sql`${telegramChatState.lastUpdateId} < ${updateId} or ${telegramChatState.windowStartedAt} < ${staleWatermark}::timestamptz`,
    }).returning({ count: telegramChatState.requestCount });
    if (!state || state.count > CHAT_MAX_REQUESTS) return null;

    if (isFreeQuestion(message.text)) {
      const [link] = await tx.select({ userId: telegramLinks.userId }).from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1);
      if (!link) return "Vincule seu Telegram em Configurações no Mutano Contas antes de fazer perguntas.";
      return { userId: link.userId, question: message.text!.trim() };
    }

    return commandReply(message, {
      async consumeCode(codeHash, targetChatId) {
        // DELETE RETURNING é atômico: concorrência/replay não reutiliza o código.
        const [token] = await tx.delete(telegramLinkCodes).where(and(
          eq(telegramLinkCodes.codeHash, codeHash), gt(telegramLinkCodes.expiresAt, sql`clock_timestamp()`),
        )).returning({ userId: telegramLinkCodes.userId });
        if (!token) return false;
        const [link] = await tx.insert(telegramLinks).values({ userId: token.userId, chatId: targetChatId })
          .onConflictDoNothing().returning({ userId: telegramLinks.userId });
        return Boolean(link);
      },
      async linkedUser(targetChatId) {
        const [link] = await tx.select({ userId: telegramLinks.userId }).from(telegramLinks)
          .where(eq(telegramLinks.chatId, targetChatId)).limit(1);
        return link?.userId ?? null;
      },
      // Usa a conexão já reservada; abrir outra aqui pode esgotar o pool.
      balance: (userId) => getBalances(userId, tx),
      summary: (userId) => renderDailySummary(userId, tx as unknown as typeof db),
      report: (userId) => loadMonthlyReport(userId, now, tx),
      forecast: (userId) => manualForecast(userId, tx),
      dailyBudget: (userId) => manualDailyBudget(userId, tx),
      subscriptions: (userId) => manualSubscriptionsInsight(userId, tx),
      cards: (userId) => loadCardSummary(userId, tx, now),
      async pause(userId) {
        await tx.insert(telegramPreferences).values({ userId, enabled: false })
          .onConflictDoUpdate({ target: telegramPreferences.userId, set: { enabled: false, updatedAt: new Date() } });
      },
    });
  });
  // Não segurar conexão nem lock do chat enquanto o provedor externo responde.
  if (result && typeof result === "object") return answerQuestion(result.userId, chatId, result.question);
  return result;
}
