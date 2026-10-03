"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents, MAX_CENTS } from "@/lib/money";
import { fingerprint } from "@/lib/categorize";
import { createId } from "@/lib/id";
import { transferLegs } from "@/lib/transfers";
import { resolveTransactionInvoiceRef } from "@/lib/invoices";
import { insertInstallments } from "@/server/installments";

export type ActionState = { error?: string; ok?: boolean; groupId?: string };

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
async function getAccountAndVerify(
  userId: string,
  accountId: string,
  categoryId: string | null,
): Promise<{ error?: string; account?: { id: string; type: string; closingDay: number | null; dueDay: number | null } }> {
  const [account] = await db
    .select({
      id: accounts.id,
      type: accounts.type,
      closingDay: accounts.closingDay,
      dueDay: accounts.dueDay,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Conta inválida." };

  if (categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    if (!category) return { error: "Categoria inválida." };
  }

  return { account };
}

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const amountCents = Math.abs(parseMoneyToCents(d.amount));
  if (amountCents > MAX_CENTS) return { error: "Valor muito alto." };
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const check = await getAccountAndVerify(userId, d.accountId, d.categoryId || null);
  if (check.error || !check.account) return { error: check.error ?? "Conta inválida." };
  const account = check.account;

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
      closingDay: account.closingDay,
      dueDay: account.dueDay,
    });

    refresh();
    return created ? { ok: true } : { error: "Não foi possível criar as parcelas." };
  }

  const invoiceRef = resolveTransactionInvoiceRef({
    accountType: account.type,
    closingDay: account.closingDay,
    dueDay: account.dueDay,
    date,
  });

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
    invoiceRef,
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
  if (amountCents > MAX_CENTS) return { error: "Valor muito alto." };
  if (amountCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const check = await getAccountAndVerify(userId, d.accountId, d.categoryId || null);
  if (check.error || !check.account) return { error: check.error ?? "Conta inválida." };
  const account = check.account;

  const date = new Date(`${d.date}T12:00:00.000Z`);

  const [existing] = await db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      installmentGroupId: transactions.installmentGroupId,
      importBatchId: transactions.importBatchId,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  if (!existing) return { error: "Não encontrado." };
  // Editar uma perna isolada deixaria o par de transferência inconsistente.
  if (existing.transferGroupId) {
    return { error: "Transferência: exclua e crie de novo para alterar." };
  }

  // Parcelas e linhas importadas guardam a fatura do lote/ciclo original (a data da linha não
  // reproduz o ciclo); só recalcula quando é lançamento manual e data ou conta mudaram.
  const keepRef =
    !!existing.installmentGroupId ||
    !!existing.importBatchId ||
    (existing.accountId === d.accountId && existing.date.getTime() === date.getTime());
  const invoiceRef = keepRef
    ? undefined
    : resolveTransactionInvoiceRef({
        accountType: account.type,
        closingDay: account.closingDay,
        dueDay: account.dueDay,
        date,
      });

  const result = await db
    .update(transactions)
    .set({
      accountId: d.accountId,
      categoryId: d.categoryId || null,
      date,
      description: d.description,
      amountCents,
      kind: d.kind,
      nature: d.kind === "INCOME" ? "VARIABLE" : d.nature,
      notes: d.notes || null,
      invoiceRef,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });

  if (result.length === 0) return { error: "Não encontrado." };
  refresh();
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  const userId = await requireUserId();

  const [tx] = await db
    .select({ id: transactions.id, transferGroupId: transactions.transferGroupId })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);

  if (!tx) return;

  if (tx.transferGroupId) {
    // Apaga o grupo inteiro (2 DELETE em db.transaction, exige 2 linhas)
    await db.transaction(async (txDb) => {
      const legs = await txDb
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.transferGroupId, tx.transferGroupId!),
            eq(transactions.userId, userId),
          ),
        );

      // 2 pernas normalmente; 1 quando a outra conta foi excluída (perna órfã, ON DELETE CASCADE)
      if (legs.length < 1 || legs.length > 2) {
        throw new Error("Transferência inválida para exclusão.");
      }

      let deletedRows = 0;
      for (const leg of legs) {
        const deleted = await txDb
          .delete(transactions)
          .where(and(eq(transactions.id, leg.id), eq(transactions.userId, userId)))
          .returning({ id: transactions.id });
        deletedRows += deleted.length;
      }

      if (deletedRows !== legs.length) {
        throw new Error(`Esperado exclusão de ${legs.length} linhas, mas foram excluídas ${deletedRows}.`);
      }
    });
  } else {
    await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  }

  refresh();
}

/**
 * Marca (ou desmarca) o lançamento como transferência entre contas suas.
 * Transferência não é gasto nem receita: sai dos totais para o dinheiro não
 * ser contado duas vezes — o caso clássico é o pagamento da fatura do cartão.
 */
export async function setTransactionTransfer(id: string, isTransfer: boolean): Promise<ActionState> {
  const userId = await requireUserId();

  if (!isTransfer) {
    const [tx] = await db
      .select({ transferGroupId: transactions.transferGroupId })
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);

    if (tx?.transferGroupId) {
      return { error: "Excluir a transferencia inteira em vez de parcelar" };
    }
  }

  const result = await db
    .update(transactions)
    .set({ isTransfer, updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  if (result.length === 0) return { error: "Não encontrado." };
  refresh();
  revalidatePath("/orcamento");
  return { ok: true };
}

export type UpdateTransferInput = {
  amountCents?: number;
  date?: Date | string;
  note?: string | null;
  fromAccountId?: string;
  toAccountId?: string;
};

export async function createTransfer(
  userId: string,
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
  date: Date | string,
  note?: string | null,
): Promise<ActionState> {
  const authUserId = await requireUserId();
  if (userId && userId !== authUserId) {
    return { error: "Não autorizado." };
  }
  const effectiveUserId = authUserId || userId;

  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
    return { error: "As contas de origem e destino devem ser diferentes." };
  }

  if (
    typeof amountCents !== "number" ||
    !Number.isFinite(amountCents) ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    return { error: "O valor precisa ser maior que zero." };
  }

  if (amountCents > MAX_CENTS) {
    return { error: "Valor muito alto." };
  }

  // Verifica que ambas as contas existem e pertencem ao usuário
  const userAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, effectiveUserId), inArray(accounts.id, [fromAccountId, toAccountId])));

  if (userAccounts.length !== 2) {
    return { error: "Contas inválidas ou não pertencem ao usuário." };
  }

  const parsedDate =
    typeof date === "string"
      ? new Date(date.includes("T") ? date : `${date}T12:00:00.000Z`)
      : date;

  if (isNaN(parsedDate.getTime())) {
    return { error: "Data inválida." };
  }

  const groupId = createId();

  let outgoingLeg;
  let incomingLeg;
  try {
    const legs = transferLegs(fromAccountId, toAccountId, amountCents, parsedDate, note, groupId);
    outgoingLeg = legs[0];
    incomingLeg = legs[1];
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao gerar pernas da transferência." };
  }

  await db.transaction(async (tx) => {
    await tx.insert(transactions).values([
      {
        ...outgoingLeg,
        userId: effectiveUserId,
      },
      {
        ...incomingLeg,
        userId: effectiveUserId,
      },
    ]);
  });

  refresh();
  revalidatePath("/orcamento");
  return { ok: true, groupId };
}

export async function updateTransfer(
  userId: string,
  groupId: string,
  updates: UpdateTransferInput & { kind?: never },
): Promise<ActionState> {
  const authUserId = await requireUserId();
  if (userId && userId !== authUserId) {
    return { error: "Não autorizado." };
  }
  const effectiveUserId = authUserId || userId;

  if (!groupId) {
    return { error: "Grupo de transferência não informado." };
  }

  // Não permite trocar kind
  if ("kind" in (updates as Record<string, unknown>)) {
    return { error: "Não é permitido alterar o tipo (kind) da transferência." };
  }

  if (updates.amountCents !== undefined) {
    if (
      typeof updates.amountCents !== "number" ||
      !Number.isFinite(updates.amountCents) ||
      !Number.isInteger(updates.amountCents) ||
      updates.amountCents <= 0
    ) {
      return { error: "O valor precisa ser maior que zero." };
    }
    if (updates.amountCents > MAX_CENTS) {
      return { error: "Valor muito alto." };
    }
  }

  // Busca as 2 pernas existentes no banco pelo transferGroupId e userId
  const legs = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.transferGroupId, groupId), eq(transactions.userId, effectiveUserId)));

  if (legs.length !== 2) {
    return { error: "Transferência não encontrada ou incompleta." };
  }

  const outgoingLeg = legs.find((l) => l.kind === "EXPENSE");
  const incomingLeg = legs.find((l) => l.kind === "INCOME");

  if (!outgoingLeg || !incomingLeg) {
    return { error: "Pernas da transferência inválidas." };
  }

  const targetFrom = updates.fromAccountId ?? outgoingLeg.accountId;
  const targetTo = updates.toAccountId ?? incomingLeg.accountId;

  if (targetFrom === targetTo) {
    return { error: "As contas de origem e destino devem ser diferentes." };
  }

  if (updates.fromAccountId || updates.toAccountId) {
    const accountsToCheck = Array.from(new Set([targetFrom, targetTo]));
    const userAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, effectiveUserId), inArray(accounts.id, accountsToCheck)));

    if (userAccounts.length !== accountsToCheck.length) {
      return { error: "Contas inválidas ou não pertencem ao usuário." };
    }
  }

  let parsedDate: Date | undefined;
  if (updates.date !== undefined) {
    parsedDate =
      typeof updates.date === "string"
        ? new Date(updates.date.includes("T") ? updates.date : `${updates.date}T12:00:00.000Z`)
        : updates.date;
    if (isNaN(parsedDate.getTime())) {
      return { error: "Data inválida." };
    }
  }

  const commonUpdates: {
    amountCents?: number;
    date?: Date;
    notes?: string | null;
    description?: string;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (updates.amountCents !== undefined) {
    commonUpdates.amountCents = updates.amountCents;
  }
  if (parsedDate !== undefined) {
    commonUpdates.date = parsedDate;
  }
  if (updates.note !== undefined) {
    commonUpdates.notes = updates.note;
    commonUpdates.description = updates.note?.trim() || "Transferência";
  }

  try {
    await db.transaction(async (tx) => {
      const resOut = await tx
        .update(transactions)
        .set({
          ...commonUpdates,
          ...(updates.fromAccountId ? { accountId: updates.fromAccountId } : {}),
        })
        .where(
          and(
            eq(transactions.id, outgoingLeg.id),
            eq(transactions.userId, effectiveUserId),
            eq(transactions.transferGroupId, groupId),
            eq(transactions.kind, "EXPENSE"),
          ),
        )
        .returning({ id: transactions.id });

      const resIn = await tx
        .update(transactions)
        .set({
          ...commonUpdates,
          ...(updates.toAccountId ? { accountId: updates.toAccountId } : {}),
        })
        .where(
          and(
            eq(transactions.id, incomingLeg.id),
            eq(transactions.userId, effectiveUserId),
            eq(transactions.transferGroupId, groupId),
            eq(transactions.kind, "INCOME"),
          ),
        )
        .returning({ id: transactions.id });

      const affected = resOut.length + resIn.length;
      if (affected !== 2) {
        throw new Error(`Esperado atualizar exatamente 2 linhas, mas foram afetadas ${affected}.`);
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao atualizar transferência." };
  }

  refresh();
  revalidatePath("/orcamento");
  return { ok: true };
}

export async function setTransactionCategory(id: string, categoryId: string | null): Promise<ActionState> {
  const userId = await requireUserId();

  let nature: "FIXED" | "VARIABLE" | undefined;
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id, nature: categories.nature })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    if (!cat) return { error: "Categoria não encontrada." };
    nature = cat.nature;
  }

  const result = await db
    .update(transactions)
    .set({ categoryId, ...(nature ? { nature } : {}), updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });

  if (result.length === 0) return { error: "Não encontrado." };
  refresh();
  return { ok: true };
}
