import { createHash } from "crypto";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, openFinanceInvoices, telegramDeliveries, transactions } from "@/db/schema";
import { type InsightData, type InsightWindow } from "./insights";
import { getCivilToday, invoiceCycle, toCivilUtcDate } from "@/lib/invoices";
import { sanitizeCardName } from "./card-summary";
import { loadSpendingForecast } from "./spending-forecast";
import { loadProactiveContext } from "./proactive-context";

/**
 * Gera chave determinista de deduplicação com no máximo 13 caracteres,
 * respeitando a coluna windowKey (varchar(13)) de telegramDeliveries.
 */
export function alertDedupeKey(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `a${hash}`;
}

/**
 * Tenta reservar a entrega de um alerta específico para o usuário no período.
 * Retorna true se for o primeiro envio (reservado com sucesso), ou false se já foi entregue.
 */
export async function claimAlertDedupe(
  userId: string,
  alertKey: string,
  connection: Pick<typeof db, "insert"> = db,
): Promise<boolean> {
  const windowKey = alertDedupeKey(alertKey);
  try {
    const [row] = await connection
      .insert(telegramDeliveries)
      .values({ userId, windowKey, status: "SENT" })
      .onConflictDoNothing()
      .returning({ id: telegramDeliveries.id });
    return Boolean(row);
  } catch {
    // Fail closed: uncertain delivery history must not produce repeat alerts.
    return false;
  }
}

/**
 * Busca faturas de cartões de crédito do usuário próximas do vencimento (3 dias, 1 dia, hoje).
 */
export async function loadCardInvoicesAlerts(
  userId: string,
  today: Date,
  connection: Pick<typeof db, "select"> = db,
): Promise<NonNullable<InsightData["cardInvoices"]>> {
  try {
    const cardAccounts = await connection
      .select({
        id: accounts.id,
        name: accounts.name,
        closingDay: accounts.closingDay,
        dueDay: accounts.dueDay,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.type, "CREDIT_CARD"), eq(accounts.archived, false)));

    const civilToday = getCivilToday(today);
    const todayTime = civilToday.getTime();
    const cardInvoices: NonNullable<InsightData["cardInvoices"]> = [];

    const validCards = cardAccounts.filter(
      (c): c is typeof c & { closingDay: number; dueDay: number } => Boolean(c.closingDay && c.dueDay),
    );
    if (!validCards.length) return cardInvoices;

    const cyclesByCard = new Map(
      validCards.map((card) => [card.id, invoiceCycle(civilToday, card.closingDay, card.dueDay)]),
    );

    const ofInvoices = await connection
      .select({
        accountId: openFinanceInvoices.accountId,
        invoiceRef: openFinanceInvoices.invoiceRef,
        totalAmountCents: openFinanceInvoices.totalAmountCents,
      })
      .from(openFinanceInvoices)
      .where(
        and(
          eq(openFinanceInvoices.userId, userId),
          inArray(
            openFinanceInvoices.accountId,
            validCards.map((c) => c.id),
          ),
        ),
      );

    const ofInvoiceMap = new Map<string, number | null>();
    for (const inv of ofInvoices) {
      if (inv.accountId && inv.invoiceRef) {
        ofInvoiceMap.set(`${inv.accountId}:${inv.invoiceRef}`, inv.totalAmountCents);
      }
    }

    for (const card of validCards) {
      try {
        const cycle = cyclesByCard.get(card.id)!;
        let invoiceCents: number | null = ofInvoiceMap.get(`${card.id}:${cycle.ref}`) ?? null;

        if (invoiceCents === null) {
          const [txRow] = await connection
            .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int` })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.accountId, card.id),
                eq(transactions.kind, "EXPENSE"),
                eq(transactions.isTransfer, false),
                eq(transactions.isCardPayment, false),
                or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")),
                gte(transactions.date, cycle.periodStart),
                lt(transactions.date, cycle.closesOn),
              ),
            );
          invoiceCents = Number(txRow?.total ?? 0);
        }

        if (invoiceCents > 0) {
          const dueCivil = toCivilUtcDate(cycle.dueOn);
          const diffDays = Math.round((dueCivil.getTime() - todayTime) / 86_400_000);
          if (diffDays === 0 || diffDays === 1 || diffDays === 3) {
            const dueDayFormatted = `${String(cycle.dueOn.getUTCDate()).padStart(2, "0")}/${String(cycle.dueOn.getUTCMonth() + 1).padStart(2, "0")}`;
            cardInvoices.push({
              id: card.id,
              cardName: sanitizeCardName(card.name),
              invoiceCents,
              dueDate: dueDayFormatted,
              diffDays,
            });
          }
        }
      } catch {
        // Ignora erros em cartões individuais
      }
    }
    return cardInvoices;
  } catch {
    return [];
  }
}

/**
 * Calcula a previsão mensal e retorna alerta caso o saldo previsto seja negativo.
 */
export async function loadForecastAlert(
  userId: string,
  today: Date,
  connection: Pick<typeof db, "select"> = db,
): Promise<InsightData["forecast"]> {
  try {
    const { forecast, daily, historyDays } = await loadSpendingForecast(userId, connection, today);
    if (forecast.projectedBalanceCents < 0) {
      return {
        balanceCents: forecast.projectedBalanceCents,
        projectedExpenseCents: forecast.projectedExpenseCents,
        recommendedDailyCents: daily.remainingTodayCents,
        status: forecast.status,
        limitedHistory: historyDays < 14,
      };
    }
  } catch {
    // Falha silenciosa
  }
  return undefined;
}

/**
 * Filtra alertas proativos garantindo idempotência e evitando repetição desnecessária:
 * - Fatura de cartão: 1 alerta por cartão por intervalo (3 dias, 1 dia, hoje)
 * - Contas a pagar: 1 alerta por conta por intervalo (amanhã, hoje)
 * - Orçamento 80%: 1 alerta preventivo por categoria por mês
 * - Orçamento 100%: 1 alerta de estouro por categoria por mês
 * - Saldo previsto negativo: 1 alerta por usuário por dia
 */
export async function filterProactiveAlerts(
  userId: string,
  data: InsightData,
  window: InsightWindow,
  connection: Pick<typeof db, "insert"> = db,
): Promise<InsightData> {
  // 1. Filtrar contas a pagar
  const dedupedDue = [];
  for (const bill of data.due) {
    if (bill.diffDays === 0 || bill.diffDays === 1) {
      const key = `bill:${bill.name}:${bill.diffDays}:${bill.date}`;
      const claimed = await claimAlertDedupe(userId, key, connection);
      if (claimed) dedupedDue.push(bill);
    } else {
      dedupedDue.push(bill);
    }
  }

  // 2. Filtrar faturas de cartão de crédito
  const dedupedInvoices = [];
  for (const inv of data.cardInvoices ?? []) {
    if (inv.diffDays === 0 || inv.diffDays === 1 || inv.diffDays === 3) {
      const key = `inv:${inv.id}:${inv.diffDays}:${inv.dueDate}`;
      const claimed = await claimAlertDedupe(userId, key, connection);
      if (claimed) dedupedInvoices.push(inv);
    } else {
      dedupedInvoices.push(inv);
    }
  }

  // 3. Filtrar orçamentos de categoria (período do mês)
  const monthPeriod = window.day.slice(0, 7);
  const dedupedBudgets = [];
  for (const b of data.budgets) {
    if (b.spentCents >= b.limitCents && b.limitCents > 0) {
      const key = `b100:${b.id ?? b.name}:${monthPeriod}`;
      const claimed = await claimAlertDedupe(userId, key, connection);
      if (claimed) dedupedBudgets.push(b);
    } else if (b.spentCents >= Math.round(b.limitCents * 0.8) && b.limitCents > 0) {
      const key = `b80:${b.id ?? b.name}:${monthPeriod}`;
      const claimed = await claimAlertDedupe(userId, key, connection);
      if (claimed) dedupedBudgets.push(b);
    } else {
      dedupedBudgets.push(b);
    }
  }

  // 4. Filtrar previsão de saldo negativo (período diário)
  let dedupedForecast = data.forecast;
  if (data.forecast && data.forecast.balanceCents < 0) {
    const key = `fcneg:${window.day}`;
    const claimed = await claimAlertDedupe(userId, key, connection);
    if (!claimed) dedupedForecast = undefined;
  }

  const cardClosings = [];
  for (const card of data.cardClosings ?? []) {
    if (await claimAlertDedupe(userId, `close:${card.id}:${card.closingDate}:${card.diffDays}`, connection)) cardClosings.push(card);
  }
  const syncProblem = data.syncProblem && await claimAlertDedupe(userId, `sync:${window.day}`, connection);
  const cashBalanceCents = data.cashBalanceCents !== undefined && data.cashBalanceCents <= 0
    ? await claimAlertDedupe(userId, `cashlow:${window.day}`, connection) ? data.cashBalanceCents : undefined
    : data.cashBalanceCents;

  return {
    ...data,
    due: dedupedDue,
    cardInvoices: dedupedInvoices,
    budgets: dedupedBudgets,
    forecast: dedupedForecast,
    cardClosings,
    syncProblem,
    cashBalanceCents,
  };
}

/**
 * Enriquece os dados base com faturas de cartão e previsão negativa, e filtra por deduplicação.
 */
export async function enrichAndFilterProactiveAlerts(
  userId: string,
  baseData: InsightData,
  window: InsightWindow,
  connection: typeof db = db,
): Promise<InsightData> {
  const today = new Date(`${window.day}T12:00:00.000Z`);
  const [cardInvoices, forecast, context] = await Promise.all([
    loadCardInvoicesAlerts(userId, today, connection),
    loadForecastAlert(userId, today, connection),
    loadProactiveContext(userId, window.day, connection),
  ]);

  const enriched: InsightData = {
    ...baseData,
    cardInvoices,
    forecast,
    ...context,
  };

  return filterProactiveAlerts(userId, enriched, window, connection);
}
