import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramPreferences } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { loadMonthlyReport } from "./monthly-report";
import { manualDailyBudget, manualForecast, manualSubscriptionsInsight } from "./insight-store";
import { renderDailySummary } from "./daily-summary";
import { loadCardSummary } from "./card-summary";
import type { CommandDependencies } from "./protocol";

export type CommandConnection = Pick<typeof db, "select" | "insert">;

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


/** Same owner-scoped command implementations for Telegram and the authenticated site. */
export function ownerCommandDependencies(tx: CommandConnection, now = new Date()): Omit<CommandDependencies, "consumeCode" | "linkedUser" | "undo"> {
  return {
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
  };
}
