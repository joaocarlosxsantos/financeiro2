import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramChatState, telegramLinkCodes, telegramLinks, telegramPreferences, users } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { loadMonthlyReport } from "./monthly-report";
import { manualDailyBudget, manualForecast, manualSubscriptionsInsight } from "./insight-store";
import { renderDailySummary } from "./daily-summary";
import { loadCardSummary } from "./card-summary";
import { CHAT_MAX_REQUESTS, CHAT_WINDOW_MS, commandReply, isFinancialCommand, isFreeQuestion, newLinkCode, type TelegramMessage } from "./protocol";
import { answerQuestion } from "./ai-service";
import { parseNaturalTransaction } from "./natural-transaction-parser";
import { createTransactionDraft, undoTransactionDraft } from "./draft-store";

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

type TelegramTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadTelegramBalance(userId: string, connection: Pick<typeof db, "select">) {
  const balance = await getBalances(userId, connection);
  return {
    availableCents: balance.availableCents,
    investedCents: balance.investedCents,
    netWorthCents: balance.netWorthCents,
    totalIncomplete: balance.totalIncomplete,
    needsOpeningBalance: balance.needsOpeningBalance,
  };
}

async function replyToCommand(message: TelegramMessage, tx: TelegramTransaction, now: Date, expectedUserId?: string | null) {
  const chatId = String(message.chat.id);
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
      if (expectedUserId === null) return null;
      const [link] = await tx.select({ userId: telegramLinks.userId }).from(telegramLinks)
        .where(eq(telegramLinks.chatId, targetChatId)).limit(1);
      return expectedUserId && link?.userId !== expectedUserId ? null : link?.userId ?? null;
    },
    // Usa a conexão já reservada; abrir outra aqui pode esgotar o pool.
    balance: (userId) => loadTelegramBalance(userId, tx),
    summary: (userId, period) => period === "weekly" ? renderDailySummary(userId, tx as unknown as typeof db, now, "weekly") : renderDailySummary(userId, tx as unknown as typeof db),
    report: (userId) => loadMonthlyReport(userId, now, tx),
    forecast: (userId) => manualForecast(userId, tx),
    dailyBudget: (userId) => manualDailyBudget(userId, tx),
    subscriptions: (userId) => manualSubscriptionsInsight(userId, tx),
    cards: (userId) => loadCardSummary(userId, tx, now),
    async pause(userId) {
      await tx.insert(telegramPreferences).values({ userId, enabled: false })
        .onConflictDoUpdate({ target: telegramPreferences.userId, set: { enabled: false, updatedAt: new Date() } });
    },
    notifications: async (userId) => {
      const [prefs] = await tx.select().from(telegramPreferences).where(eq(telegramPreferences.userId, userId)).limit(1);
      const enabled = prefs?.enabled ?? false;
      const hours = (prefs?.hours ?? [8, 14, 20]).map((h) => `${h}h`).join(", ");
      const check = (val: boolean | undefined) => (val !== false ? "✅" : "⏸️");
      return [
        `🔔 Avisos Automáticos: ${enabled ? "Ativos" : "Pausados"}`,
        `⏰ Horários: ${hours}`,
        "",
        "Tipos de avisos:",
        `• Resumo diário: ${check(prefs?.summary)}`,
        `• Gastos acima da média: ${check(prefs?.spending)}`,
        `• Contas a pagar: ${check(prefs?.dueBills)}`,
        `• Limites de orçamento: ${check(prefs?.budget)}`,
        `• Faturas de cartão: ${check(prefs?.cardInvoice)}`,
        `• Previsão de saldo: ${check(prefs?.negativeForecast)}`,
        "",
        "Use /pausar para pausar todos os avisos ou ajuste horários em Configurações no app.",
      ].join("\n");
    },
    undo: async () => {
      const undoRes = await undoTransactionDraft({ chatId, connection: tx as unknown as typeof db, now });
      if (!undoRes.ok) return undoRes.message ?? "Não foi possível desfazer o lançamento.";
      const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((undoRes.amountCents ?? 0) / 100);
      return `Lançamento desfeito com sucesso!\n• ${undoRes.description}: ${money} foi removido.`;
    },
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
    if (!state || state.count > CHAT_MAX_REQUESTS) {
      console.info("[telegram-webhook]", {
        event: "update_ignored",
        reason: state ? "rate_limit" : "deduplication",
        count: 1,
      });
      return null;
    }

    if (isFreeQuestion(message.text)) {
      const [link] = await tx.select({ userId: telegramLinks.userId }).from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1);
      if (!link) return "Vincule seu Telegram em Configurações no Mutano Contas antes de fazer perguntas.";
      return { kind: "question" as const, userId: link.userId, question: message.text!.trim() };
    }

    if (isFinancialCommand(message.text)) {
      const [link] = await tx.select({ userId: telegramLinks.userId }).from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1);
      if (link) return { kind: "financial" as const, userId: link.userId, now };
      return replyToCommand(message, tx, now, null);
    }

    const parsed = parseNaturalTransaction(message.text, now);
    if (parsed) {
      const [link] = await tx
        .select({ userId: telegramLinks.userId, createdAt: telegramLinks.createdAt })
        .from(telegramLinks)
        .where(eq(telegramLinks.chatId, chatId))
        .limit(1);

      if (!link) {
        return "Vincule seu Telegram em Configurações no Mutano Contas antes de registrar lançamentos.";
      }

      const draftRes = await createTransactionDraft({
        userId: link.userId,
        chatId,
        linkCreatedAt: link.createdAt,
        updateId,
        parsed,
        connection: tx as unknown as typeof db,
        now,
      });

      if (!draftRes.ok) {
        return draftRes.error ?? "Não foi possível registrar o lançamento.";
      }

      const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
        .format(parsed.amountCents / 100)
        .replace(/\u00A0/g, " ");
      const dateParts = parsed.date.split("-");
      const dateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      const kindLabel = parsed.kind === "INCOME" ? "receita" : "despesa";
      return `Confirmar ${kindLabel}?\n• ${parsed.description}: ${money}\n• Data: ${dateStr}\n• Conta: ${draftRes.accountName}`;
    }

    return replyToCommand(message, tx, now);
  });
  // Não segurar conexão nem lock do chat enquanto o provedor externo responde.
  if (result && typeof result === "object") {
    if (result.kind === "question") return answerQuestion(result.userId, chatId, result.question);
    // Interactive bot reads use the saved snapshot. Provider refresh belongs to
    // the integration's explicit sync or cron, never the webhook response path.
    // Leituras financeiras (ex.: /resumo com 15+ queries) rodam diretamente no pool
    // sem segurar uma db.transaction aberta por múltiplos round-trips.
    return replyToCommand(message, db as unknown as TelegramTransaction, result.now, result.userId);
  }
  return result;
}
