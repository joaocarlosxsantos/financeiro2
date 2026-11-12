import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, budgets, categories, goals, transactions } from "@/db/schema";
import { todayRef } from "@/lib/dates";
import { loadCardInvoicesAlerts } from "@/server/telegram/alerts";
import { loadProactiveContext } from "@/server/telegram/proactive-context";
import { buildAlertEvents, type AlertBillFact } from "./alerts-build";
import type { NotificationEvent } from "./policy";

const DAY = 86_400_000;

/** Coleta os fatos do dia no banco (sempre escopado pelo userId da sessão/cron) e monta os alertas. */
export async function loadAlertEvents(userId: string, now: Date): Promise<NotificationEvent[]> {
  const day = todayRef(now);
  const today = new Date(`${day}T00:00:00.000Z`);
  const year = today.getUTCFullYear(), month = today.getUTCMonth() + 1, index = year * 12 + month;
  const monthStart = new Date(Date.UTC(year, month - 1, 1)), nextMonthStart = new Date(Date.UTC(year, month, 1));
  const civilToday = new Date(`${day}T12:00:00.000Z`);

  const [billRows, budgetRows, spendRows, goalRows, cardsDue, context] = await Promise.all([
    db.select({ id: bills.id, name: bills.name, year: bills.year, month: bills.month, dueDay: bills.dueDay, totalCents: bills.totalCents })
      .from(bills)
      .where(and(eq(bills.userId, userId), eq(bills.paid, false),
        sql`(${bills.year} * 12 + ${bills.month}) between ${index - 1} and ${index + 1}`)),
    db.select({ id: budgets.id, categoryId: budgets.categoryId, name: categories.name, limitCents: budgets.limitCents })
      .from(budgets)
      .leftJoin(categories, and(eq(categories.id, budgets.categoryId), eq(categories.userId, userId)))
      .where(and(eq(budgets.userId, userId), eq(budgets.periodYear, year), eq(budgets.periodMonth, month))),
    db.select({ categoryId: transactions.categoryId, total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.kind, "EXPENSE"), eq(transactions.isTransfer, false),
        eq(transactions.isCardPayment, false), or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")),
        gte(transactions.date, monthStart), lt(transactions.date, nextMonthStart)))
      .groupBy(transactions.categoryId),
    db.select({ id: goals.id, name: goals.name, targetCents: goals.targetCents, savedCents: goals.savedCents, targetDate: goals.targetDate })
      .from(goals).where(and(eq(goals.userId, userId), eq(goals.archived, false))),
    loadCardInvoicesAlerts(userId, civilToday),
    loadProactiveContext(userId, day),
  ]);

  const spentByCategory = new Map(spendRows.map((row) => [row.categoryId, Number(row.total ?? 0)]));
  const billFacts = billRows.flatMap((bill): AlertBillFact[] => {
    if (!bill.dueDay) return [];
    const lastDay = new Date(Date.UTC(bill.year, bill.month, 0)).getUTCDate();
    const due = new Date(Date.UTC(bill.year, bill.month - 1, Math.min(bill.dueDay, lastDay)));
    const diffDays = Math.round((due.getTime() - today.getTime()) / DAY);
    return diffDays === -1 || diffDays === 0 || diffDays === 3
      ? [{ id: bill.id, name: bill.name, totalCents: Number(bill.totalCents), dueDate: due.toISOString().slice(0, 10), diffDays }]
      : [];
  });

  return buildAlertEvents(userId, {
    bills: billFacts,
    cardsDue: cardsDue.map((card) => ({ id: card.id, cardName: card.cardName, invoiceCents: card.invoiceCents, date: card.dueDate, diffDays: card.diffDays })),
    cardsClosing: context.cardClosings.map((card) => ({ id: card.id, cardName: card.cardName, date: card.closingDate, diffDays: card.diffDays })),
    budgets: budgetRows.map((budget) => ({ id: budget.id, name: budget.name ?? "Categoria sem gastos",
      limitCents: Number(budget.limitCents), spentCents: spentByCategory.get(budget.categoryId) ?? 0 })),
    goals: goalRows.map((goal) => ({ id: goal.id, name: goal.name, savedCents: Number(goal.savedCents),
      targetCents: Number(goal.targetCents), targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null })),
    syncProblem: context.syncProblem,
  }, day);
}
