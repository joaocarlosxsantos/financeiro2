/**
 * Gravação das parcelas no banco.
 *
 * Este arquivo NÃO é "use server" de propósito: num módulo de Server Actions
 * todo export vira um endpoint chamável pelo cliente, e esta função recebe
 * userId. Ela é chamada só por actions que já autenticaram.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { addMonthsKeepingDay, splitInstallments } from "@/lib/installments";
import { invoiceRefForInstallment, resolveTransactionInvoiceRef } from "@/lib/invoices";

export async function insertInstallments(input: {
  userId: string;
  description: string;
  totalCents: number;
  count: number;
  firstDate: Date;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  accountId: string;
  categoryId: string | null;
  notes: string | null;
  closingDay?: number | null;
  dueDay?: number | null;
}): Promise<{ groupId: string; created: number }> {
  const groupId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const parts = splitInstallments(input.totalCents, input.count);

  let closingDay = input.closingDay;
  let dueDay = input.dueDay;
  let isCard = true;

  if (closingDay === undefined || dueDay === undefined) {
    const [acc] = await db
      .select({
        type: accounts.type,
        closingDay: accounts.closingDay,
        dueDay: accounts.dueDay,
      })
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, input.userId)))
      .limit(1);

    isCard = acc?.type === "CREDIT_CARD";
    closingDay = isCard ? acc?.closingDay : null;
    dueDay = isCard ? acc?.dueDay : null;
  }

  // Se a conta tem fechamento e vencimento configurados, calcula o ref da 1ª parcela
  // e avança (k - 1) meses para cada parcela k, sem recalcular ciclo da data deslocada.
  const ref1 = resolveTransactionInvoiceRef({
    accountType: isCard ? "CREDIT_CARD" : "OTHER",
    closingDay,
    dueDay,
    date: input.firstDate,
  });

  const inserted = await db
    .insert(transactions)
    .values(
      parts.map((amountCents, i) => {
        const k = i + 1;
        const invoiceRef = ref1 ? invoiceRefForInstallment(ref1, k) : null;
        return {
          userId: input.userId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          date: addMonthsKeepingDay(input.firstDate, i),
          description: `${input.description} (${k}/${input.count})`,
          amountCents,
          kind: input.kind,
          nature: input.nature,
          notes: input.notes,
          installmentGroupId: groupId,
          installmentNumber: k,
          installmentTotal: input.count,
          invoiceRef,
          fingerprint: `inst:${groupId}|${k}`,
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id });

  return { groupId, created: inserted.length };
}

export const createInstallments = insertInstallments;

