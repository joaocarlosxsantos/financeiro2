"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import { fingerprint } from "@/lib/categorize";

export type ActionState = { error?: string; ok?: boolean };

const schema = z.object({
  date: z.string().min(1, "Informe a data."),
  description: z.string().trim().min(2, "Descreva o lançamento."),
  amount: z.string().min(1, "Informe o valor."),
  kind: z.enum(["INCOME", "EXPENSE"]),
  nature: z.enum(["FIXED", "VARIABLE"]),
  accountId: z.string().min(1, "Escolha a conta."),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
});

function readForm(formData: FormData) {
  return schema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    kind: formData.get("kind"),
    nature: formData.get("nature"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/painel");
}

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const date = new Date(`${d.date}T12:00:00.000Z`);

  await db.insert(transactions).values({
    userId,
    accountId: d.accountId,
    categoryId: d.categoryId || null,
    date,
    description: d.description,
    amountCents,
    kind: d.kind,
    nature: d.kind === "INCOME" ? "VARIABLE" : d.nature,
    notes: d.notes || null,
    // sufixo "m" = manual, para não colidir com uma linha importada idêntica
    fingerprint: `${fingerprint({ accountId: d.accountId, date, amountCents, description: d.description })}|m|${Date.now()}`,
  });

  refresh();
  return { ok: true };
}

export async function updateTransaction(id: string, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  await db
    .update(transactions)
    .set({
      accountId: d.accountId,
      categoryId: d.categoryId || null,
      date: new Date(`${d.date}T12:00:00.000Z`),
      description: d.description,
      amountCents,
      kind: d.kind,
      nature: d.kind === "INCOME" ? "VARIABLE" : d.nature,
      notes: d.notes || null,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  refresh();
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  const userId = await requireUserId();
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  refresh();
}

export async function setTransactionCategory(id: string, categoryId: string | null) {
  const userId = await requireUserId();

  let nature: "FIXED" | "VARIABLE" | undefined;
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id, nature: categories.nature })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    if (!cat) return;
    nature = cat.nature;
  }

  await db
    .update(transactions)
    .set({ categoryId, ...(nature ? { nature } : {}), updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  refresh();
}
