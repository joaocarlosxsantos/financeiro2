"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, recurringRules, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents, MAX_CENTS } from "@/lib/money";
import { safeDescriptionSchema, safeNotesSchema } from "@/server/validation/sanitization";
import type { MonthRef } from "@/lib/dates";
import { dateForMonth } from "@/lib/installments";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/recorrentes");
  revalidatePath("/lancamentos");
  revalidatePath("/painel");
  revalidatePath("/orcamento");
}

const ruleSchema = z.object({
  description: safeDescriptionSchema(2, 255, "Descreva o lançamento."),
  amount: z.string().min(1, "Informe o valor."),
  kind: z.enum(["INCOME", "EXPENSE"]),
  nature: z.enum(["FIXED", "VARIABLE"]),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
  accountId: z.string().min(1, "Escolha a conta."),
  categoryId: z.string().optional(),
  notes: safeNotesSchema(2000),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês de início."),
  endMonth: z.string().optional(),
});

export async function createRecurringRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = ruleSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    kind: formData.get("kind"),
    nature: formData.get("nature"),
    dayOfMonth: formData.get("dayOfMonth"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    notes: formData.get("notes") || undefined,
    startMonth: formData.get("startMonth"),
    endMonth: formData.get("endMonth") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents > MAX_CENTS) return { error: "Valor muito alto." };
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const [account] = await db
    .select({ id: accounts.id, financeMode: accounts.financeMode })
    .from(accounts)
    .where(and(eq(accounts.id, d.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Conta inválida." };
  if (account.financeMode === "integracao") return { error: "Esta conta está integrada. Troque para modo manual antes de criar recorrências." };

  const [startYear, startMonth] = d.startMonth.split("-").map(Number);
  const end = d.endMonth && /^\d{4}-\d{2}$/.test(d.endMonth) ? d.endMonth.split("-").map(Number) : null;

  if (end && end[0] * 12 + end[1] < startYear * 12 + startMonth) {
    return { error: "O mês final não pode ser anterior ao inicial." };
  }

  await db.insert(recurringRules).values({
    userId,
    accountId: d.accountId,
    categoryId: d.categoryId || null,
    description: d.description,
    amountCents,
    kind: d.kind,
    nature: d.kind === "INCOME" ? "VARIABLE" : d.nature,
    notes: d.notes || null,
    dayOfMonth: d.dayOfMonth,
    startYear,
    startMonth,
    endYear: end ? end[0] : null,
    endMonth: end ? end[1] : null,
  });

  refresh();
  return { ok: true };
}

export async function toggleRecurringRule(id: string, active: boolean) {
  const userId = await requireUserId();
  await db
    .update(recurringRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  refresh();
}

/**
 * Apaga a regra. Os lançamentos já gerados continuam onde estão â€” apagar
 * histórico junto seria destrutivo demais e mudaria meses já fechados.
 */
export async function deleteRecurringRule(id: string) {
  const userId = await requireUserId();
  await db
    .delete(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  refresh();
}

/** Gera os lançamentos de todas as regras vigentes que ainda não caíram no mês. */
export async function generateRecurring(
  ref: MonthRef,
  ruleId?: string,
): Promise<{ created: number; skippedIntegrated?: number; error?: string }> {
  const userId = await requireUserId();
  const { getRecurringStatus } = await import("@/server/queries");

  const status = await getRecurringStatus(userId, ref);
  let target = ruleId ? status.pending.filter((r) => r.id === ruleId) : status.pending;
  let skippedIntegrated = 0;

  const targetAccountIds = [...new Set(target.map((r) => r.accountId))];
  if (targetAccountIds.length) {
    const integrated = await db.select({ id: accounts.id }).from(accounts).where(and(inArray(accounts.id, targetAccountIds), eq(accounts.financeMode, "integracao"), eq(accounts.userId, userId)));
    const integratedIds = new Set(integrated.map((a) => a.id));
    skippedIntegrated = target.filter((r) => integratedIds.has(r.accountId)).length;
    target = target.filter((r) => !integratedIds.has(r.accountId));
  }

  if (!target.length) return { created: 0, skippedIntegrated, error: skippedIntegrated ? "As recorrencias de contas integradas foram ignoradas." : "Nada pendente para gerar neste mes." };

  const inserted = await db
    .insert(transactions)
    .values(
      target.map((rule) => ({
        userId,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        date: dateForMonth(ref, rule.dayOfMonth),
        description: rule.description,
        amountCents: rule.amountCents,
        kind: rule.kind,
        nature: rule.nature,
        notes: rule.notes,
        recurringRuleId: rule.id,
        // Uma ocorrência por regra por mês â€” a chave única cuida do resto.
        fingerprint: `rule:${rule.id}|${ref.year}-${String(ref.month).padStart(2, "0")}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id });

  refresh();
  return { created: inserted.length, ...(skippedIntegrated ? { skippedIntegrated } : {}) };
}

/** Apaga todas as parcelas de uma compra parcelada. */
export async function deleteInstallmentGroup(groupId: string) {
  const userId = await requireUserId();
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.installmentGroupId, groupId)),
    );
  refresh();
}
