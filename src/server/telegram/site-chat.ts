import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramChatState, users } from "@/db/schema";
import { commandReply } from "./protocol";
import { ownerCommandDependencies, type CommandConnection } from "./command-service";
import { isSiteChatCommand } from "@/lib/site-chat";

export const SITE_CHAT_REQUESTS_PER_MINUTE = 20;

/** Atomic Postgres counter: shared across serverless instances; separate from Telegram IDs. */
export async function claimSiteChatRequest(userId: string, connection: Pick<typeof db, "insert"> = db) {
  const expired = sql`${telegramChatState.windowStartedAt} <= clock_timestamp() - interval '1 minute'`;
  const [row] = await connection.insert(telegramChatState).values({
    chatId: `site:${userId}`, lastUpdateId: 0, windowStartedAt: sql`clock_timestamp()`, requestCount: 1,
  }).onConflictDoUpdate({ target: telegramChatState.chatId, set: {
    windowStartedAt: sql`case when ${expired} then clock_timestamp() else ${telegramChatState.windowStartedAt} end`,
    requestCount: sql`case when ${expired} then 1 else least(${telegramChatState.requestCount} + 1, ${SITE_CHAT_REQUESTS_PER_MINUTE + 1}) end`,
  } }).returning({ count: telegramChatState.requestCount,
    retryAfter: sql<number>`greatest(1, ceil(extract(epoch from (${telegramChatState.windowStartedAt} + interval '1 minute' - clock_timestamp()))))::int`,
  });
  if (!row) throw new Error("chat_rate_limit_unavailable");
  return { allowed: row.count <= SITE_CHAT_REQUESTS_PER_MINUTE, retryAfterSeconds: row.retryAfter };
}

export async function siteChatOwnerExists(userId: string, connection: Pick<typeof db, "select"> = db) {
  const [owner] = await connection.select({ id: users.id }).from(users).where(and(eq(users.id, userId))).limit(1);
  return Boolean(owner);
}

/** Site auth supplies owner; there is no Telegram-link requirement or client-supplied identity. */
export async function siteCommandReply(userId: string, command: string, connection: CommandConnection = db, now = new Date()) {
  if (!isSiteChatCommand(command)) throw new Error("invalid_site_command");
  return commandReply({ text: command, chat: { id: 1, type: "private" }, from: { id: 1, is_bot: false } }, {
    ...ownerCommandDependencies(connection, now),
    linkedUser: async () => userId,
    consumeCode: async () => false,
  });
}
