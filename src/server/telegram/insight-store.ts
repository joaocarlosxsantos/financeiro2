import { and, eq, gt, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramDeliveries, telegramLinks, telegramPreferences } from "@/db/schema";
import { loadSpendingForecast } from "./spending-forecast";
import { loadInsightData } from "./insight-data";
import { DEFAULT_PREFERENCES, dayDate, type InsightWindow, type Preferences } from "./insights";
import type { CronDependencies } from "./cron";
import { currentMonthRef, monthLabel, todayRef } from "@/lib/dates";
import { buildInsight } from "./insights";
import { formatCents } from "@/lib/money";
import { getDetectedSubscriptions } from "@/server/queries";
import { enrichAndFilterProactiveAlerts, loadCardInvoicesAlerts, loadForecastAlert } from "./alerts";

export async function getTelegramPreferences(userId: string): Promise<Preferences> {
  try {
    const [row] = await db.select().from(telegramPreferences).where(eq(telegramPreferences.userId, userId)).limit(1);
    if (!row) return { ...DEFAULT_PREFERENCES, hours: [...DEFAULT_PREFERENCES.hours] };
    return {
      enabled: row.enabled,
      hours: row.hours as Preferences["hours"],
      summary: row.summary,
      spending: row.spending,
      dueBills: row.dueBills,
      budget: row.budget,
      cardInvoice: (row as { cardInvoice?: boolean }).cardInvoice ?? true,
      negativeForecast: (row as { negativeForecast?: boolean }).negativeForecast ?? true,
    };
  } catch {
    // Fallback se a migration 0025 ainda não tiver sido aplicada no banco
    try {
      const [fallbackRow] = await db
        .select({
          enabled: telegramPreferences.enabled,
          hours: telegramPreferences.hours,
          summary: telegramPreferences.summary,
          spending: telegramPreferences.spending,
          dueBills: telegramPreferences.dueBills,
          budget: telegramPreferences.budget,
        })
        .from(telegramPreferences)
        .where(eq(telegramPreferences.userId, userId))
        .limit(1);
      if (!fallbackRow) return { ...DEFAULT_PREFERENCES, hours: [...DEFAULT_PREFERENCES.hours] };
      return {
        enabled: fallbackRow.enabled,
        hours: fallbackRow.hours as Preferences["hours"],
        summary: fallbackRow.summary,
        spending: fallbackRow.spending,
        dueBills: fallbackRow.dueBills,
        budget: fallbackRow.budget,
        cardInvoice: true,
        negativeForecast: true,
      };
    } catch {
      return { ...DEFAULT_PREFERENCES, hours: [...DEFAULT_PREFERENCES.hours] };
    }
  }
}

export async function setTelegramPreferences(userId: string, prefs: Preferences) {
  try {
    await db.insert(telegramPreferences).values({ userId, ...prefs })
      .onConflictDoUpdate({ target: telegramPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
  } catch {
    // Fallback se a coluna ainda não existir no Postgres antes do deploy
    const legacyPrefs = {
      enabled: prefs.enabled,
      hours: prefs.hours,
      summary: prefs.summary,
      spending: prefs.spending,
      dueBills: prefs.dueBills,
      budget: prefs.budget,
    };
    await db.insert(telegramPreferences).values({ userId, ...legacyPrefs })
      .onConflictDoUpdate({ target: telegramPreferences.userId, set: { ...legacyPrefs, updatedAt: new Date() } });
  }
}

export const cronDependencies: CronDependencies = {
  async candidates(window, afterUserId) {
    const rows = await db.select({ userId: telegramLinks.userId, chatId: telegramLinks.chatId, prefs: telegramPreferences })
      .from(telegramLinks).innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(and(afterUserId ? gt(telegramLinks.userId, afterUserId) : undefined,
        eq(telegramPreferences.enabled, true), sql`${telegramPreferences.hours} @> ARRAY[${window.hour}]::integer[]`,
        window.monthly ? eq(telegramPreferences.summary, true) : undefined,
        notExists(db.select({ id: telegramDeliveries.id }).from(telegramDeliveries).where(and(
          eq(telegramDeliveries.userId, telegramLinks.userId), eq(telegramDeliveries.windowKey, window.key),
        )))))
      .orderBy(telegramLinks.userId).limit(100);
    return rows.map((row) => ({ ...row, prefs: { ...row.prefs, hours: row.prefs.hours as Preferences["hours"] } }));
  },
  data: loadInsightData,
  async renderMessage(recipient, window) {
    const rawData = await loadInsightData(recipient.userId, window);
    const dedupedData = await enrichAndFilterProactiveAlerts(recipient.userId, rawData, window);
    return buildInsight(dedupedData, recipient.prefs, window);
  },
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
        window.monthly ? eq(telegramPreferences.summary, true) : undefined,
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
  const baseData = await loadInsightData(userId, window, connection);
  const today = dayDate(window.day);
  const [cardInvoices, forecast] = await Promise.all([
    loadCardInvoicesAlerts(userId, today, connection),
    loadForecastAlert(userId, today, connection),
  ]);
  const enrichedData = { ...baseData, cardInvoices, forecast };
  const baseInsight = buildInsight(enrichedData, DEFAULT_PREFERENCES, window, true) ?? "Nenhum aviso para hoje.";

  try {
    const subs = await getDetectedSubscriptions(userId, connection);
    const priceIncreases = subs.filter((s) => s.hasPriceIncrease);
    const extraLines: string[] = [];

    for (const sub of priceIncreases.slice(0, 2)) {
      const prev = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((sub.previousAmountCents ?? 0) / 100);
      const curr = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sub.currentAmountCents / 100);
      extraLines.push(`Aviso de assinatura: ${sub.name} subiu de ${prev} para ${curr} (+${sub.priceIncreasePct}%).`);
    }

    if (extraLines.length > 0) {
      return `${baseInsight}\n${extraLines.join("\n")}`.slice(0, 3800);
    }
  } catch {
    // Falha silenciosa no enriquecimento não impede o resumo base
  }

  return baseInsight;
}

/** Consulta de assinaturas detectadas e aumentos de preço para o bot */
export async function manualSubscriptionsInsight(userId: string, connection: Pick<typeof db, "select"> = db): Promise<string> {
  const subs = await getDetectedSubscriptions(userId, connection);
  if (!subs.length) return "Nenhuma assinatura mensal ou anual confirmada por cobranças recorrentes.";

  const lines: string[] = ["Assinaturas identificadas nos seus lançamentos:"];
  for (const s of subs.slice(0, 6)) {
    const val = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.currentAmountCents / 100);
    const statusText = s.isRegistered ? "regra cadastrada" : "não cadastrado em regras";
    const increaseText = s.hasPriceIncrease ? ` (preço subiu +${s.priceIncreasePct}%)` : "";
    const name = s.name.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, 60);
    lines.push(`• ${name}: ${val}/${s.cadence === "annual" ? "ano" : "mês"} [${statusText}]${increaseText}`);
  }
  return lines.join("\n").slice(0, 3800);
}

/** /previsao: resultado mensal, compromissos e ritmo variável robusto. */
export async function manualForecast(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()): Promise<string> {
  const { forecast, committedCents, historyDays, insights } = await loadSpendingForecast(userId, connection, now);
  return [`Previsão (${monthLabel(currentMonthRef(now))}): ${forecast.projectedBalanceCents >= 0 ? "sobra" : "falta"} mensal de ${formatCents(Math.abs(forecast.projectedBalanceCents))}.`,
    `Ritmo variável: ${formatCents(forecast.dailyAvgCents)}/dia; compromissos incluídos: ${formatCents(committedCents)}.`,
    ...(historyDays < 14 ? ["Histórico curto: estimativa limitada."] : []),
    ...insights.slice(0, 3)].join("\n");
}

/** /hoje: saldo mensal livre após reservar os compromissos, ponderado pelo dia. */
export async function manualDailyBudget(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()): Promise<string> {
  const { daily } = await loadSpendingForecast(userId, connection, now);
  if (daily.availableForRestOfMonthCents <= 0) return `Sem margem para novos gastos. Falta mensal após compromissos: ${formatCents(Math.abs(daily.availableForRestOfMonthCents))}.`;
  return `Restante para hoje: ${formatCents(daily.remainingTodayCents)}. Teto do dia: ${formatCents(daily.dailyAllowanceCents)}, ponderado pelo dia da semana.\nLivre no mês após compromissos: ${formatCents(daily.availableForRestOfMonthCents)} para ${daily.daysRemainingWithToday} dias (renda prevista).`;
}
