import { and, asc, desc, eq, gte, ilike, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts as accountsTable,
  categories as categoriesTable,
  goalContributions,
  goals as goalsTable,
  transactions as txTable,
  users as usersTable,
} from "@/db/schema";
import { monthRange, monthShortLabel, lastNMonths, type MonthRef } from "@/lib/dates";
import type { MonthSummary } from "@/lib/finance";

export async function getUser(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error("USER_NOT_FOUND");
  return user;
}

export async function getAccounts(userId: string) {
  return db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.userId, userId), eq(accountsTable.archived, false)))
    .orderBy(asc(accountsTable.createdAt));
}

export async function getCategories(userId: string) {
  return db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.archived, false)))
    .orderBy(asc(categoriesTable.kind), asc(categoriesTable.name));
}

export async function getMonthSummary(userId: string, ref: MonthRef): Promise<MonthSummary> {
  const { start, end } = monthRange(ref);

  const rows = await db
    .select({
      kind: txTable.kind,
      nature: txTable.nature,
      total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
    })
    .from(txTable)
    .where(and(eq(txTable.userId, userId), gte(txTable.date, start), lt(txTable.date, end)))
    .groupBy(txTable.kind, txTable.nature);

  let incomeCents = 0;
  let expenseCents = 0;
  let fixedCents = 0;
  let variableCents = 0;

  for (const r of rows) {
    const total = Number(r.total);
    if (r.kind === "INCOME") {
      incomeCents += total;
    } else {
      expenseCents += total;
      if (r.nature === "FIXED") fixedCents += total;
      else variableCents += total;
    }
  }

  return { incomeCents, expenseCents, fixedCents, variableCents };
}

export type SeriesPoint = {
  key: string;
  label: string;
  entrou: number;
  saiu: number;
  sobrou: number;
  fixo: number;
  variavel: number;
};

export async function getMonthlySeries(
  userId: string,
  months: number,
  from?: MonthRef,
): Promise<SeriesPoint[]> {
  const refs = lastNMonths(months, from);
  const first = monthRange(refs[0]).start;
  const last = monthRange(refs[refs.length - 1]).end;

  const rows = await db
    .select({
      bucket: sql<string>`to_char(${txTable.date} at time zone 'UTC', 'YYYY-MM')`,
      kind: txTable.kind,
      nature: txTable.nature,
      total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
    })
    .from(txTable)
    .where(and(eq(txTable.userId, userId), gte(txTable.date, first), lt(txTable.date, last)))
    .groupBy(sql`1`, txTable.kind, txTable.nature);

  const buckets = new Map<string, SeriesPoint>();
  for (const ref of refs) {
    const key = `${ref.year}-${String(ref.month).padStart(2, "0")}`;
    buckets.set(key, { key, label: monthShortLabel(ref), entrou: 0, saiu: 0, sobrou: 0, fixo: 0, variavel: 0 });
  }

  for (const r of rows) {
    const bucket = buckets.get(r.bucket);
    if (!bucket) continue;
    const total = Number(r.total);
    if (r.kind === "INCOME") bucket.entrou += total;
    else {
      bucket.saiu += total;
      if (r.nature === "FIXED") bucket.fixo += total;
      else bucket.variavel += total;
    }
  }

  for (const b of buckets.values()) b.sobrou = b.entrou - b.saiu;
  return [...buckets.values()];
}

export type CategorySlice = {
  id: string;
  name: string;
  color: string;
  nature: "FIXED" | "VARIABLE";
  totalCents: number;
};

export async function getCategoryBreakdown(userId: string, ref: MonthRef): Promise<CategorySlice[]> {
  const { start, end } = monthRange(ref);

  const rows = await db
    .select({
      id: txTable.categoryId,
      name: categoriesTable.name,
      color: categoriesTable.color,
      nature: categoriesTable.nature,
      total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
    })
    .from(txTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, txTable.categoryId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.kind, "EXPENSE"),
        gte(txTable.date, start),
        lt(txTable.date, end),
      ),
    )
    .groupBy(txTable.categoryId, categoriesTable.name, categoriesTable.color, categoriesTable.nature);

  return rows
    .map((r) => ({
      id: r.id ?? "sem-categoria",
      name: r.name ?? "Sem categoria",
      color: r.color ?? "#94a3b8",
      nature: (r.nature ?? "VARIABLE") as "FIXED" | "VARIABLE",
      totalCents: Number(r.total),
    }))
    .filter((s) => s.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Custo de vida médio dos últimos N meses que já tiveram gasto lançado. */
export async function getAvgMonthlyCostCents(userId: string, months = 3): Promise<number> {
  const series = await getMonthlySeries(userId, months);
  const active = series.filter((s) => s.saiu > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((acc, s) => acc + s.saiu, 0) / active.length);
}

export async function getGoals(userId: string) {
  const list = await db
    .select()
    .from(goalsTable)
    .where(and(eq(goalsTable.userId, userId), eq(goalsTable.archived, false)))
    .orderBy(asc(goalsTable.kind), asc(goalsTable.createdAt));

  if (!list.length) return [];

  const contributions = await db
    .select()
    .from(goalContributions)
    .where(
      inArray(
        goalContributions.goalId,
        list.map((g) => g.id),
      ),
    )
    .orderBy(desc(goalContributions.date));

  return list.map((goal) => ({
    ...goal,
    contributions: contributions.filter((c) => c.goalId === goal.id).slice(0, 5),
  }));
}

export type TransactionFilters = {
  ref?: MonthRef;
  categoryId?: string;
  accountId?: string;
  kind?: "INCOME" | "EXPENSE";
  nature?: "FIXED" | "VARIABLE";
  search?: string;
};

export async function getTransactions(userId: string, filters: TransactionFilters, take = 300) {
  const conditions = [eq(txTable.userId, userId)];

  if (filters.ref) {
    const { start, end } = monthRange(filters.ref);
    conditions.push(gte(txTable.date, start), lt(txTable.date, end));
  }
  if (filters.categoryId) conditions.push(eq(txTable.categoryId, filters.categoryId));
  if (filters.accountId) conditions.push(eq(txTable.accountId, filters.accountId));
  if (filters.kind) conditions.push(eq(txTable.kind, filters.kind));
  if (filters.nature) conditions.push(eq(txTable.nature, filters.nature));
  if (filters.search) conditions.push(ilike(txTable.description, `%${filters.search}%`));

  return db
    .select({
      id: txTable.id,
      date: txTable.date,
      description: txTable.description,
      amountCents: txTable.amountCents,
      kind: txTable.kind,
      nature: txTable.nature,
      notes: txTable.notes,
      categoryId: txTable.categoryId,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      accountId: txTable.accountId,
      accountName: accountsTable.name,
    })
    .from(txTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, txTable.categoryId))
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(and(...conditions))
    .orderBy(desc(txTable.date), desc(txTable.createdAt))
    .limit(take);
}

export async function getTotalSavedCents(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${goalsTable.savedCents}), 0)::int` })
    .from(goalsTable)
    .where(and(eq(goalsTable.userId, userId), eq(goalsTable.archived, false)));
  return Number(row?.total ?? 0);
}
