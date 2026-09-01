"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, cardInvoicePayments } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/faturas");
  revalidatePath("/painel");
  revalidatePath("/configuracoes");
}

const cycleSchema = z.object({
  accountId: z.string().min(1),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
});

/** Define o dia de fechamento e o de vencimento do cartão. */
export async function saveCardCycle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = cycleSchema.safeParse({
    accountId: formData.get("accountId"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
  });
  if (!parsed.success) return { error: "Informe dias entre 1 e 31." };

  const [card] = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, parsed.data.accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!card) return { error: "Cartão não encontrado." };
  if (card.type !== "CREDIT_CARD") return { error: "Ciclo de fatura só vale para cartão de crédito." };

  await db
    .update(accounts)
    .set({ closingDay: parsed.data.closingDay, dueDay: parsed.data.dueDay })
    .where(eq(accounts.id, parsed.data.accountId));

  refresh();
  return { ok: true };
}

/**
 * Registra o pagamento de uma fatura.
 *
 * De propósito NÃO cria um lançamento de despesa: as compras do cartão já
 * entraram como gasto no dia em que foram feitas. Lançar o pagamento de novo
 * contaria o mesmo dinheiro duas vezes.
 */
export async function payInvoice(input: {
  accountId: string;
  dueYear: number;
  dueMonth: number;
  amount: string;
  paidFromAccountId?: string | null;
  paidAt?: string | null;
  note?: string | null;
}): Promise<ActionState> {
  const userId = await requireUserId();

  const [card] = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!card || card.type !== "CREDIT_CARD") return { error: "Cartão inválido." };

  const paidAmountCents = Math.abs(parseMoneyToCents(input.amount));
  if (paidAmountCents <= 0) return { error: "Informe o valor pago." };

  if (input.dueMonth < 1 || input.dueMonth > 12) return { error: "Fatura inválida." };

  let paidFromAccountId: string | null = null;
  if (input.paidFromAccountId) {
    const [source] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, input.paidFromAccountId), eq(accounts.userId, userId)))
      .limit(1);
    paidFromAccountId = source?.id ?? null;
  }

  await db
    .insert(cardInvoicePayments)
    .values({
      userId,
      accountId: input.accountId,
      paidFromAccountId,
      dueYear: input.dueYear,
      dueMonth: input.dueMonth,
      paidAmountCents,
      paidAt: input.paidAt ? new Date(`${input.paidAt}T12:00:00.000Z`) : new Date(),
      note: input.note || null,
    })
    .onConflictDoUpdate({
      target: [
        cardInvoicePayments.userId,
        cardInvoicePayments.accountId,
        cardInvoicePayments.dueYear,
        cardInvoicePayments.dueMonth,
      ],
      set: {
        paidAmountCents,
        paidFromAccountId,
        paidAt: input.paidAt ? new Date(`${input.paidAt}T12:00:00.000Z`) : new Date(),
        note: input.note || null,
      },
    });

  refresh();
  return { ok: true };
}

export async function unpayInvoice(accountId: string, dueYear: number, dueMonth: number) {
  const userId = await requireUserId();
  await db
    .delete(cardInvoicePayments)
    .where(
      and(
        eq(cardInvoicePayments.userId, userId),
        eq(cardInvoicePayments.accountId, accountId),
        eq(cardInvoicePayments.dueYear, dueYear),
        eq(cardInvoicePayments.dueMonth, dueMonth),
      ),
    );
  refresh();
}
