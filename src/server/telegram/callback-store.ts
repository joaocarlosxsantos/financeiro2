import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramChatState, telegramLinks, telegramPreferences, users } from "@/db/schema";
import { CHAT_MAX_REQUESTS, CHAT_WINDOW_MS, isFinancialCommand, updateSchema, type TelegramCallback, type TelegramMessage } from "./protocol";
import { CALLBACK_TEXT, createActionKeyboard, readActionToken, SILENCE_TYPES, type DetailAction, type InlineResult } from "./inline-actions";

const ownerKey = (link: { userId: string; createdAt: Date }) => `${link.userId}:${link.createdAt.toISOString()}`;

export async function replyKeyboard(message: TelegramMessage, reply: string | null, secret = process.env.TELEGRAM_WEBHOOK_SECRET, now = new Date()) {
  if (!reply || !secret || !isFinancialCommand(message.text)) return undefined;
  const chatId = String(message.chat.id);
  const [link] = await db.select({ userId: telegramLinks.userId, createdAt: telegramLinks.createdAt })
    .from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1);
  if (!link) return undefined;
  return createActionKeyboard(message.text!, chatId, ownerKey(link), secret, now);
}

/** Atomic owner authorization, replay/rate claim and preference write. No financial writes. */
export async function processInlineCallback(updateId: number, callback: TelegramCallback,
  secret = process.env.TELEGRAM_WEBHOOK_SECRET, now = new Date()): Promise<InlineResult> {
  if (!updateSchema.safeParse({ update_id: updateId, callback_query: callback }).success) return { text: CALLBACK_TEXT.invalid };
  if (!secret) return { text: CALLBACK_TEXT.invalid };
  const chatId = String(callback.message.chat.id);
  return db.transaction(async tx => {
    const [initial] = await tx.select({ userId: telegramLinks.userId, createdAt: telegramLinks.createdAt }).from(telegramLinks)
      .where(eq(telegramLinks.chatId, chatId)).limit(1);
    if (!initial) return { text: CALLBACK_TEXT.denied };
    const action = readActionToken(callback.data, chatId, ownerKey(initial), secret, now);
    if ("error" in action) return { text: CALLBACK_TEXT[action.error] };

    const windowStart = new Date(now.getTime() - CHAT_WINDOW_MS).toISOString();
    const expired = sql`${telegramChatState.windowStartedAt} <= ${windowStart}::timestamptz`;
    const [state] = await tx.insert(telegramChatState).values({ chatId, lastUpdateId: updateId, windowStartedAt: now, requestCount: 1 })
      .onConflictDoUpdate({ target: telegramChatState.chatId,
        set: { lastUpdateId: updateId,
          windowStartedAt: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${telegramChatState.windowStartedAt} end`,
          requestCount: sql`case when ${expired} then 1 else least(${telegramChatState.requestCount} + 1, ${CHAT_MAX_REQUESTS + 1}) end` },
        setWhere: sql`${telegramChatState.lastUpdateId} < ${updateId}`,
      }).returning({ count: telegramChatState.requestCount });
    if (!state) return { text: CALLBACK_TEXT.replay };
    if (state.count > CHAT_MAX_REQUESTS) return { text: CALLBACK_TEXT.limited };
    // Chat claim first (same as message processing), then user/link locks
    // (same order as disconnect). Recheck the actual link under these locks.
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, initial.userId)).for("update").limit(1);
    if (!user) return { text: CALLBACK_TEXT.denied };
    const [link] = await tx.select({ userId: telegramLinks.userId, createdAt: telegramLinks.createdAt }).from(telegramLinks)
      .where(and(eq(telegramLinks.chatId, chatId), eq(telegramLinks.userId, initial.userId))).for("update").limit(1);
    if (!link || ownerKey(link) !== ownerKey(initial)) return { text: CALLBACK_TEXT.denied };
    if (action.action.startsWith("d")) return { text: CALLBACK_TEXT.details, details: action.action as DetailAction };

    const field = action.action === "p" ? "enabled" : SILENCE_TYPES[action.action as keyof typeof SILENCE_TYPES].field;
    // Assign false, never toggle: another click/update cannot re-enable alerts.
    await tx.insert(telegramPreferences).values({ userId: link.userId, [field]: false })
      .onConflictDoUpdate({ target: telegramPreferences.userId, set: { [field]: false, updatedAt: now } });
    return { text: action.action === "p" ? CALLBACK_TEXT.paused
      : `Avisos de ${SILENCE_TYPES[action.action as keyof typeof SILENCE_TYPES].label} silenciados. Outros avisos continuam como estão.` };
  });
}
