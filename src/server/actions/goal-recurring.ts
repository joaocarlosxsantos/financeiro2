"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { goalContributions, goalRecurringRules, goals } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import type { MonthRef } from "@/lib/dates";
import { dateForMonth } from "@/lib/installments";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/metas");
  revalidatePath("/painel");
  revalidatePath("/projecoes");
}

const ruleSchema = z.object({
  goalId: z.string().min(1, "Escolha a meta."),
  amount: z.string().min(1, "Informe o valor."),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
  note: z.string().optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês de início."),
  endMonth: z.string().optional(),
});

export async function createGoalRecurringRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = ruleSchema.safeParse({
    goalId: formData.get("goalId"),
    amount: formData.get("amount"),
    dayOfMonth: formData.get("dayOfMonth"),
    note: formData.get("note") || undefined,
    startMonth: formData.get("startMonth"),
    endMonth: formData.get("endMonth") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, d.goalId), eq(goals.userId, userId)))
    .limit(1);
  if (!goal) return { error: "Meta não encontrada." };

  const [startYear, startMonth] = d.startMonth.split("-").map(Number);
  const end = d.endMonth && /^\d{4}-\d{2}$/.test(d.endMonth) ? d.endMonth.split("-").map(Number) : null;

  if (end && end[0] * 12 + end[1] < startYear * 12 + startMonth) {
    return { error: "O mês final não pode ser anterior ao inicial." };
  }

  await db.insert(goalRecurringRules).values({
    userId,
    goalId: d.goalId,
    amountCents,
    dayOfMonth: d.dayOfMonth,
    note: d.note || null,
    startYear,
    startMonth,
    endYear: end ? end[0] : null,
    endMonth: end ? end[1] : null,
  });

  refresh();
  return { ok: true };
}

export async function toggleGoalRecurringRule(id: string, active: boolean) {
  const userId = await requireUserId();
  await db
    .update(goalRecurringRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(goalRecurringRules.id, id), eq(goalRecurringRules.userId, userId)));
  refresh();
}

/** Apaga a regra. Os aportes já gerados continuam na meta — apagar histórico
 * junto tiraria dinheiro que a pessoa já contava como guardado. */
export async function deleteGoalRecurringRule(id: string) {
  const userId = await requireUserId();
  await db
    .delete(goalRecurringRules)
    .where(and(eq(goalRecurringRules.id, id), eq(goalRecurringRules.userId, userId)));
  refresh();
}

/** Gera os aportes de todas as regras vigentes que ainda não caíram no mês. */
export async function generateGoalRecurring(
  ref: MonthRef,
  ruleId?: string,
): Promise<{ created: number; error?: string }> {
  const userId = await requireUserId();
  const { getGoalRecurringStatus } = await import("@/server/queries");

  const status = await getGoalRecurringStatus(userId, ref);
  const target = ruleId ? status.pending.filter((r) => r.id === ruleId) : status.pending;

  if (!target.length) return { created: 0, error: "Nada pendente para gerar neste mês." };

  let created = 0;
  await db.transaction(async (tx) => {
    for (const rule of target) {
      const inserted = await tx
        .insert(goalContributions)
        .values({
          goalId: rule.goalId,
          deltaCents: rule.amountCents,
          date: dateForMonth(ref, rule.dayOfMonth),
          note: rule.note ?? "Aporte automático",
          recurringRuleId: rule.id,
        })
        // Uma geração por regra por dia (índice único) — clicar duas vezes
        // não duplica o aporte.
        .onConflictDoNothing()
        .returning({ id: goalContributions.id });

      if (!inserted.length) continue;
      created++;

      await tx
        .update(goals)
        .set({ savedCents: sql`${goals.savedCents} + ${rule.amountCents}`, updatedAt: new Date() })
        .where(eq(goals.id, rule.goalId));
    }
  });

  refresh();
  return { created };
}
