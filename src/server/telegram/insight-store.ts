import { and, eq, gt, gte, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramDeliveries, telegramLinks, telegramPreferences, transactions, users } from "@/db/schema";
import { loadInsightData } from "./insight-data";
import { DEFAULT_PREFERENCES, type InsightWindow, type Preferences } from "./insights";
import type { CronDependencies } from "./cron";
import { currentMonthRef, getNowInSaoPaulo, monthLabel, monthRange, todayRef } from "@/lib/dates";
import { buildInsight } from "./insights";
import { formatForecastSummary, monthForecast } from "@/lib/forecast";
import { calculateDailyBudget, formatDailyBudgetSummary } from "@/lib/daily-budget";
import { getDetectedSubscriptions } from "@/server/queries";

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
        window.monthly ? eq(telegramPreferences.summary, true) : undefined,
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
  const baseInsight = buildInsight(await loadInsightData(userId, window, connection), DEFAULT_PREFERENCES, window, true) ?? "Nenhum aviso para hoje.";

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
  if (!subs.length) return "Nenhuma assinatura recorrente identificada no extrato recente.";

  const lines: string[] = ["Assinaturas identificadas no seu extrato:"];
  for (const s of subs.slice(0, 6)) {
    const val = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.currentAmountCents / 100);
    const statusText = s.isRegistered ? "regra cadastrada" : "não cadastrado em regras";
    const increaseText = s.hasPriceIncrease ? ` (preço subiu +${s.priceIncreasePct}%)` : "";
    lines.push(`• ${s.name}: ${val}/mês [${statusText}]${increaseText}`);
  }
  return lines.join("\n").slice(0, 3800);
}

async function loadCurrentMonthFinancials(userId: string, connection: Pick<typeof db, "select">, now = new Date()) {
  const d = getNowInSaoPaulo(now);
  const ref = currentMonthRef(now);
  const { start, end } = monthRange(ref);
  const daysInMonth = new Date(ref.year, ref.month, 0).getDate();
  const dayOfMonth = d.getDate();

  const [totals, [user]] = await Promise.all([
    connection.select({
      kind: transactions.kind,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
    })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isTransfer, false),
          eq(transactions.isCardPayment, false),
          or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")),
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      )
      .groupBy(transactions.kind),
    connection.select({ monthlyIncomeCents: users.monthlyIncomeCents }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  const expenseCents = Number(totals.find((t) => t.kind === "EXPENSE")?.total ?? 0);
  const recordedIncomeCents = Number(totals.find((t) => t.kind === "INCOME")?.total ?? 0);
  const incomeCents = Number(user?.monthlyIncomeCents || recordedIncomeCents);

  return { incomeCents, expenseCents, dayOfMonth, daysInMonth, ref };
}

/** /previsao projeta gastos e saldo de fechamento do mês no ritmo atual. */
export async function manualForecast(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()): Promise<string> {
  const { incomeCents, expenseCents, dayOfMonth, daysInMonth, ref } = await loadCurrentMonthFinancials(userId, connection, now);
  const forecast = monthForecast({
    incomeCents,
    expenseSoFarCents: expenseCents,
    dayOfMonth,
    daysInMonth,
  });
  return formatForecastSummary(forecast, monthLabel(ref));
}

/** /hoje calcula o limite diário recomendado para fechar o mês no azul. */
export async function manualDailyBudget(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()): Promise<string> {
  const { incomeCents, expenseCents, dayOfMonth, daysInMonth } = await loadCurrentMonthFinancials(userId, connection, now);
  const daily = calculateDailyBudget({
    incomeCents,
    expenseSoFarCents: expenseCents,
    dayOfMonth,
    daysInMonth,
  });
  return formatDailyBudgetSummary(daily);
}
