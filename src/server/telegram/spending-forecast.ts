import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, budgets, categories, recurringRules, transactions, users } from "@/db/schema";
import { todayRef } from "@/lib/dates";
import { isConsumption, spendingForecast, type Commitment, type SpendingEntry } from "@/lib/spending-forecast";

/** All sources use the authenticated owner and the caller's connection. No writes. */
export async function loadSpendingForecast(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()) {
  const today = todayRef(now);
  const date = new Date(`${today}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const period = year * 12 + month;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const historyStart = new Date(Math.min(date.getTime() - 56 * 86_400_000, Date.UTC(year, month - 2, 1)));
  const end = new Date(Date.UTC(year, month, 1));
  const [rows, rules, unpaid, [user], limits] = await Promise.all([
    connection.select({ date: transactions.date, amountCents: transactions.amountCents, kind: transactions.kind,
      nature: transactions.nature, description: transactions.description, category: categories.name,
      accountType: accounts.type, isTransfer: transactions.isTransfer, isCardPayment: transactions.isCardPayment,
      externalStatus: transactions.externalStatus, recurringRuleId: transactions.recurringRuleId,
      installmentGroupId: transactions.installmentGroupId,
    }).from(transactions)
      .innerJoin(accounts, and(eq(accounts.id, transactions.accountId), eq(accounts.userId, userId)))
      .leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.userId, userId)))
      .where(and(eq(transactions.userId, userId), gte(transactions.date, historyStart), lt(transactions.date, end))),
    connection.select({ rule: recurringRules, accountType: accounts.type }).from(recurringRules)
      .innerJoin(accounts, and(eq(accounts.id, recurringRules.accountId), eq(accounts.userId, userId)))
      .where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true))),
    connection.select().from(bills).where(and(eq(bills.userId, userId), eq(bills.year, year), eq(bills.month, month), eq(bills.paid, false))),
    connection.select({ monthlyIncomeCents: users.monthlyIncomeCents }).from(users).where(eq(users.id, userId)).limit(1),
    connection.select({ category: categories.name, limitCents: budgets.limitCents }).from(budgets)
      .innerJoin(categories, and(eq(categories.id, budgets.categoryId), eq(categories.userId, userId)))
      .where(and(eq(budgets.userId, userId), eq(budgets.periodYear, year), eq(budgets.periodMonth, month))),
  ]);
  const entries: SpendingEntry[] = rows.map(r => ({ ...r, date: r.date.toISOString().slice(0, 10), category: r.category ?? "Sem categoria" }));
  const generated = new Set(entries.filter(r => r.date >= monthStart.toISOString().slice(0, 10)
    && (r.externalStatus === null || r.externalStatus === "POSTED" || r.externalStatus === "PENDING")).map(r => r.recurringRuleId));
  const commitments: Commitment[] = [];
  const dueDate = (day: number) => new Date(Date.UTC(year, month - 1, Math.min(day, new Date(end.getTime() - 86_400_000).getUTCDate()))).toISOString().slice(0, 10);
  for (const { rule, accountType } of rules) {
    if (generated.has(rule.id) || accountType === "INVESTMENT" || rule.startYear * 12 + rule.startMonth > period
      || (rule.endYear !== null && rule.endMonth !== null && rule.endYear * 12 + rule.endMonth < period)) continue;
    // Overdue ungenerated rules still reserve money this month.
    commitments.push({ date: dueDate(rule.dayOfMonth), amountCents: rule.amountCents, kind: rule.kind, name: rule.description });
  }
  for (const bill of unpaid) {
    const name = bill.name.trim().toLocaleLowerCase("pt-BR");
    // Bills have no transaction FK. Match amount and normalized description to
    // avoid reserving the same registered bill/rule twice in the current month.
    const represented = entries.some(r => isConsumption(r) && r.date.startsWith(today.slice(0, 7))
      && r.kind === "EXPENSE" && r.amountCents === bill.totalCents && r.description.trim().toLocaleLowerCase("pt-BR") === name)
      || commitments.some(r => r.kind === "EXPENSE" && r.amountCents === bill.totalCents && r.name.trim().toLocaleLowerCase("pt-BR") === name);
    if (!represented) commitments.push({ date: dueDate(bill.dueDay ?? date.getUTCDate()), amountCents: bill.totalCents, kind: "EXPENSE", name: bill.name });
  }
  return spendingForecast({ today, entries, commitments, expectedIncomeCents: user?.monthlyIncomeCents ?? 0, budgets: limits });
}
