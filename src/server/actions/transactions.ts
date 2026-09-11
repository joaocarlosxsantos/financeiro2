"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import { fingerprint } from "@/lib/categorize";
import { insertInstallments } from "@/server/installments";

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
  /** 1 = lançamento único. Acima disso vira compra parcelada. */
  installments: z.coerce.number().int().min(1).max(60).optional(),
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
    installments: formData.get("installments") || undefined,
  });
}

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/painel");
}

/**
 * Confere que a conta (e a categoria, se informada) pertencem mesmo a quem
 * está fazendo a gravação — sem isso, alguém poderia gravar um lançamento seu
 * apontando para o `accountId`/`categoryId` de outra pessoa (o nome/cor da
 * conta ou categoria de outro usuário vazaria pro seu próprio extrato via
 * JOIN). Mesmo padrão de checagem já usado no resto do código.
 */
async function verifyAccountAndCategory(
  userId: string,
  accountId: string,
  categoryId: string | null,
): Promise<string | null> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return "Conta inválida.";

  if (categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    if (!category) return "Categoria inválida.";
  }

  return null;
}

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const ownershipError = await verifyAccountAndCategory(userId, d.accountId, d.categoryId || null);
  if (ownershipError) return { error: ownershipError };

  const date = new Date(`${d.date}T12:00:00.000Z`);
  const installments = d.installments ?? 1;

  // Compra parcelada: uma transação por parcela, nos meses seguintes.
  if (installments > 1) {
    if (d.kind !== "EXPENSE") {
      return { error: "Parcelamento só faz sentido para saídas." };
    }
    const { created } = await insertInstallments({
      userId,
      description: d.description,
      totalCents: amountCents,
      count: installments,
      firstDate: date,
      kind: d.kind,
      nature: d.nature,
      accountId: d.accountId,
      categoryId: d.categoryId || null,
      notes: d.notes || null,
    });

    refresh();
    return created ? { ok: true } : { error: "Não foi possível criar as parcelas." };
  }

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

  const ownershipError = await verifyAccountAndCategory(userId, d.accountId, d.categoryId || null);
  if (ownershipError) return { error: ownershipError };

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

/**
 * Marca (ou desmarca) o lançamento como transferência entre contas suas.
 * Transferência não é gasto nem receita: sai dos totais para o dinheiro não
 * ser contado duas vezes — o caso clássico é o pagamento da fatura do cartão.
 */
export async function setTransactionTransfer(id: string, isTransfer: boolean) {
  const userId = await requireUserId();
  await db
    .update(transactions)
    .set({ isTransfer, updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  refresh();
  revalidatePath("/orcamento");
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
