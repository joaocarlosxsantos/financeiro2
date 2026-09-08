import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts as accountsTable,
  billGroupings as billGroupingsTable,
  billParticipants as billParticipantsTable,
  billRuleParticipants as billRuleParticipantsTable,
  billRules as billRulesTable,
  bills as billsTable,
  budgets as budgetsTable,
  categories as categoriesTable,
  debtPayments,
  debts as debtsTable,
  goalContributions,
  goalRecurringRules as goalRecurringRulesTable,
  recurringRules as recurringRulesTable,
  goals as goalsTable,
  transactions as txTable,
  users as usersTable,
} from "@/db/schema";
import { monthRange, monthShortLabel, lastNMonths, shiftMonth, type MonthRef } from "@/lib/dates";
import type { MonthSummary } from "@/lib/finance";
import { monthlyInterestCents } from "@/lib/debts";
import { accountBalance, netWorth } from "@/lib/balances";

/**
 * O usuário da sessão.
 *
 * Se o id da sessão não existe mais no banco, a sessão está órfã — conta
 * apagada, banco trocado, cookie antigo. Isso não é erro do sistema: é alguém
 * deslogado segurando um cookie velho. Mandamos limpar a sessão em vez de
 * estourar um 500 (e mandar direto para /login criaria um laço, porque de lá
 * a sessão ainda parece válida).
 */
export async function getUser(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) redirect("/api/sessao-invalida");
  return user;
}

export async function getAccounts(userId: string) {
  return db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.userId, userId), eq(accountsTable.archived, false)))
    .orderBy(asc(accountsTable.createdAt));
}

export type OnboardingChecklist = {
  hasAccount: boolean;
  hasTransaction: boolean;
};

/**
 * Base do onboarding guiado do Painel: a calibragem de renda/metas em
 * /onboarding já existe e roda uma vez só; isso aqui cobre o que falta
 * depois dela — criar conta e lançar os primeiros dados — e alguém pode
 * revisitar quantas vezes precisar até fazer os dois.
 */
export async function getOnboardingChecklist(userId: string): Promise<OnboardingChecklist> {
  const [account, tx] = await Promise.all([
    db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1),
    db.select({ id: txTable.id }).from(txTable).where(eq(txTable.userId, userId)).limit(1),
  ]);
  return { hasAccount: account.length > 0, hasTransaction: tx.length > 0 };
}

/**
 * Todas as contas do usuário — ativas e arquivadas — com quantos lançamentos
 * e recorrências cada uma tem. Usado na tela de configurações, que precisa
 * mostrar as arquivadas separadas e avisar o tanto de coisa que some junto
 * se a conta for excluída de vez (a exclusão em cascata leva lançamentos,
 * recorrências e lotes de importação daquela conta).
 */
export async function getAccountsWithStats(userId: string) {
  const rows = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(asc(accountsTable.archived), asc(accountsTable.createdAt));

  if (!rows.length) return [];

  const [txCounts, recurringCounts] = await Promise.all([
    db
      .select({ accountId: txTable.accountId, count: sql<number>`count(*)::int` })
      .from(txTable)
      .where(eq(txTable.userId, userId))
      .groupBy(txTable.accountId),
    db
      .select({ accountId: recurringRulesTable.accountId, count: sql<number>`count(*)::int` })
      .from(recurringRulesTable)
      .where(eq(recurringRulesTable.userId, userId))
      .groupBy(recurringRulesTable.accountId),
  ]);

  const txMap = new Map(txCounts.map((c) => [c.accountId, Number(c.count)]));
  const recurringMap = new Map(recurringCounts.map((c) => [c.accountId, Number(c.count)]));

  return rows.map((a) => ({
    ...a,
    transactionCount: txMap.get(a.id) ?? 0,
    recurringCount: recurringMap.get(a.id) ?? 0,
  }));
}

export async function getCategories(userId: string) {
  return db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.archived, false)))
    .orderBy(asc(categoriesTable.kind), asc(categoriesTable.name));
}

export type CardMode = "accrual" | "cash";

/**
 * accrual (padrão): compra no cartão conta no mês da compra — é o custo real,
 * mesmo que a fatura só vença depois. Usado em orçamento, projeções e reserva
 * de emergência, onde subestimar o cartão distorceria o número.
 *
 * cash: pensado só para o resumo principal do painel. A compra no cartão vira
 * só demonstrativo (não soma aqui — tem um gráfico próprio para isso); em vez
 * dela, conta o pagamento da fatura no mês em que ele sai de fato da conta.
 */
export async function getMonthSummary(
  userId: string,
  ref: MonthRef,
  opts?: { cardMode?: CardMode },
): Promise<MonthSummary> {
  const { start, end } = monthRange(ref);
  const cash = opts?.cardMode === "cash";

  const rows = await db
    .select({
      kind: txTable.kind,
      nature: txTable.nature,
      total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
    })
    .from(txTable)
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.isTransfer, false),
        gte(txTable.date, start),
        lt(txTable.date, end),
        cash ? sql`${accountsTable.type} <> 'CREDIT_CARD'` : sql`true`,
      ),
    )
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
  opts?: { cardMode?: CardMode },
): Promise<SeriesPoint[]> {
  const refs = lastNMonths(months, from);
  const first = monthRange(refs[0]).start;
  const last = monthRange(refs[refs.length - 1]).end;
  const cash = opts?.cardMode === "cash";

  const rows = await db
    .select({
      bucket: sql<string>`to_char(${txTable.date} at time zone 'UTC', 'YYYY-MM')`,
      kind: txTable.kind,
      nature: txTable.nature,
      total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
    })
    .from(txTable)
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.isTransfer, false),
        gte(txTable.date, first),
        lt(txTable.date, last),
        cash ? sql`${accountsTable.type} <> 'CREDIT_CARD'` : sql`true`,
      ),
    )
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

export async function getCategoryBreakdown(
  userId: string,
  ref: MonthRef,
  opts?: { cardMode?: CardMode },
): Promise<CategorySlice[]> {
  const { start, end } = monthRange(ref);
  const cash = opts?.cardMode === "cash";

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
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.kind, "EXPENSE"),
        eq(txTable.isTransfer, false),
        gte(txTable.date, start),
        lt(txTable.date, end),
        cash ? sql`${accountsTable.type} <> 'CREDIT_CARD'` : sql`true`,
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

/**
 * O mesmo ranking por categoria, só que olhando só para o cartão — pra você
 * ver onde o dinheiro do cartão está indo. É demonstrativo: essas compras já
 * não entram no resumo principal do painel (ficaram de fora pra não contar
 * a mesma compra duas vezes — uma como compra, outra quando a fatura é paga).
 */
export async function getCardCategoryBreakdown(userId: string, ref: MonthRef): Promise<CategorySlice[]> {
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
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.kind, "EXPENSE"),
        eq(txTable.isTransfer, false),
        eq(accountsTable.type, "CREDIT_CARD"),
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

export type TopExpense = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string;
};

/**
 * Os maiores gastos individuais do mês (cartão incluso — aqui o interesse é
 * "qual foi a compra mais pesada", não bater com o resumo em dinheiro do
 * Painel, que separa cartão pra não contar a fatura duas vezes).
 */
export async function getTopExpenses(userId: string, ref: MonthRef, limit = 6): Promise<TopExpense[]> {
  const { start, end } = monthRange(ref);

  const rows = await db
    .select({
      id: txTable.id,
      date: txTable.date,
      description: txTable.description,
      amountCents: txTable.amountCents,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      accountName: accountsTable.name,
    })
    .from(txTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, txTable.categoryId))
    .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
    .where(
      and(
        eq(txTable.userId, userId),
        eq(txTable.kind, "EXPENSE"),
        eq(txTable.isTransfer, false),
        gte(txTable.date, start),
        lt(txTable.date, end),
      ),
    )
    .orderBy(desc(txTable.amountCents))
    .limit(limit);

  return rows;
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

export type GoalRecurringRuleRow = {
  id: string;
  goalId: string;
  goalName: string;
  goalColor: string;
  amountCents: number;
  dayOfMonth: number;
  active: boolean;
  note: string | null;
  startYear: number;
  startMonth: number;
  endYear: number | null;
  endMonth: number | null;
  /** Já caiu um aporte desta regra no mês de referência? */
  generated: boolean;
  /** A regra está ativa e dentro da janela de início/fim deste mês? */
  dueThisMonth: boolean;
};

export type GoalRecurringStatus = {
  rules: GoalRecurringRuleRow[];
  pending: GoalRecurringRuleRow[];
  pendingAmountCents: number;
};

/**
 * Mesmo espírito de `getRecurringStatus`, mas para aportes automáticos em
 * metas: "guarde R$ 200 todo dia 5 na meta X" em vez de lançamento. Uma
 * regra está "pendente" no mês quando está ativa, dentro da janela de
 * início/fim, e ainda não gerou um `goalContributions` com o seu id neste
 * mês — do jeito que uma recorrência de lançamento pendente é detectada.
 */
export async function getGoalRecurringStatus(
  userId: string,
  ref: MonthRef,
): Promise<GoalRecurringStatus> {
  const { start, end } = monthRange(ref);

  const [rules, generated] = await Promise.all([
    db
      .select({
        id: goalRecurringRulesTable.id,
        goalId: goalRecurringRulesTable.goalId,
        goalName: goalsTable.name,
        goalColor: goalsTable.color,
        amountCents: goalRecurringRulesTable.amountCents,
        dayOfMonth: goalRecurringRulesTable.dayOfMonth,
        active: goalRecurringRulesTable.active,
        note: goalRecurringRulesTable.note,
        startYear: goalRecurringRulesTable.startYear,
        startMonth: goalRecurringRulesTable.startMonth,
        endYear: goalRecurringRulesTable.endYear,
        endMonth: goalRecurringRulesTable.endMonth,
      })
      .from(goalRecurringRulesTable)
      .innerJoin(goalsTable, eq(goalsTable.id, goalRecurringRulesTable.goalId))
      .where(and(eq(goalRecurringRulesTable.userId, userId), eq(goalsTable.archived, false)))
      .orderBy(asc(goalRecurringRulesTable.dayOfMonth)),

    db
      .selectDistinct({ ruleId: goalContributions.recurringRuleId })
      .from(goalContributions)
      .innerJoin(goalsTable, eq(goalsTable.id, goalContributions.goalId))
      .where(
        and(
          eq(goalsTable.userId, userId),
          gte(goalContributions.date, start),
          lt(goalContributions.date, end),
        ),
      ),
  ]);

  const generatedIds = new Set(generated.map((g) => g.ruleId).filter(Boolean) as string[]);
  const current = periodValue(ref.year, ref.month);

  const rows: GoalRecurringRuleRow[] = rules.map((r) => {
    const startsBy = periodValue(r.startYear, r.startMonth) <= current;
    const endsAfter =
      r.endYear === null || r.endMonth === null || periodValue(r.endYear, r.endMonth) >= current;

    return {
      ...r,
      generated: generatedIds.has(r.id),
      dueThisMonth: r.active && startsBy && endsAfter,
    };
  });

  const pending = rows.filter((r) => r.dueThisMonth && !r.generated);

  return {
    rules: rows,
    pending,
    pendingAmountCents: pending.reduce((acc, r) => acc + r.amountCents, 0),
  };
}

export type TransactionFilters = {
  ref?: MonthRef;
  /**
   * Período customizado ("AAAA-MM-DD", inclusivo dos dois lados). Quando os
   * dois vêm preenchidos, manda mais que `ref` — é o que permite ver ou
   * buscar lançamentos além de um único mês.
   */
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  accountId?: string;
  /** Filtro rápido: CARD = só cartão de crédito, OTHER = tudo, menos cartão. */
  accountKind?: "CARD" | "OTHER";
  kind?: "INCOME" | "EXPENSE";
  nature?: "FIXED" | "VARIABLE";
  search?: string;
  /** Só lançamentos sem categoria definida. Ignora categoryId quando ativo. */
  uncategorized?: boolean;
};

export async function getTransactions(userId: string, filters: TransactionFilters, take = 300) {
  const conditions = [eq(txTable.userId, userId)];

  if (filters.dateFrom && filters.dateTo) {
    const start = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    const end = new Date(`${filters.dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1); // limite superior exclusivo — inclui o dia "até" inteiro
    conditions.push(gte(txTable.date, start), lt(txTable.date, end));
  } else if (filters.ref) {
    const { start, end } = monthRange(filters.ref);
    conditions.push(gte(txTable.date, start), lt(txTable.date, end));
  }
  if (filters.uncategorized) conditions.push(isNull(txTable.categoryId));
  else if (filters.categoryId) conditions.push(eq(txTable.categoryId, filters.categoryId));
  if (filters.accountId) conditions.push(eq(txTable.accountId, filters.accountId));
  if (filters.accountKind === "CARD") conditions.push(eq(accountsTable.type, "CREDIT_CARD"));
  else if (filters.accountKind === "OTHER") conditions.push(sql`${accountsTable.type} <> 'CREDIT_CARD'`);
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
      accountType: accountsTable.type,
      isTransfer: txTable.isTransfer,
      recurringRuleId: txTable.recurringRuleId,
      installmentGroupId: txTable.installmentGroupId,
      installmentNumber: txTable.installmentNumber,
      installmentTotal: txTable.installmentTotal,
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

/**
 * Só o saldo guardado na meta de reserva de emergência (kind = EMERGENCY_FUND) —
 * diferente de `getTotalSavedCents`, que soma TODAS as metas. Usado onde o
 * número precisa representar especificamente "quanto já tenho de colchão", não
 * o total guardado em tudo (reserva + viagem + o que for). Misturar os dois
 * infla a reserva com dinheiro que já tem outro destino.
 */
export async function getEmergencyFundSavedCents(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${goalsTable.savedCents}), 0)::int` })
    .from(goalsTable)
    .where(
      and(
        eq(goalsTable.userId, userId),
        eq(goalsTable.archived, false),
        eq(goalsTable.kind, "EMERGENCY_FUND"),
      ),
    );
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------- orçamento

export type BudgetStatus = "sem-limite" | "ok" | "atencao" | "estourou";

export type BudgetRow = {
  categoryId: string;
  name: string;
  color: string;
  nature: "FIXED" | "VARIABLE";
  /** null = categoria ainda sem limite definido para o mês. */
  limitCents: number | null;
  spentCents: number;
  /** Quanto ainda cabe (negativo = estourou). */
  remainingCents: number;
  /** % do limite já consumido. 0 quando não há limite. */
  usedPct: number;
  status: BudgetStatus;
  /**
   * Estimativa de quanto a categoria vai fechar o mês mantendo o ritmo atual.
   * Só faz sentido no mês corrente — nos outros vem igual ao gasto real.
   */
  projectedCents: number;
};

export type BudgetOverview = {
  rows: BudgetRow[];
  totalLimitCents: number;
  /** Gasto total do mês, incluindo o que está fora do orçamento. */
  totalSpentCents: number;
  /** Gasto apenas nas categorias que têm limite — é o que o orçamento acompanha. */
  budgetedSpentCents: number;
  /** Gasto em categorias que ainda não têm limite. */
  unbudgetedSpentCents: number;
  /** Gasto em lançamentos sem categoria nenhuma. */
  uncategorizedSpentCents: number;
  incomeCents: number;
  /** Há orçamento no mês anterior para copiar? */
  previousMonthHasBudgets: boolean;
  /** Fração do mês já decorrida (0 a 1). 1 para meses passados. */
  monthProgress: number;
};

/** Quanto do mês já passou — usado para projetar o fechamento. */
function monthProgressFor(ref: MonthRef): number {
  const now = new Date();
  const current = now.getFullYear() === ref.year && now.getMonth() + 1 === ref.month;
  if (!current) {
    const isFuture =
      ref.year > now.getFullYear() ||
      (ref.year === now.getFullYear() && ref.month > now.getMonth() + 1);
    return isFuture ? 0 : 1;
  }
  const daysInMonth = new Date(ref.year, ref.month, 0).getDate();
  return Math.min(1, now.getDate() / daysInMonth);
}

function statusFor(limitCents: number | null, usedPct: number): BudgetStatus {
  if (limitCents === null) return "sem-limite";
  if (usedPct > 100) return "estourou";
  if (usedPct >= 80) return "atencao";
  return "ok";
}

/**
 * Limite x gasto real por categoria no mês.
 * Traz também as categorias que gastaram sem ter limite definido — são
 * exatamente as que o usuário precisa enxergar para fechar o orçamento.
 */
export async function getBudgetOverview(userId: string, ref: MonthRef): Promise<BudgetOverview> {
  const previous = shiftMonth(ref, -1);

  const [budgetRows, spending, summary, previousBudgets, allCategories] = await Promise.all([
    db
      .select({
        categoryId: budgetsTable.categoryId,
        limitCents: budgetsTable.limitCents,
      })
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.userId, userId),
          eq(budgetsTable.periodYear, ref.year),
          eq(budgetsTable.periodMonth, ref.month),
        ),
      ),
    getCategoryBreakdown(userId, ref),
    getMonthSummary(userId, ref),
    db
      .select({ id: budgetsTable.id })
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.userId, userId),
          eq(budgetsTable.periodYear, previous.year),
          eq(budgetsTable.periodMonth, previous.month),
        ),
      )
      .limit(1),
    db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        color: categoriesTable.color,
        nature: categoriesTable.nature,
      })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.userId, userId),
          eq(categoriesTable.archived, false),
          eq(categoriesTable.kind, "EXPENSE"),
        ),
      ),
  ]);

  const limitById = new Map(budgetRows.map((b) => [b.categoryId, b.limitCents]));
  const spentById = new Map(spending.map((s) => [s.id, s.totalCents]));
  const progress = monthProgressFor(ref);

  // Todas as categorias de gasto aparecem — é aqui que o usuário define o teto,
  // inclusive das que ainda não tiveram movimento no mês.
  const rows: BudgetRow[] = allCategories.map((c) => {
    const limitCents = limitById.get(c.id) ?? null;
    const spentCents = spentById.get(c.id) ?? 0;
    const usedPct = limitCents ? Math.round((spentCents / limitCents) * 1000) / 10 : 0;

    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      nature: c.nature as "FIXED" | "VARIABLE",
      limitCents,
      spentCents,
      remainingCents: limitCents === null ? 0 : limitCents - spentCents,
      usedPct,
      status: statusFor(limitCents, usedPct),
      projectedCents: progress > 0 ? Math.round(spentCents / progress) : spentCents,
    };
  });

  // Estourados primeiro, depois em atenção, depois por gasto. As categorias sem
  // limite ficam no fim, com as que já gastaram na frente das paradas.
  const order: Record<BudgetStatus, number> = { estourou: 0, atencao: 1, ok: 2, "sem-limite": 3 };
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      b.spentCents - a.spentCents ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

  return {
    rows,
    totalLimitCents: budgetRows.reduce((acc, b) => acc + b.limitCents, 0),
    totalSpentCents: summary.expenseCents,
    budgetedSpentCents: rows
      .filter((r) => r.limitCents !== null)
      .reduce((acc, r) => acc + r.spentCents, 0),
    unbudgetedSpentCents: rows
      .filter((r) => r.limitCents === null)
      .reduce((acc, r) => acc + r.spentCents, 0),
    uncategorizedSpentCents: spending.find((s) => s.id === "sem-categoria")?.totalCents ?? 0,
    incomeCents: summary.incomeCents,
    previousMonthHasBudgets: previousBudgets.length > 0,
    monthProgress: progress,
  };
}

// ------------------------------------------------------- lançamentos recorrentes

export type RecurringRuleRow = {
  id: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  dayOfMonth: number;
  active: boolean;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountId: string;
  accountName: string;
  startYear: number;
  startMonth: number;
  endYear: number | null;
  endMonth: number | null;
  /** A regra já virou lançamento no mês consultado? */
  generated: boolean;
  /** A regra está vigente no mês consultado (dentro de início/fim e ativa)? */
  dueThisMonth: boolean;
};

export type RecurringStatus = {
  rules: RecurringRuleRow[];
  pending: RecurringRuleRow[];
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  /** Soma de tudo que é gasto recorrente vigente no mês. */
  monthlyExpenseCents: number;
  monthlyIncomeCents: number;
};

function periodValue(year: number, month: number): number {
  return year * 12 + month;
}

export async function getRecurringStatus(userId: string, ref: MonthRef): Promise<RecurringStatus> {
  const { start, end } = monthRange(ref);

  const [rules, generated] = await Promise.all([
    db
      .select({
        id: recurringRulesTable.id,
        description: recurringRulesTable.description,
        amountCents: recurringRulesTable.amountCents,
        kind: recurringRulesTable.kind,
        nature: recurringRulesTable.nature,
        dayOfMonth: recurringRulesTable.dayOfMonth,
        active: recurringRulesTable.active,
        notes: recurringRulesTable.notes,
        categoryId: recurringRulesTable.categoryId,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        accountId: recurringRulesTable.accountId,
        accountName: accountsTable.name,
        startYear: recurringRulesTable.startYear,
        startMonth: recurringRulesTable.startMonth,
        endYear: recurringRulesTable.endYear,
        endMonth: recurringRulesTable.endMonth,
      })
      .from(recurringRulesTable)
      .leftJoin(categoriesTable, eq(categoriesTable.id, recurringRulesTable.categoryId))
      .innerJoin(accountsTable, eq(accountsTable.id, recurringRulesTable.accountId))
      .where(eq(recurringRulesTable.userId, userId))
      .orderBy(asc(recurringRulesTable.dayOfMonth), asc(recurringRulesTable.description)),

    db
      .selectDistinct({ ruleId: txTable.recurringRuleId })
      .from(txTable)
      .where(and(eq(txTable.userId, userId), gte(txTable.date, start), lt(txTable.date, end))),
  ]);

  const generatedIds = new Set(generated.map((g) => g.ruleId).filter(Boolean) as string[]);
  const current = periodValue(ref.year, ref.month);

  const rows: RecurringRuleRow[] = rules.map((r) => {
    const startsBy = periodValue(r.startYear, r.startMonth) <= current;
    const endsAfter =
      r.endYear === null || r.endMonth === null || periodValue(r.endYear, r.endMonth) >= current;

    return {
      ...r,
      kind: r.kind as "INCOME" | "EXPENSE",
      nature: r.nature as "FIXED" | "VARIABLE",
      generated: generatedIds.has(r.id),
      dueThisMonth: r.active && startsBy && endsAfter,
    };
  });

  const pending = rows.filter((r) => r.dueThisMonth && !r.generated);
  const due = rows.filter((r) => r.dueThisMonth);

  return {
    rules: rows,
    pending,
    pendingIncomeCents: pending
      .filter((r) => r.kind === "INCOME")
      .reduce((acc, r) => acc + r.amountCents, 0),
    pendingExpenseCents: pending
      .filter((r) => r.kind === "EXPENSE")
      .reduce((acc, r) => acc + r.amountCents, 0),
    monthlyIncomeCents: due
      .filter((r) => r.kind === "INCOME")
      .reduce((acc, r) => acc + r.amountCents, 0),
    monthlyExpenseCents: due
      .filter((r) => r.kind === "EXPENSE")
      .reduce((acc, r) => acc + r.amountCents, 0),
  };
}

// ---------------------------------------------------------------- dívidas

export type DebtRow = {
  id: string;
  name: string;
  creditor: string | null;
  kind: string;
  balanceCents: number;
  monthlyRateBps: number;
  minimumPaymentCents: number;
  dueDay: number;
  note: string | null;
  /** Quanto esta dívida cobra de juros por mês no saldo atual. */
  monthlyInterestCents: number;
  paidSoFarCents: number;
};

export type DebtOverview = {
  debts: DebtRow[];
  totalBalanceCents: number;
  totalMonthlyInterestCents: number;
  totalMinimumCents: number;
};

export async function getDebtOverview(userId: string): Promise<DebtOverview> {
  const rows = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.userId, userId), eq(debtsTable.archived, false)))
    .orderBy(desc(debtsTable.monthlyRateBps), asc(debtsTable.name));

  if (!rows.length) {
    return { debts: [], totalBalanceCents: 0, totalMonthlyInterestCents: 0, totalMinimumCents: 0 };
  }

  const paid = await db
    .select({
      debtId: debtPayments.debtId,
      total: sql<number>`coalesce(sum(${debtPayments.amountCents}), 0)::int`,
    })
    .from(debtPayments)
    .where(
      inArray(
        debtPayments.debtId,
        rows.map((d) => d.id),
      ),
    )
    .groupBy(debtPayments.debtId);

  const paidById = new Map(paid.map((p) => [p.debtId, Number(p.total)]));

  const debts: DebtRow[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    creditor: d.creditor,
    kind: d.kind,
    balanceCents: d.balanceCents,
    monthlyRateBps: d.monthlyRateBps,
    minimumPaymentCents: d.minimumPaymentCents,
    dueDay: d.dueDay,
    note: d.note,
    monthlyInterestCents: monthlyInterestCents(d.balanceCents, d.monthlyRateBps),
    paidSoFarCents: paidById.get(d.id) ?? 0,
  }));

  return {
    debts,
    totalBalanceCents: debts.reduce((acc, d) => acc + d.balanceCents, 0),
    totalMonthlyInterestCents: debts.reduce((acc, d) => acc + d.monthlyInterestCents, 0),
    totalMinimumCents: debts.reduce((acc, d) => acc + d.minimumPaymentCents, 0),
  };
}

// ---------------------------------------------------------------- saldo das contas

export type AccountBalance = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  color: string;
  openingBalanceCents: number;
  openingBalanceDate: Date | null;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  transactionCount: number;
};

export type BalancesOverview = {
  /** Só contas comuns — cartão de crédito é só demonstrativo, sem saldo aqui. */
  accounts: AccountBalance[];
  availableCents: number;
  savedInGoalsCents: number;
  debtBalanceCents: number;
  netWorthCents: number;
  /** Alguma conta ainda está sem saldo inicial informado? */
  needsOpeningBalance: boolean;
};

export async function getBalances(userId: string): Promise<BalancesOverview> {
  const accountRows = (
    await db
      .select()
      .from(accountsTable)
      .where(and(eq(accountsTable.userId, userId), eq(accountsTable.archived, false)))
      .orderBy(asc(accountsTable.type), asc(accountsTable.createdAt))
  ).filter((a) => a.type !== "CREDIT_CARD");

  if (!accountRows.length) {
    return {
      accounts: [],
      availableCents: 0,
      savedInGoalsCents: 0,
      debtBalanceCents: 0,
      netWorthCents: 0,
      needsOpeningBalance: false,
    };
  }

  const [movements, savedInGoals, debtRows] = await Promise.all([
    // Só contam os lançamentos a partir da data do saldo inicial de cada conta.
    db
      .select({
        accountId: txTable.accountId,
        kind: txTable.kind,
        total: sql<number>`coalesce(sum(${txTable.amountCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(txTable)
      .innerJoin(accountsTable, eq(accountsTable.id, txTable.accountId))
      .where(
        and(
          eq(txTable.userId, userId),
          sql`(${accountsTable.openingBalanceDate} is null or ${txTable.date} >= ${accountsTable.openingBalanceDate})`,
        ),
      )
      .groupBy(txTable.accountId, txTable.kind),

    getTotalSavedCents(userId),

    db
      .select({ total: sql<number>`coalesce(sum(${debtsTable.balanceCents}), 0)::int` })
      .from(debtsTable)
      .where(and(eq(debtsTable.userId, userId), eq(debtsTable.archived, false))),
  ]);

  const income = new Map<string, number>();
  const expense = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const m of movements) {
    const target = m.kind === "INCOME" ? income : expense;
    target.set(m.accountId, (target.get(m.accountId) ?? 0) + Number(m.total));
    counts.set(m.accountId, (counts.get(m.accountId) ?? 0) + Number(m.count));
  }

  const accounts: AccountBalance[] = accountRows.map((a) => {
    const incomeCents = income.get(a.id) ?? 0;
    const expenseCents = expense.get(a.id) ?? 0;

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      color: a.color,
      openingBalanceCents: a.openingBalanceCents,
      openingBalanceDate: a.openingBalanceDate ? new Date(a.openingBalanceDate) : null,
      incomeCents,
      expenseCents,
      balanceCents: accountBalance({ openingCents: a.openingBalanceCents, incomeCents, expenseCents }),
      transactionCount: counts.get(a.id) ?? 0,
    };
  });

  const availableCents = accounts.reduce((acc, a) => acc + a.balanceCents, 0);
  const debtBalanceCents = Number(debtRows[0]?.total ?? 0);

  return {
    accounts,
    availableCents,
    savedInGoalsCents: savedInGoals,
    debtBalanceCents,
    netWorthCents: netWorth({
      availableCents,
      savedInGoalsCents: savedInGoals,
      debtBalanceCents,
    }),
    needsOpeningBalance: accounts.some(
      (a) => a.openingBalanceCents === 0 && a.openingBalanceDate === null,
    ),
  };
}

// ---------------------------------------------------------------- contas a pagar

export type BillGroupingRow = {
  id: string;
  name: string;
  color: string;
};

export async function getBillGroupings(userId: string): Promise<BillGroupingRow[]> {
  return db
    .select({ id: billGroupingsTable.id, name: billGroupingsTable.name, color: billGroupingsTable.color })
    .from(billGroupingsTable)
    .where(and(eq(billGroupingsTable.userId, userId), eq(billGroupingsTable.archived, false)))
    .orderBy(asc(billGroupingsTable.name));
}

export type BillRuleParticipantRow = { id: string; name: string; phone: string | null };

export type BillRuleRow = {
  id: string;
  name: string;
  type: "INDIVIDUAL" | "GROUP";
  active: boolean;
  groupingId: string | null;
  groupingName: string | null;
  participants: BillRuleParticipantRow[];
  /** Já existe uma conta gerada desta regra no mês consultado? */
  generated: boolean;
};

export type BillRulesStatus = {
  rules: BillRuleRow[];
  pending: BillRuleRow[];
};

/**
 * Regras de conta recorrente ("Conta de luz", "Assinatura X") e se já geraram
 * a conta deste mês — mesmo espírito de `getRecurringStatus`/
 * `getGoalRecurringStatus`, mas sem valor fixo (o valor de uma conta varia
 * todo mês, então não tem "amountCents" pendente pra somar) e sem janela de
 * início/fim (só ativa/pausada — ver `src/lib/bills.ts` pra divisão de valor).
 */
export async function getBillRulesStatus(userId: string, ref: MonthRef): Promise<BillRulesStatus> {
  const [rules, participants, generated] = await Promise.all([
    db
      .select({
        id: billRulesTable.id,
        name: billRulesTable.name,
        type: billRulesTable.type,
        active: billRulesTable.active,
        groupingId: billRulesTable.groupingId,
        groupingName: billGroupingsTable.name,
      })
      .from(billRulesTable)
      .leftJoin(billGroupingsTable, eq(billGroupingsTable.id, billRulesTable.groupingId))
      .where(eq(billRulesTable.userId, userId))
      .orderBy(asc(billRulesTable.name)),

    db
      .select({
        id: billRuleParticipantsTable.id,
        ruleId: billRuleParticipantsTable.ruleId,
        name: billRuleParticipantsTable.name,
        phone: billRuleParticipantsTable.phone,
      })
      .from(billRuleParticipantsTable)
      .innerJoin(billRulesTable, eq(billRulesTable.id, billRuleParticipantsTable.ruleId))
      .where(eq(billRulesTable.userId, userId)),

    db
      .selectDistinct({ ruleId: billsTable.ruleId })
      .from(billsTable)
      .where(
        and(
          eq(billsTable.userId, userId),
          eq(billsTable.year, ref.year),
          eq(billsTable.month, ref.month),
        ),
      ),
  ]);

  const participantsByRule = new Map<string, BillRuleParticipantRow[]>();
  for (const p of participants) {
    const list = participantsByRule.get(p.ruleId) ?? [];
    list.push({ id: p.id, name: p.name, phone: p.phone });
    participantsByRule.set(p.ruleId, list);
  }

  const generatedIds = new Set(generated.map((g) => g.ruleId).filter(Boolean) as string[]);

  const rows: BillRuleRow[] = rules.map((r) => ({
    ...r,
    type: r.type as "INDIVIDUAL" | "GROUP",
    participants: participantsByRule.get(r.id) ?? [],
    generated: generatedIds.has(r.id),
  }));

  return {
    rules: rows,
    pending: rows.filter((r) => r.active && !r.generated),
  };
}

export type BillParticipantRow = {
  id: string;
  name: string;
  phone: string | null;
  amountCents: number;
};

export type BillRow = {
  id: string;
  ruleId: string | null;
  name: string;
  type: "INDIVIDUAL" | "GROUP";
  year: number;
  month: number;
  totalCents: number;
  note: string | null;
  groupingId: string | null;
  groupingName: string | null;
  participants: BillParticipantRow[];
};

/** Todas as contas (recorrentes já geradas + avulsas) de um mês. */
export async function getBillsForMonth(userId: string, ref: MonthRef): Promise<BillRow[]> {
  const [rows, participants] = await Promise.all([
    db
      .select({
        id: billsTable.id,
        ruleId: billsTable.ruleId,
        name: billsTable.name,
        type: billsTable.type,
        year: billsTable.year,
        month: billsTable.month,
        totalCents: billsTable.totalCents,
        note: billsTable.note,
        groupingId: billsTable.groupingId,
        groupingName: billGroupingsTable.name,
      })
      .from(billsTable)
      .leftJoin(billGroupingsTable, eq(billGroupingsTable.id, billsTable.groupingId))
      .where(
        and(eq(billsTable.userId, userId), eq(billsTable.year, ref.year), eq(billsTable.month, ref.month)),
      )
      .orderBy(asc(billsTable.name)),

    db
      .select({
        id: billParticipantsTable.id,
        billId: billParticipantsTable.billId,
        name: billParticipantsTable.name,
        phone: billParticipantsTable.phone,
        amountCents: billParticipantsTable.amountCents,
      })
      .from(billParticipantsTable)
      .innerJoin(billsTable, eq(billsTable.id, billParticipantsTable.billId))
      .where(
        and(eq(billsTable.userId, userId), eq(billsTable.year, ref.year), eq(billsTable.month, ref.month)),
      ),
  ]);

  const participantsByBill = new Map<string, BillParticipantRow[]>();
  for (const p of participants) {
    const list = participantsByBill.get(p.billId) ?? [];
    list.push({ id: p.id, name: p.name, phone: p.phone, amountCents: p.amountCents });
    participantsByBill.set(p.billId, list);
  }

  return rows.map((r) => ({
    ...r,
    type: r.type as "INDIVIDUAL" | "GROUP",
    participants: participantsByBill.get(r.id) ?? [],
  }));
}
