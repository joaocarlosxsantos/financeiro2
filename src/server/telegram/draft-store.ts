import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { accounts, telegramLinks, telegramTransactionDrafts, transactions, users, type TelegramTransactionDraft } from "@/db/schema";
import { createId } from "@/lib/id";
import type { ParsedNaturalTransaction } from "./natural-transaction-parser";

export function createDraftId(): string {
  return "d" + randomBytes(8).toString("base64url").slice(0, 11).replace(/[-_]/g, "x");
}

export function computePayloadHash(
  txId: string,
  amountCents: number,
  kind: string,
  accountId: string,
  description: string,
  date: string,
): string {
  return createHash("sha256")
    .update(`${txId}:${amountCents}:${kind}:${accountId}:${description.trim()}:${date}`)
    .digest("hex");
}

export interface CreateDraftResult {
  ok: boolean;
  draft?: TelegramTransactionDraft;
  accountName?: string;
  error?: string;
}

export interface ConfirmDraftResult {
  ok: boolean;
  draft?: TelegramTransactionDraft;
  transactionId?: string;
  accountName?: string;
  message?: string;
}

export interface UndoDraftResult {
  ok: boolean;
  draft?: TelegramTransactionDraft;
  amountCents?: number;
  description?: string;
  message?: string;
}

export interface CancelDraftResult {
  ok: boolean;
  message?: string;
}

/**
 * Cria um rascunho de lançamento a partir do texto natural parsed.
 * Valida perfil (manual ou híbrido) e seleciona conta ativa do usuário.
 */
export async function createTransactionDraft(params: {
  userId: string;
  chatId: string;
  linkCreatedAt: Date;
  updateId: number;
  parsed: ParsedNaturalTransaction;
  connection?: typeof db;
  now?: Date;
}): Promise<CreateDraftResult> {
  const connection = params.connection ?? db;
  const now = params.now ?? new Date();

  // 1. Validar perfil do usuário (somente manual ou híbrido)
  const [user] = await connection
    .select({ id: users.id, usageProfile: users.usageProfile })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) {
    return { ok: false, error: "Usuário não encontrado." };
  }

  if (user.usageProfile === "integracao_total") {
    return {
      ok: false,
      error: "Seu perfil está configurado para integração automática. Lançamentos manuais são permitidos apenas nos perfis manual ou híbrido. Ajuste em Configurações no app.",
    };
  }

  // 2. Buscar conta ativa do usuário (priorizando CHECKING e CASH)
  const userAccounts = await connection
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.userId, params.userId), eq(accounts.archived, false)));

  if (!userAccounts.length) {
    return {
      ok: false,
      error: "Nenhuma conta ativa encontrada para registrar o lançamento. Cadastre uma conta no app.",
    };
  }

  // Ordena para preferir CHECKING ou CASH
  const selectedAccount =
    userAccounts.find((a) => a.type === "CHECKING") ??
    userAccounts.find((a) => a.type === "CASH") ??
    userAccounts.find((a) => a.type === "SAVINGS") ??
    userAccounts[0];

  const draftId = createDraftId();
  const expiresAt = new Date(now.getTime() + 10 * 60_000); // 10 minutos para confirmação

  const [draft] = await connection
    .insert(telegramTransactionDrafts)
    .values({
      id: draftId,
      userId: params.userId,
      chatId: params.chatId,
      linkCreatedAt: params.linkCreatedAt,
      sourceUpdateId: params.updateId,
      accountId: selectedAccount.id,
      description: params.parsed.description,
      amountCents: params.parsed.amountCents,
      transactionDate: params.parsed.date,
      kind: params.parsed.kind,
      nature: "VARIABLE",
      status: "PENDING",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!draft) {
    // Em caso de retry/replay com mesma chave de fonte, recupera o rascunho existente
    const [existing] = await connection
      .select()
      .from(telegramTransactionDrafts)
      .where(
        and(
          eq(telegramTransactionDrafts.userId, params.userId),
          eq(telegramTransactionDrafts.chatId, params.chatId),
          eq(telegramTransactionDrafts.linkCreatedAt, params.linkCreatedAt),
          eq(telegramTransactionDrafts.sourceUpdateId, params.updateId),
        ),
      )
      .limit(1);

    if (existing) {
      return { ok: true, draft: existing, accountName: selectedAccount.name };
    }
    return { ok: false, error: "Não foi possível criar o rascunho de lançamento." };
  }

  return { ok: true, draft, accountName: selectedAccount.name };
}

/**
 * Confirmação atômica do rascunho com SELECT FOR UPDATE e criação do lançamento financeiro.
 */
export async function confirmTransactionDraft(params: {
  draftId: string;
  chatId: string;
  connection?: typeof db;
  now?: Date;
}): Promise<ConfirmDraftResult> {
  const root = params.connection ?? db;
  const now = params.now ?? new Date();

  return root.transaction(async (tx) => {
    // 1. Bloqueia e lê o rascunho
    const [draft] = await tx
      .select()
      .from(telegramTransactionDrafts)
      .where(eq(telegramTransactionDrafts.id, params.draftId))
      .for("update")
      .limit(1);

    if (!draft) {
      return { ok: false, message: "Rascunho não encontrado." };
    }

    if (draft.status === "CONFIRMED") {
      return { ok: false, message: "Lançamento já foi confirmado anteriormente." };
    }
    if (draft.status === "CANCELLED") {
      return { ok: false, message: "Este lançamento foi cancelado." };
    }
    if (draft.status === "UNDONE") {
      return { ok: false, message: "Este lançamento foi desfeito." };
    }
    if (draft.status === "EXPIRED" || draft.expiresAt <= now) {
      await tx
        .update(telegramTransactionDrafts)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(eq(telegramTransactionDrafts.id, draft.id));
      return { ok: false, message: "Este rascunho expirou. Envie novamente para registrar." };
    }

    // 2. Revalidação do vínculo atual do chat/dono
    const [link] = await tx
      .select()
      .from(telegramLinks)
      .where(and(eq(telegramLinks.chatId, params.chatId), eq(telegramLinks.userId, draft.userId)))
      .for("update")
      .limit(1);

    if (!link || link.createdAt.getTime() !== draft.linkCreatedAt.getTime()) {
      return { ok: false, message: "Vínculo do Telegram alterado. Operação negada." };
    }

    // 3. Revalidação do perfil do usuário
    const [user] = await tx
      .select({ usageProfile: users.usageProfile })
      .from(users)
      .where(eq(users.id, draft.userId))
      .for("update")
      .limit(1);

    if (!user || user.usageProfile === "integracao_total") {
      return { ok: false, message: "Perfil não permite lançamentos manuais." };
    }

    // 4. Revalidação da conta do dono
    if (!draft.accountId) {
      return { ok: false, message: "Conta não definida no rascunho." };
    }

    const [account] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, draft.accountId), eq(accounts.userId, draft.userId), eq(accounts.archived, false)))
      .limit(1);

    if (!account) {
      return { ok: false, message: "Conta selecionada não está mais disponível." };
    }

    // 5. Criação do lançamento em transactions na mesma transação
    const txId = createId();
    const dateObj = new Date(`${draft.transactionDate}T12:00:00.000Z`);

    await tx.insert(transactions).values({
      id: txId,
      userId: draft.userId,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      date: dateObj,
      description: draft.description,
      amountCents: draft.amountCents,
      kind: draft.kind,
      nature: draft.nature,
      notes: `telegram:${draft.id}`,
    });

    // 6. Cálculo do hash determinista do payload confirmado
    const confirmedPayloadHash = computePayloadHash(
      txId,
      draft.amountCents,
      draft.kind,
      draft.accountId,
      draft.description,
      draft.transactionDate,
    );

    const undoUntil = new Date(now.getTime() + 24 * 60 * 60_000); // 24 horas para desfazer

    const [updatedDraft] = await tx
      .update(telegramTransactionDrafts)
      .set({
        status: "CONFIRMED",
        transactionId: txId,
        confirmedPayloadHash,
        confirmedAt: now,
        undoUntil,
        updatedAt: now,
      })
      .where(eq(telegramTransactionDrafts.id, draft.id))
      .returning();

    return {
      ok: true,
      draft: updatedDraft,
      transactionId: txId,
      accountName: account.name,
      message: "Lançamento confirmado com sucesso!",
    };
  });
}

/**
 * Desfaz de forma atômica um lançamento confirmado, verificando integridade do hash.
 * Se draftId não for informado, busca o lançamento confirmado mais recente dentro da janela.
 */
export async function undoTransactionDraft(params: {
  draftId?: string;
  chatId: string;
  connection?: typeof db;
  now?: Date;
}): Promise<UndoDraftResult> {
  const root = params.connection ?? db;
  const now = params.now ?? new Date();

  return root.transaction(async (tx) => {
    let draft: TelegramTransactionDraft | undefined;

    if (params.draftId) {
      const [row] = await tx
        .select()
        .from(telegramTransactionDrafts)
        .where(eq(telegramTransactionDrafts.id, params.draftId))
        .for("update")
        .limit(1);
      draft = row;
    } else {
      // Busca o último confirmado pelo chat dentro da janela de desfazer
      const [row] = await tx
        .select()
        .from(telegramTransactionDrafts)
        .where(
          and(
            eq(telegramTransactionDrafts.chatId, params.chatId),
            eq(telegramTransactionDrafts.status, "CONFIRMED"),
            gt(telegramTransactionDrafts.undoUntil, now),
          ),
        )
        .orderBy(desc(telegramTransactionDrafts.confirmedAt))
        .for("update")
        .limit(1);
      draft = row;
    }

    if (!draft) {
      return { ok: false, message: "Nenhum lançamento recente encontrado para desfazer." };
    }

    if (draft.status === "UNDONE") {
      return { ok: false, message: "Este lançamento já foi desfeito anteriormente." };
    }

    if (draft.status !== "CONFIRMED" || !draft.transactionId || !draft.confirmedPayloadHash) {
      return { ok: false, message: "Apenas lançamentos confirmados podem ser desfeitos." };
    }

    if (!draft.undoUntil || draft.undoUntil <= now) {
      return { ok: false, message: "O prazo para desfazer este lançamento expirou. Ajuste pelo app." };
    }

    // Revalidar vínculo do chat
    const [link] = await tx
      .select()
      .from(telegramLinks)
      .where(and(eq(telegramLinks.chatId, params.chatId), eq(telegramLinks.userId, draft.userId)))
      .for("update")
      .limit(1);

    if (!link) {
      return { ok: false, message: "Vínculo do Telegram inválido." };
    }

    // Buscar lançamento em transactions para conferir integridade
    const [existingTx] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, draft.transactionId))
      .for("update")
      .limit(1);

    if (!existingTx) {
      return { ok: false, message: "Lançamento não encontrado no banco ou já excluído no app." };
    }

    // Conferir se o lançamento foi alterado no app
    const currentHash = computePayloadHash(
      existingTx.id,
      existingTx.amountCents,
      existingTx.kind,
      existingTx.accountId,
      existingTx.description,
      draft.transactionDate,
    );

    if (
      existingTx.userId !== draft.userId ||
      existingTx.amountCents !== draft.amountCents ||
      existingTx.kind !== draft.kind ||
      existingTx.accountId !== draft.accountId ||
      currentHash !== draft.confirmedPayloadHash
    ) {
      return {
        ok: false,
        message: "O lançamento foi alterado no app e não pode ser desfeito pelo Telegram.",
      };
    }

    // Excluir atomicamente o lançamento
    await tx.delete(transactions).where(eq(transactions.id, existingTx.id));

    // Atualizar status do rascunho para UNDONE (preserva histórico de recibo)
    const [undoneDraft] = await tx
      .update(telegramTransactionDrafts)
      .set({
        status: "UNDONE",
        undoneAt: now,
        updatedAt: now,
      })
      .where(eq(telegramTransactionDrafts.id, draft.id))
      .returning();

    return {
      ok: true,
      draft: undoneDraft,
      amountCents: draft.amountCents,
      description: draft.description,
      message: "Lançamento desfeito com sucesso!",
    };
  });
}

/**
 * Cancela um rascunho de lançamento antes da confirmação.
 */
export async function cancelTransactionDraft(params: {
  draftId: string;
  chatId: string;
  connection?: typeof db;
  now?: Date;
}): Promise<CancelDraftResult> {
  const root = params.connection ?? db;
  const now = params.now ?? new Date();

  return root.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(telegramTransactionDrafts)
      .where(eq(telegramTransactionDrafts.id, params.draftId))
      .for("update")
      .limit(1);

    if (!draft) {
      return { ok: false, message: "Rascunho não encontrado." };
    }

    if (draft.status === "CANCELLED") {
      return { ok: true, message: "Lançamento já estava cancelado." };
    }

    if (draft.status !== "PENDING") {
      return { ok: false, message: "Apenas rascunhos pendentes podem ser cancelados." };
    }

    await tx
      .update(telegramTransactionDrafts)
      .set({
        status: "CANCELLED",
        updatedAt: now,
      })
      .where(eq(telegramTransactionDrafts.id, draft.id));

    return { ok: true, message: "Lançamento cancelado." };
  });
}
