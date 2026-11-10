import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, categories, transactions } from "@/db/schema";
import { getBalances } from "@/server/queries";
import { dayDate } from "./insights";
import { safeLabel, validToolInput } from "./ai-policy";

/** Não recebe identidade no input: userId é fechado pelo chamador autenticado. */
export async function executeReadTool(userId: string, name: string, input: unknown, today: string, connection: Pick<typeof db, "select"> = db) {
  const parsed = validToolInput(name, input, today);
  if (!parsed) return { error: "ferramenta_ou_argumentos_invalidos" };
  const common = and(eq(transactions.userId, userId), eq(transactions.isTransfer, false), eq(transactions.isCardPayment, false),
    or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")));
  if (parsed.name === "get_balance") {
    const balance = await getBalances(userId, connection);
    return { availableCents: balance.availableCents, partial: balance.totalIncomplete, checkOpeningBalance: balance.needsOpeningBalance, currency: "BRL" };
  }
  const args = parsed.input;
  if ("start_date" in args) {
    const start = dayDate(args.start_date);
    const end = dayDate(args.end_date, 1);
    const filter = and(common, eq(transactions.kind, "EXPENSE"), gte(transactions.date, start), lt(transactions.date, end));
    if (parsed.name === "get_spending_by_category") {
      const total = sql<number>`sum(${transactions.amountCents})`;
      const rows = await connection.select({ category: categories.name, amountCents: total }).from(transactions)
        .leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.userId, userId)))
        .where(filter).groupBy(transactions.categoryId, categories.name).orderBy(desc(total)).limit(5);
      return { start: args.start_date, end: args.end_date, top: 5, currency: "BRL", rows: rows.map((row) => ({ category: safeLabel(row.category ?? "Sem categoria"), amountCents: Number(row.amountCents) })) };
    }
    const limit = "limit" in args ? args.limit : 5;
    const rows = await connection.select({ date: transactions.date, category: categories.name, amountCents: transactions.amountCents }).from(transactions)
      .leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.userId, userId)))
      .where(filter).orderBy(desc(transactions.amountCents), desc(transactions.date)).limit(limit);
    return { start: args.start_date, end: args.end_date, top: limit, currency: "BRL", rows: rows.map((row) => ({ date: row.date.toISOString().slice(0, 10), category: safeLabel(row.category ?? "Sem categoria"), amountCents: row.amountCents })) };
  }
  if ("first_month" in args) {
    const summaries = [];
    for (const month of [args.first_month, args.second_month]) {
      const start = new Date(`${month}-01T00:00:00Z`);
      const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const tomorrow = dayDate(today, 1);
      const rows = await connection.select({ kind: transactions.kind, total: sql<number>`sum(${transactions.amountCents})` }).from(transactions)
        .where(and(common, gte(transactions.date, start), lt(transactions.date, next < tomorrow ? next : tomorrow))).groupBy(transactions.kind);
      summaries.push({ month, incomeCents: Number(rows.find((r) => r.kind === "INCOME")?.total ?? 0), expenseCents: Number(rows.find((r) => r.kind === "EXPENSE")?.total ?? 0) });
    }
    return { currency: "BRL", rows: summaries };
  }
  if ("days" in args) {
    const start = dayDate(today);
    const end = dayDate(today, args.days + 1);
    const dueDate = sql`make_date(${bills.year}, ${bills.month}, least(${bills.dueDay}, extract(day from (make_date(${bills.year}, ${bills.month}, 1) + interval '1 month - 1 day'))::integer))`;
    const rows = await connection.select({ name: bills.name, date: sql<string>`to_char(${dueDate}, 'YYYY-MM-DD')`, totalCents: bills.totalCents }).from(bills)
      .where(and(eq(bills.userId, userId), eq(bills.paid, false), sql`${bills.dueDay} is not null`, gte(dueDate, start), lt(dueDate, end)))
      .orderBy(dueDate, bills.name).limit(5);
    return { currency: "BRL", top: 5, valuesAreWholeBill: true, rows: rows.map((row) => ({ date: row.date, name: safeLabel(row.name), totalCents: row.totalCents })) };
  }
  return { error: "ferramenta_ou_argumentos_invalidos" };
}
