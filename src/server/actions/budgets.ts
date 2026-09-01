"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import { shiftMonth, type MonthRef } from "@/lib/dates";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/orcamento");
  revalidatePath("/painel");
}

/**
 * Define (ou atualiza) o limite de uma categoria no mês.
 * Limite zero remove o orçamento — é o jeito natural de "desligar" pela interface.
 */
export async function setBudget(input: {
  categoryId: string;
  year: number;
  month: number;
  amount: string;
}): Promise<ActionState> {
  const userId = await requireUserId();

  if (!Number.isInteger(input.year) || input.month < 1 || input.month > 12) {
    return { error: "Período inválido." };
  }

  const [category] = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, input.categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (!category) return { error: "Categoria não encontrada." };
  if (category.kind !== "EXPENSE") {
    return { error: "Só faz sentido definir limite para categorias de gasto." };
  }

  const limitCents = Math.abs(parseMoneyToCents(input.amount));

  if (limitCents === 0) {
    await removeBudget(input.categoryId, input.year, input.month);
    return { ok: true };
  }

  await db
    .insert(budgets)
    .values({
      userId,
      categoryId: input.categoryId,
      periodYear: input.year,
      periodMonth: input.month,
      limitCents,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.periodYear, budgets.periodMonth],
      set: { limitCents, updatedAt: new Date() },
    });

  refresh();
  return { ok: true };
}

export async function removeBudget(categoryId: string, year: number, month: number) {
  const userId = await requireUserId();

  await db
    .delete(budgets)
    .where(
      and(
        eq(budgets.userId, userId),
        eq(budgets.categoryId, categoryId),
        eq(budgets.periodYear, year),
        eq(budgets.periodMonth, month),
      ),
    );

  refresh();
}

/**
 * Copia os limites do mês anterior para o mês atual.
 * Não sobrescreve limites já definidos — o que você ajustou continua valendo.
 */
export async function copyPreviousMonth(ref: MonthRef): Promise<{ copied: number; error?: string }> {
  const userId = await requireUserId();
  const previous = shiftMonth(ref, -1);

  const source = await db
    .select({ categoryId: budgets.categoryId, limitCents: budgets.limitCents })
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, userId),
        eq(budgets.periodYear, previous.year),
        eq(budgets.periodMonth, previous.month),
      ),
    );

  if (!source.length) return { copied: 0, error: "O mês anterior não tem nenhum limite definido." };

  const inserted = await db
    .insert(budgets)
    .values(
      source.map((b) => ({
        userId,
        categoryId: b.categoryId,
        periodYear: ref.year,
        periodMonth: ref.month,
        limitCents: b.limitCents,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: budgets.id });

  refresh();
  return { copied: inserted.length };
}

/**
 * Sugere um limite por categoria a partir da média gasta nos últimos meses.
 * Ponto de partida honesto: orçamento que ignora o histórico não se sustenta.
 */
export async function suggestFromHistory(ref: MonthRef, months = 3): Promise<{ applied: number }> {
  const userId = await requireUserId();
  const { getCategoryBreakdown } = await import("@/server/queries");

  const refs = Array.from({ length: months }, (_, i) => shiftMonth(ref, -(i + 1)));
  const breakdowns = await Promise.all(refs.map((r) => getCategoryBreakdown(userId, r)));

  const totals = new Map<string, { sum: number; months: number }>();
  for (const list of breakdowns) {
    for (const slice of list) {
      if (slice.id === "sem-categoria") continue;
      const entry = totals.get(slice.id) ?? { sum: 0, months: 0 };
      entry.sum += slice.totalCents;
      entry.months += 1;
      totals.set(slice.id, entry);
    }
  }

  if (!totals.size) return { applied: 0 };

  const values = [...totals.entries()].map(([categoryId, { sum, months: n }]) => ({
    userId,
    categoryId,
    periodYear: ref.year,
    periodMonth: ref.month,
    // Arredonda para a dezena de reais mais próxima — limite quebrado não ajuda ninguém.
    limitCents: Math.max(1000, Math.round(sum / n / 1000) * 1000),
  }));

  const inserted = await db
    .insert(budgets)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: budgets.id });

  refresh();
  return { applied: inserted.length };
}
