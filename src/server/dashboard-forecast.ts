import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { monthRange, type MonthRef } from "@/lib/dates";
import { dashboardForecast, forecastCalendar, type ForecastTotals } from "@/lib/dashboard-forecast";
import type { RecurringStatus } from "./queries";

/** Owner is obtained by the authenticated page, never from URL/form input. */
export async function getDashboardForecast(userId: string, ref: MonthRef, options: {
  now: Date;
  expectedIncomeCents: number;
  pendingRules: RecurringStatus["pending"];
}, connection: Pick<typeof db, "select"> = db) {
  const { start, end } = monthRange(ref);
  const calendar = forecastCalendar(ref, options.now);
  const tomorrow = new Date(`${calendar.today}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  // PENDING is a commitment, never a realized payment. Future-dated entries
  // are commitments even when the bank/manual status says POSTED/null.
  const pending = sql<boolean>`(${transactions.externalStatus} = 'PENDING' or ${transactions.date} >= ${tomorrow.toISOString()}::timestamptz)`;
  const [rows, accountRows] = await Promise.all([
    connection.select({
      kind: transactions.kind,
      nature: transactions.nature,
      pending: sql<boolean>`coalesce(${pending}, false)`,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
      ruleIds: sql<string[]>`array_remove(array_agg(${transactions.recurringRuleId}), null)`,
      variableTotal: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.nature} = 'VARIABLE' and ${transactions.isCardPayment} = false), 0)::bigint`,
    }).from(transactions)
      .innerJoin(accounts, and(eq(accounts.id, transactions.accountId), eq(accounts.userId, userId)))
      .where(and(eq(transactions.userId, userId), eq(transactions.isTransfer, false),
        sql`${accounts.type} <> 'CREDIT_CARD'`,
        or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED"), eq(transactions.externalStatus, "PENDING")),
        gte(transactions.date, start), lt(transactions.date, end)))
      // Ordinal avoids repeating the bound date with different PostgreSQL
      // parameter numbers in SELECT/GROUP BY (which are distinct expressions).
      .groupBy(transactions.kind, transactions.nature, sql`3`),
    connection.select({ id: accounts.id, type: accounts.type, financeMode: accounts.financeMode, archived: accounts.archived })
      .from(accounts).where(eq(accounts.userId, userId)),
  ]);

  const realized: ForecastTotals = { incomeCents: 0, expenseCents: 0, variableCents: 0, count: 0 };
  const scheduled: ForecastTotals = { ...realized };
  const generatedIds = new Set(rows.flatMap(r => r.ruleIds));
  for (const row of rows) {
    const target = row.pending ? scheduled : realized;
    const amount = Number(row.total);
    target.count += Number(row.count);
    if (row.kind === "INCOME") target.incomeCents += amount;
    else {
      target.expenseCents += amount;
      // Invoice payments are counted in cash outflow, but are not daily
      // consumption to repeat through the rest of the month.
      if (row.nature === "VARIABLE") target.variableCents += Number(row.variableTotal);
    }
  }

  // Only ungenerated manual cash rules are additional commitments. Card
  // purchases stay demonstrative; cash invoice payments count once above.
  const eligible = new Set(accountRows.filter(a => a.type !== "CREDIT_CARD" && a.financeMode === "manual" && !a.archived).map(a => a.id));
  for (const rule of options.pendingRules) {
    if (!eligible.has(rule.accountId) || generatedIds.has(rule.id)) continue;
    generatedIds.add(rule.id);
    scheduled.count++;
    if (rule.kind === "INCOME") scheduled.incomeCents += rule.amountCents;
    else {
      scheduled.expenseCents += rule.amountCents;
      if (rule.nature === "VARIABLE") scheduled.variableCents += rule.amountCents;
    }
  }

  return dashboardForecast({ ref, now: options.now, expectedIncomeCents: options.expectedIncomeCents, realized, scheduled });
}
