"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { accounts, transactionSplits, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { MAX_CENTS, parseMoneyToCents } from "@/lib/money";
import { resolveTransactionInvoiceRef } from "@/lib/invoices";
import { getProfileRestriction } from "@/server/usage-profile";

const editSchema = z.object({
  id: z.string().min(1).max(32),
  description: z.string().trim().min(2, "Descreva o lançamento.").max(255),
  amount: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Informe um valor positivo, sem separador de milhar."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
});

/** Edit only the owned manual row; never change provider data or one transfer leg. */
export async function editManualTransaction(input: unknown): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "manual-entry");
  if (restriction) return { error: restriction };
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { id, description, amount, date } = parsed.data;
  const amountCents = parseMoneyToCents(amount);
  const day = new Date(`${date}T12:00:00.000Z`);
  if (amountCents <= 0 || amountCents > MAX_CENTS) return { error: "Informe um valor válido." };
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return { error: "Informe uma data válida." };
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ transaction: transactions, account: accounts }).from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(accounts.userId, userId)))
      .for("update").limit(1);
    if (!row) return { error: "Lançamento não encontrado." };
    const current = row.transaction;
    if (current.origin !== "MANUAL" || current.transferGroupId || row.account.financeMode !== "manual") {
      return { error: "Só é possível editar valores de lançamentos manuais sem transferência pareada." };
    }
    const splits = await tx.select({ amountCents: transactionSplits.amountCents }).from(transactionSplits)
      .where(and(eq(transactionSplits.transactionId, id), eq(transactionSplits.userId, userId)));
    if (splits.reduce((sum, split) => sum + split.amountCents, 0) > amountCents) {
      return { error: "O valor não pode ser menor que a soma das partes divididas. Ajuste a divisão primeiro." };
    }
    await tx.update(transactions).set({
      description, amountCents, date: day, updatedAt: new Date(),
      invoiceRef: current.installmentGroupId ? current.invoiceRef : resolveTransactionInvoiceRef({
        accountType: row.account.type, closingDay: row.account.closingDay, dueDay: row.account.dueDay, date: day,
      }),
    }).where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.origin, "MANUAL")));
    return { ok: true };
  });
  if (result.ok) {
    revalidatePath("/lancamentos"); revalidatePath("/contas"); revalidatePath("/painel");
    revalidatePath("/orcamento"); revalidatePath("/insights");
  }
  return result;
}
