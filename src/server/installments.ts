/**
 * Gravação das parcelas no banco.
 *
 * Este arquivo NÃO é "use server" de propósito: num módulo de Server Actions
 * todo export vira um endpoint chamável pelo cliente, e esta função recebe
 * userId. Ela é chamada só por actions que já autenticaram.
 */
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { addMonthsKeepingDay, splitInstallments } from "@/lib/installments";

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
}): Promise<{ groupId: string; created: number }> {
  const groupId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const parts = splitInstallments(input.totalCents, input.count);

  const inserted = await db
    .insert(transactions)
    .values(
      parts.map((amountCents, i) => ({
        userId: input.userId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        date: addMonthsKeepingDay(input.firstDate, i),
        description: `${input.description} (${i + 1}/${input.count})`,
        amountCents,
        kind: input.kind,
        nature: input.nature,
        notes: input.notes,
        installmentGroupId: groupId,
        installmentNumber: i + 1,
        installmentTotal: input.count,
        fingerprint: `inst:${groupId}|${i + 1}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id });

  return { groupId, created: inserted.length };
}
