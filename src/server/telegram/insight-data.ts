import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, budgets, categories, transactions } from "@/db/schema";
import { dayDate, type InsightData, type InsightWindow } from "./insights";

/** Todas as leituras exigem o dono determinado no servidor; datas civis do app em UTC. */
export async function loadInsightData(userId: string, window: InsightWindow, connection: Pick<typeof db, "select"> = db): Promise<InsightData> {
  const today = dayDate(window.day);
  const tomorrow = dayDate(window.day, 1);
  const summaryStart = dayDate(window.day, window.hour === 8 ? -1 : 0);
  const summaryEnd = new Date(summaryStart.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const historyStart = dayDate(window.day, -30);
  const common = and(eq(transactions.userId, userId), eq(transactions.isTransfer, false),
    eq(transactions.isCardPayment, false), or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")));
  const [totals, spending, limits, upcoming] = await Promise.all([
    connection.select({ kind: transactions.kind, total: sql<number>`coalesce(sum(${transactions.amountCents}),0)` })
      .from(transactions).where(and(common, gte(transactions.date, summaryStart), lt(transactions.date, summaryEnd))).groupBy(transactions.kind),
    connection.select({
      id: transactions.categoryId, name: categories.name,
      todayCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.date} >= ${today}),0)`,
      historyCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.date} < ${today}),0)`,
      historyCount: sql<number>`count(*) filter (where ${transactions.date} < ${today})`,
      historyDays: sql<number>`count(distinct (${transactions.date} at time zone 'UTC')::date) filter (where ${transactions.date} < ${today})`,
      monthCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.date} >= ${monthStart}),0)`,
    }).from(transactions).leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.userId, userId)))
      .where(and(common, eq(transactions.kind, "EXPENSE"), gte(transactions.date, historyStart < monthStart ? historyStart : monthStart), lt(transactions.date, tomorrow)))
      .groupBy(transactions.categoryId, categories.name),
    connection.select({ categoryId: budgets.categoryId, limitCents: budgets.limitCents }).from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.periodYear, today.getUTCFullYear()), eq(budgets.periodMonth, today.getUTCMonth() + 1))),
    connection.select({ name: bills.name, year: bills.year, month: bills.month, dueDay: bills.dueDay, totalCents: bills.totalCents }).from(bills)
      .where(and(eq(bills.userId, userId), eq(bills.paid, false), sql`(${bills.year} * 12 + ${bills.month}) between ${today.getUTCFullYear() * 12 + today.getUTCMonth() + 1} and ${today.getUTCFullYear() * 12 + today.getUTCMonth() + 2}`)),
  ]);
  const byCategory = new Map(spending.map((c) => [c.id, c]));
  const dueEnd = dayDate(window.day, 4).getTime();
  return {
    summaryDay: summaryStart.toISOString().slice(0, 10),
    incomeCents: Number(totals.find((t) => t.kind === "INCOME")?.total ?? 0),
    expenseCents: Number(totals.find((t) => t.kind === "EXPENSE")?.total ?? 0),
    categories: spending.map((c) => ({ name: c.name ?? "Sem categoria", todayCents: Number(c.todayCents), historyCents: Number(c.historyCents), historyCount: Number(c.historyCount), historyDays: Number(c.historyDays) })),
    budgets: limits.map((b) => ({ name: byCategory.get(b.categoryId)?.name ?? "Categoria sem gastos", limitCents: b.limitCents, spentCents: Number(byCategory.get(b.categoryId)?.monthCents ?? 0) })),
    due: upcoming.flatMap((bill) => {
      if (!bill.dueDay) return [];
      const day = Math.min(bill.dueDay, new Date(Date.UTC(bill.year, bill.month, 0)).getUTCDate());
      const date = new Date(Date.UTC(bill.year, bill.month - 1, day));
      const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      return date.getTime() >= today.getTime() && date.getTime() < dueEnd
        ? [{ name: bill.name, totalCents: bill.totalCents, date: date.toISOString().slice(0, 10), diffDays }]
        : [];
    }).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
