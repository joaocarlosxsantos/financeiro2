import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { currentMonthRef, getNowInSaoPaulo, monthLabel, monthRange, monthRefToParam, shiftMonth, todayRef, type MonthRef } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getBalances, getCategoryBreakdown, getMonthSummary } from "@/server/queries";
import { safeLabel } from "./ai-policy";
import type { InsightWindow, Preferences } from "./insights";

export function monthlyWindow(now: Date): InsightWindow | null {
  const local = getNowInSaoPaulo(now);
  if (local.getDate() !== 1 || local.getHours() < 8) return null;
  const closed = shiftMonth(currentMonthRef(now), -1);
  return { key: `${monthRefToParam(closed)}:month`, day: todayRef(now), hour: 8, monthly: true };
}

function periodEnd(ref: MonthRef, day: number | undefined) {
  const { end } = monthRange(ref);
  if (day === undefined) return end;
  const partialEnd = new Date(Date.UTC(ref.year, ref.month - 1, day + 1));
  return partialEnd < end ? partialEnd : end;
}

/** Recebe o dono do vínculo. A preferência fornecida identifica o fechamento automático. */
export async function loadMonthlyReport(
  userId: string,
  now: Date,
  connection: Pick<typeof db, "select"> = db,
  automatic?: Pick<Preferences, "spending" | "budget">,
) {
  const ref = shiftMonth(currentMonthRef(now), automatic ? -1 : 0);
  const previous = shiftMonth(ref, -1);
  const day = automatic ? undefined : getNowInSaoPaulo(now).getDate();
  const options = { connection, endExclusive: periodEnd(ref, day) };
  const spending = automatic?.spending ?? true;
  const budget = automatic?.budget ?? true;
  const [current, prior, spendingRows, limits, balances] = await Promise.all([
    getMonthSummary(userId, ref, options),
    getMonthSummary(userId, previous, { connection, endExclusive: periodEnd(previous, day) }),
    spending || budget ? getCategoryBreakdown(userId, ref, options) : [],
    budget ? connection.select({ categoryId: budgets.categoryId, limitCents: budgets.limitCents }).from(budgets)
      .innerJoin(categories, and(eq(categories.id, budgets.categoryId), eq(categories.userId, userId)))
      .where(and(eq(budgets.userId, userId), eq(budgets.periodYear, ref.year), eq(budgets.periodMonth, ref.month))) : [],
    getBalances(userId, connection),
  ]);

  const balance = current.incomeCents - current.expenseCents;
  const priorBalance = prior.incomeCents - prior.expenseCents;
  const delta = (cents: number) => `${cents > 0 ? "+" : ""}${formatCents(cents)}`;
  const lines = [
    `Mutano Contas · ${automatic ? "Fechamento" : "Relatório parcial"} de ${monthLabel(ref)}`,
    `Receitas: ${formatCents(current.incomeCents)}`,
    `Despesas: ${formatCents(current.expenseCents)}`,
    `Saldo do período: ${formatCents(balance)}`,
    "",
    `Comparação com ${monthLabel(previous)}${automatic ? "" : " (mesmos dias, até o fim do mês anterior)"}`,
    `Receitas: ${delta(current.incomeCents - prior.incomeCents)} · despesas: ${delta(current.expenseCents - prior.expenseCents)}`,
    `Variação do saldo: ${delta(balance - priorBalance)}`,
  ];
  lines.push("", `Posição atual${balances.totalIncomplete ? " (parcial)" : ""} — não é o saldo de fechamento`,
    `Disponível: ${formatCents(balances.availableCents)}`,
    `Investido: ${formatCents(balances.investedCents)}`,
    `Patrimônio líquido: ${formatCents(balances.netWorthCents)}`);
  if (spending) {
    lines.push("", "Maiores categorias de despesa");
    for (const row of spendingRows.slice(0, 5)) lines.push(`${safeLabel(row.name)}: ${formatCents(row.totalCents)}`);
    if (!spendingRows.length) lines.push("Nenhuma despesa registrada.");
  }
  if (budget) {
    const limitByCategory = new Map(limits.map((row) => [row.categoryId, row.limitCents]));
    const over = spendingRows.flatMap((row) => {
      const limit = limitByCategory.get(row.id);
      return limit !== undefined && row.totalCents > limit ? [{ name: row.name, overCents: row.totalCents - limit }] : [];
    }).sort((a, b) => b.overCents - a.overCents);
    lines.push("", "Orçamentos estourados");
    for (const row of over.slice(0, 5)) lines.push(`${safeLabel(row.name)}: ${formatCents(row.overCents)} acima do limite`);
    if (!over.length) lines.push(limits.length ? "Nenhum estouro no período." : "Nenhum orçamento definido para o período.");
    if (over.length > 5) lines.push(`Mais ${over.length - 5} no app.`);
  }
  return lines.join("\n");
}
