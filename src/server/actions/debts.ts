"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { debtPayments, debts } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/dividas");
  revalidatePath("/painel");
}

/** "12,5" -> 1250 pontos-base. */
function parseRateToBps(raw: string): number {
  const normalized = raw.replace("%", "").trim().replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

const debtSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para a dívida."),
  creditor: z.string().optional(),
  kind: z.enum([
    "CARD_REVOLVING",
    "OVERDRAFT",
    "PERSONAL_LOAN",
    "FINANCING",
    "INSTALLMENT",
    "OTHER",
  ]),
  balance: z.string().min(1, "Informe o saldo devedor."),
  rate: z.string().optional(),
  minimum: z.string().optional(),
  dueDay: z.coerce.number().int().min(1).max(31),
  note: z.string().optional(),
});

export async function createDebt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = debtSchema.safeParse({
    name: formData.get("name"),
    creditor: formData.get("creditor") || undefined,
    kind: formData.get("kind"),
    balance: formData.get("balance"),
    rate: formData.get("rate") || undefined,
    minimum: formData.get("minimum") || undefined,
    dueDay: formData.get("dueDay"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const balanceCents = Math.abs(parseMoneyToCents(parsed.data.balance));
  if (balanceCents <= 0) return { error: "O saldo devedor precisa ser maior que zero." };

  await db.insert(debts).values({
    userId,
    name: parsed.data.name,
    creditor: parsed.data.creditor || null,
    kind: parsed.data.kind,
    balanceCents,
    monthlyRateBps: parseRateToBps(parsed.data.rate ?? "0"),
    minimumPaymentCents: Math.abs(parseMoneyToCents(parsed.data.minimum ?? "0")),
    dueDay: parsed.data.dueDay,
    note: parsed.data.note || null,
  });

  refresh();
  return { ok: true };
}

/** Ajusta saldo, taxa ou parcela mínima direto na lista. */
export async function updateDebtField(input: {
  id: string;
  field: "balance" | "rate" | "minimum";
  value: string;
}): Promise<ActionState> {
  const userId = await requireUserId();

  const patch =
    input.field === "balance"
      ? { balanceCents: Math.abs(parseMoneyToCents(input.value)) }
      : input.field === "minimum"
        ? { minimumPaymentCents: Math.abs(parseMoneyToCents(input.value)) }
        : { monthlyRateBps: parseRateToBps(input.value) };

  await db
    .update(debts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(debts.id, input.id), eq(debts.userId, userId)));

  refresh();
  return { ok: true };
}

/**
 * Registra um pagamento e abate o saldo devedor.
 * Não cria lançamento: o pagamento da dívida você lança normalmente em
 * Lançamentos, se quiser que ele apareça no gasto do mês.
 */
export async function registerDebtPayment(
  debtId: string,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();

  const amountCents = Math.abs(parseMoneyToCents(String(formData.get("amount") ?? "")));
  if (amountCents <= 0) return { error: "Informe o valor pago." };

  const [debt] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .limit(1);
  if (!debt) return { error: "Dívida não encontrada." };

  await db.transaction(async (tx) => {
    await tx.insert(debtPayments).values({
      debtId,
      amountCents,
      note: String(formData.get("note") ?? "") || null,
    });
    await tx
      .update(debts)
      .set({
        balanceCents: Math.max(0, debt.balanceCents - amountCents),
        updatedAt: new Date(),
      })
      .where(eq(debts.id, debtId));
  });

  refresh();
  return { ok: true };
}

export async function deleteDebt(id: string) {
  const userId = await requireUserId();
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, userId)));
  refresh();
}
