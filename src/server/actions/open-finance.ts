"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, openFinanceConnections, openFinanceCredentials, openFinanceDeleted, openFinanceInvoices, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { getProfileRestriction } from "@/server/usage-profile";
import { deleteAllOpenFinanceSchema, deletePluggyTransactionSchema, isCompatiblePluggyAccount, linkOpenFinanceAccountSchema, openFinanceConnectionIdSchema, removeOpenFinanceConnectionSchema, removeOpenFinanceCredentialsSchema, saveOpenFinanceSetupSchema } from "@/server/open-finance/schemas";
import { canDeletePluggyTransaction, planConnectionDataDeletion } from "@/server/open-finance/deletion-policy";
import { decryptSecret, encryptSecret, secretFingerprint } from "@/server/open-finance/crypto";
import { authenticatePluggy, createPluggyConnectToken, getPluggyAccounts, getPluggyItem, PluggyHttpError, pluggyErrorForUser } from "@/server/open-finance/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolvePluggyApiKey, safeError, syncOpenFinanceForUser } from "@/server/open-finance/sync";
import { maskClientId } from "@/server/open-finance/access";

const OPEN_FINANCE_SETUP_LIMIT = 10;
const OPEN_FINANCE_SETUP_WINDOW_MS = 60 * 60 * 1000;

function pluggyMessage(status: number, code: string): string {
  return pluggyErrorForUser(new PluggyHttpError(status, code, "", ""));
}

function connectionErrorMessage(value: string | null): string | null {
  if (!value) return null;
  if (value === "NO_LINKED_ACCOUNTS") return "Nenhuma conta local está vinculada a esta conexão. Vincule uma conta antes de sincronizar.";
  if (value === "SYNC_ACCOUNT_ERRORS") return "Algumas contas não puderam ser sincronizadas. Consulte o resumo por conta.";
  try {
    const parsed = JSON.parse(value) as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof parsed.status === "number" && Number.isInteger(parsed.status) && typeof parsed.code === "string" && typeof parsed.message === "string") {
      return pluggyMessage(parsed.status, parsed.code);
    }
  } catch { /* Older rows contain a plain sanitized error code. */ }
  return "Não foi possível sincronizar esta conexão. Confira os dados e tente novamente.";
}

const saveOpenFinanceCredentialsSchema = z.object({
  clientId: z.string().trim().min(5, "Informe um Client ID válido."),
  clientSecret: z.string().trim().min(5, "Informe um Client Secret válido."),
});

export async function saveOpenFinanceCredentials(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };

  if (!checkRateLimit(`open-finance-creds:${userId}`, 10, Date.now(), 60 * 60 * 1000).allowed) {
    return { error: "Muitas tentativas. Aguarde uma hora e tente novamente." };
  }

  const parsed = saveOpenFinanceCredentialsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos informados." };
  const { clientId, clientSecret } = parsed.data;

  try {
    // Valida as credenciais chamando a Pluggy antes de persistir
    await authenticatePluggy(clientId, clientSecret);

    await db
      .insert(openFinanceCredentials)
      .values({
        userId,
        clientIdEnvelope: encryptSecret(clientId, userId, "clientId"),
        clientSecretEnvelope: encryptSecret(clientSecret, userId, "clientSecret"),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: openFinanceCredentials.userId,
        set: {
          clientIdEnvelope: encryptSecret(clientId, userId, "clientId"),
          clientSecretEnvelope: encryptSecret(clientSecret, userId, "clientSecret"),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    return { error: safeError(error) };
  }

  revalidatePath("/configuracoes/integracao");
  return { ok: true };
}

export async function getOpenFinanceSetup() {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) throw new Error(restriction);

  const [credential] = await db
    .select({
      clientIdEnvelope: openFinanceCredentials.clientIdEnvelope,
      updatedAt: openFinanceCredentials.updatedAt,
    })
    .from(openFinanceCredentials)
    .where(eq(openFinanceCredentials.userId, userId))
    .limit(1);

  let clientIdMasked: string | null = null;
  if (credential) {
    try {
      const rawClientId = decryptSecret(credential.clientIdEnvelope, userId, "clientId");
      clientIdMasked = maskClientId(rawClientId);
    } catch {
      clientIdMasked = "••••";
    }
  }

  const storedConnections = (await db
    .select({
      id: openFinanceConnections.id,
      label: openFinanceConnections.label,
      status: openFinanceConnections.status,
      lastErrorCode: openFinanceConnections.lastErrorCode,
      lastAttemptAt: openFinanceConnections.lastAttemptAt,
      lastSyncedAt: openFinanceConnections.lastSyncedAt,
      importFromDate: openFinanceConnections.importFromDate,
    })
    .from(openFinanceConnections)
    .where(eq(openFinanceConnections.userId, userId))) ?? [];

  const connections = Array.isArray(storedConnections)
    ? storedConnections.map((connection) => ({
        ...connection,
        lastErrorMessage: connectionErrorMessage(connection.lastErrorCode),
      }))
    : [];

  const localAccounts = (await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      financeMode: accounts.financeMode,
      externalAccountId: accounts.externalAccountId,
      bankBalanceCents: accounts.bankBalanceCents,
      bankBalanceAt: accounts.bankBalanceAt,
      creditLimitCents: accounts.creditLimitCents,
      availableCreditCents: accounts.availableCreditCents,
      creditSnapshotAt: accounts.creditSnapshotAt,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.archived, false)))) ?? [];

  const invoices = (await db
    .select({
      accountId: openFinanceInvoices.accountId,
      invoiceRef: openFinanceInvoices.invoiceRef,
      dueDate: openFinanceInvoices.dueDate,
      totalAmountCents: openFinanceInvoices.totalAmountCents,
      minimumPaymentCents: openFinanceInvoices.minimumPaymentCents,
    })
    .from(openFinanceInvoices)
    .where(eq(openFinanceInvoices.userId, userId))) ?? [];

  return {
    credentialConfigured: Boolean(credential),
    clientIdMasked,
    connections,
    accounts: localAccounts,
    invoices,
  };
}

export async function getPluggyConnectToken() {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };

  const [credentials] = await db
    .select({
      clientIdEnvelope: openFinanceCredentials.clientIdEnvelope,
      clientSecretEnvelope: openFinanceCredentials.clientSecretEnvelope,
    })
    .from(openFinanceCredentials)
    .where(eq(openFinanceCredentials.userId, userId))
    .limit(1);

  if (!credentials) {
    return {
      error: "Configure suas credenciais da Pluggy antes de conectar.",
      needsCredentials: true,
    };
  }

  if (!checkRateLimit(`open-finance-token:${userId}`, 10, Date.now(), 60 * 1000).allowed) {
    return { error: "Muitas tentativas. Aguarde um momento e tente novamente." };
  }

  try {
    const clientId = decryptSecret(credentials.clientIdEnvelope, userId, "clientId");
    const clientSecret = decryptSecret(credentials.clientSecretEnvelope, userId, "clientSecret");
    const apiKey = await authenticatePluggy(clientId, clientSecret);
    const connectToken = await createPluggyConnectToken(apiKey, {
      clientUserId: userId,
      avoidDuplicates: true,
    });
    return { ok: true, connectToken };
  } catch (error) {
    const errorType = error instanceof PluggyHttpError
      ? `PluggyHttpError(${error.status}:${error.code})`
      : error instanceof Error
        ? `${error.name}: ${error.message.replace(/[\r\n]/g, " ").slice(0, 80)}`
        : "UnknownError";
    console.error("Open Finance connectToken generation failed", { errorType });
    if (error instanceof PluggyHttpError && error.status === 401) {
      return { error: "Credenciais da Pluggy inválidas ou expiradas. Atualize seu Client ID e Client Secret em Configurações > Integração." };
    }
    return { error: safeError(error) };
  }
}

const connectPluggyItemSchema = z.object({
  itemId: z.string().min(1).max(100),
  label: z.string().max(100).optional(),
});

export async function connectPluggyItem(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };

  if (!checkRateLimit(`open-finance-connect:${userId}`, 10, Date.now(), 60 * 1000).allowed) {
    return { error: "Muitas tentativas de conexão. Aguarde um momento." };
  }

  const parsed = connectPluggyItemSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { itemId, label } = parsed.data;

  try {
    const apiKey = await resolvePluggyApiKey(userId);

    // Validação de Segurança Crucial (Anti-IDOR):
    const item = await getPluggyItem(apiKey, itemId);
    if (!item.clientUserId || item.clientUserId !== userId) {
      return { error: "Item não autorizado para este usuário." };
    }

    const itemIdHash = secretFingerprint(itemId);
    const importFromDate = new Date();
    importFromDate.setDate(1); // Primeiro dia do mês atual

    await db
      .insert(openFinanceConnections)
      .values({
        userId,
        itemIdEnvelope: encryptSecret(itemId, userId, "itemId"),
        itemIdHash,
        label: label?.trim().slice(0, 100) || "Conexão Pluggy",
        importFromDate,
        status: item.status ?? "UPDATING",
      })
      .onConflictDoUpdate({
        target: [openFinanceConnections.userId, openFinanceConnections.itemIdHash],
        set: {
          label: label?.trim().slice(0, 100) || "Conexão Pluggy",
          status: item.status ?? "UPDATING",
        },
      });

    const [connection] = await db
      .select({ id: openFinanceConnections.id })
      .from(openFinanceConnections)
      .where(and(eq(openFinanceConnections.userId, userId), eq(openFinanceConnections.itemIdHash, itemIdHash)))
      .limit(1);

    if (connection) {
      try {
        await syncOpenFinance({ connectionId: connection.id });
      } catch {
        // Falha no sync inicial não quebra o salvamento
      }
    }

    revalidatePath("/configuracoes/integracao");
    return { ok: true, connectionId: connection?.id };
  } catch (error) {
    return { error: safeError(error) };
  }
}

export async function saveOpenFinanceSetup(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  if (!checkRateLimit(`open-finance-setup:${userId}`, OPEN_FINANCE_SETUP_LIMIT, Date.now(), OPEN_FINANCE_SETUP_WINDOW_MS).allowed) {
    return { error: "Muitas tentativas de configuração. Aguarde uma hora e tente novamente." };
  }
  const parsed = saveOpenFinanceSetupSchema.safeParse(input);
  if (!parsed.success) return { error: "Confira os campos informados." };
  const data = parsed.data;
  const date = new Date(`${data.importFromDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date > new Date()) return { error: "A data inicial precisa ser válida e não futura." };
  try {
    const [stored] = await db.select().from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1);
    const clientId = data.clientId || (stored ? decryptSecret(stored.clientIdEnvelope, userId, "clientId") : "");
    const clientSecret = data.clientSecret || (stored ? decryptSecret(stored.clientSecretEnvelope, userId, "clientSecret") : "");
    if (!clientId || !clientSecret) return { error: "Informe clientId e clientSecret para a primeira conexão." };
    const apiKey = await authenticatePluggy(clientId, clientSecret);
    await getPluggyAccounts(apiKey, data.itemId);
    const itemIdHash = secretFingerprint(data.itemId);
    await db.transaction(async (tx) => {
      if (!stored || data.clientId || data.clientSecret) await tx.insert(openFinanceCredentials).values({ userId, clientIdEnvelope: encryptSecret(clientId, userId, "clientId"), clientSecretEnvelope: encryptSecret(clientSecret, userId, "clientSecret") }).onConflictDoUpdate({ target: openFinanceCredentials.userId, set: { clientIdEnvelope: encryptSecret(clientId, userId, "clientId"), clientSecretEnvelope: encryptSecret(clientSecret, userId, "clientSecret"), updatedAt: new Date() } });
      await tx.insert(openFinanceConnections).values({ userId, itemIdEnvelope: encryptSecret(data.itemId, userId, "itemId"), itemIdHash, label: data.label?.trim().slice(0, 100) || "Conexão Pluggy", importFromDate: date }).onConflictDoUpdate({ target: [openFinanceConnections.userId, openFinanceConnections.itemIdHash], set: { label: data.label?.trim().slice(0, 100) || "Conexão Pluggy", importFromDate: date } });
    });
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/configuracoes/integracao");
  return { ok: true };
}

export async function discoverOpenFinanceAccounts(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = openFinanceConnectionIdSchema.safeParse({ connectionId: input });
  if (!parsed.success) return { error: "Conexão inválida." };
  const connectionId = parsed.data.connectionId;
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  if (!connection) return { error: "Conexão não encontrada." };
  try {
    const key = await resolvePluggyApiKey(userId);
    const rows = await getPluggyAccounts(key, decryptSecret(connection.itemIdEnvelope, userId, "itemId"));
    return { accounts: rows.map((a) => ({ id: a.id, name: a.name ?? a.subtype ?? a.type, type: a.type, currency: a.currencyCode })) };
  } catch (error) { return { error: safeError(error) }; }
}

export async function linkOpenFinanceAccount(input: { accountId: string; connectionId: string; externalAccountId: string | null; mode: "manual" | "integracao" }) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = linkOpenFinanceAccountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos informados." };
  const data = parsed.data;
  if (data.mode === "manual") {
    const manualRestriction = await getProfileRestriction(userId, "manual-entry");
    if (manualRestriction) return { error: manualRestriction };
  }
  const [account] = await db.select({ id: accounts.id, type: accounts.type, financeMode: accounts.financeMode }).from(accounts).where(and(eq(accounts.id, data.accountId), eq(accounts.userId, userId))).limit(1);
  if (!account) return { error: "Conta não encontrada." };
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, data.connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  if (!connection) return { error: "Conexão não encontrada." };
  if (data.mode === "integracao") {
    if (!data.externalAccountId) return { error: "Escolha uma conta Pluggy válida." };
    try {
      const key = await resolvePluggyApiKey(userId);
      const remote = (await getPluggyAccounts(key, decryptSecret(connection.itemIdEnvelope, userId, "itemId"))).find((item) => item.id === data.externalAccountId);
      if (!remote || !isCompatiblePluggyAccount(account.type, remote.type)) return { error: "A conta externa não pertence a essa conexão ou tem tipo incompatível." };
    } catch (error) { return { error: safeError(error) }; }
    const [duplicate] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.externalAccountId, data.externalAccountId))).limit(1);
    if (duplicate && duplicate.id !== account.id) return { error: "Essa conta externa já está vinculada." };
  }
  await db.update(accounts).set({ financeMode: data.mode, externalAccountId: data.mode === "integracao" ? data.externalAccountId : null, externalConnectionId: data.mode === "integracao" ? data.connectionId : null }).where(and(eq(accounts.id, account.id), eq(accounts.userId, userId)));
  revalidatePath("/configuracoes"); revalidatePath("/contas"); revalidatePath("/importar");
  return { ok: true };
}

export async function deletePluggyTransaction(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = deletePluggyTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: "Lançamento inválido." };
  try {
    const [row] = await db.select({ id: transactions.id, userId: transactions.userId, accountId: transactions.accountId, externalId: transactions.externalId, origin: transactions.origin }).from(transactions).where(and(eq(transactions.id, parsed.data.transactionId), eq(transactions.userId, userId))).limit(1);
    const candidate = row ?? null;
    if (!canDeletePluggyTransaction(candidate, userId) || !candidate.externalId) return { error: "Lançamento Pluggy não encontrado." };
    await db.transaction(async (tx) => {
      await tx.insert(openFinanceDeleted).values({ userId, accountId: candidate.accountId, externalId: candidate.externalId }).onConflictDoNothing();
      await tx.delete(transactions).where(and(eq(transactions.id, candidate.id), eq(transactions.userId, userId), eq(transactions.accountId, candidate.accountId), eq(transactions.externalId, candidate.externalId), eq(transactions.origin, "PLUGGY")));
    });
    revalidatePath("/lancamentos"); revalidatePath("/painel"); revalidatePath("/contas");
    return { ok: true };
  } catch (error) {
    return { error: safeError(error) };
  }
}

export async function getOpenFinanceDeletionCounts(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = openFinanceConnectionIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Conexão inválida." };
  try {
    const [connection] = await db.select({ id: openFinanceConnections.id }).from(openFinanceConnections).where(and(eq(openFinanceConnections.id, parsed.data.connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
    if (!connection) return { error: "Conexão não encontrada." };
    const localAccounts = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id)));
    const accountIds = localAccounts.map((account) => account.id);
    if (!accountIds.length) return { transactions: 0, invoices: 0, tombstones: 0 };
    const [transactionRows, invoiceRows, tombstoneRows] = await Promise.all([
      db.select({ id: transactions.id, userId: transactions.userId, accountId: transactions.accountId, origin: transactions.origin }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.origin, "PLUGGY"), inArray(transactions.accountId, accountIds))),
      db.select({ id: openFinanceInvoices.id, userId: openFinanceInvoices.userId, accountId: openFinanceInvoices.accountId }).from(openFinanceInvoices).where(and(eq(openFinanceInvoices.userId, userId), inArray(openFinanceInvoices.accountId, accountIds))),
      db.select({ userId: openFinanceDeleted.userId, accountId: openFinanceDeleted.accountId, externalId: openFinanceDeleted.externalId }).from(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), inArray(openFinanceDeleted.accountId, accountIds))),
    ]);
    const plan = planConnectionDataDeletion({ userId, accountIds, transactions: transactionRows, invoices: invoiceRows, tombstones: tombstoneRows });
    return { transactions: plan.transactionIds.length, invoices: plan.invoiceIds.length, tombstones: plan.tombstoneExternalIds.length };
  } catch (error) {
    return { error: safeError(error) };
  }
}

export async function deleteAllOpenFinanceData(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = deleteAllOpenFinanceSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirme explicitamente a exclusão dos dados Pluggy." };
  try {
    const result = await db.transaction(async (tx) => {
      const [connection] = await tx.select({ id: openFinanceConnections.id, status: openFinanceConnections.status }).from(openFinanceConnections).where(and(eq(openFinanceConnections.id, parsed.data.connectionId), eq(openFinanceConnections.userId, userId))).for("update").limit(1);
      if (!connection) return { error: "Conexão não encontrada." };
      if (connection.status === "SYNCING") return { error: "Aguarde a sincronizacao terminar antes de excluir os dados." };
      const localAccounts = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id)));
      const accountIds = localAccounts.map((account) => account.id);
      if (!accountIds.length) return { ok: true, transactions: 0, invoices: 0, tombstones: 0 };
      const [transactionRows, invoiceRows, tombstoneRows] = await Promise.all([
        tx.select({ id: transactions.id, userId: transactions.userId, accountId: transactions.accountId, origin: transactions.origin }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.origin, "PLUGGY"), inArray(transactions.accountId, accountIds))),
        tx.select({ id: openFinanceInvoices.id, userId: openFinanceInvoices.userId, accountId: openFinanceInvoices.accountId }).from(openFinanceInvoices).where(and(eq(openFinanceInvoices.userId, userId), inArray(openFinanceInvoices.accountId, accountIds))),
        tx.select({ userId: openFinanceDeleted.userId, accountId: openFinanceDeleted.accountId, externalId: openFinanceDeleted.externalId }).from(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), inArray(openFinanceDeleted.accountId, accountIds))),
      ]);
      const plan = planConnectionDataDeletion({ userId, accountIds, transactions: transactionRows, invoices: invoiceRows, tombstones: tombstoneRows });
      if (plan.transactionIds.length) await tx.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.origin, "PLUGGY"), inArray(transactions.id, plan.transactionIds)));
      if (plan.invoiceIds.length) await tx.delete(openFinanceInvoices).where(and(eq(openFinanceInvoices.userId, userId), inArray(openFinanceInvoices.id, plan.invoiceIds)));
      if (plan.tombstoneExternalIds.length) await tx.delete(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), inArray(openFinanceDeleted.accountId, accountIds), inArray(openFinanceDeleted.externalId, plan.tombstoneExternalIds)));
      return { ok: true, transactions: plan.transactionIds.length, invoices: plan.invoiceIds.length, tombstones: plan.tombstoneExternalIds.length };
    });
    if ("ok" in result) { revalidatePath("/configuracoes/integracao"); revalidatePath("/lancamentos"); revalidatePath("/contas"); revalidatePath("/painel"); }
    return result;
  } catch (error) {
    return { error: safeError(error) };
  }
}

export async function removeOpenFinanceCredentials(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = removeOpenFinanceCredentialsSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirme explicitamente a remoção das credenciais." };
  try {
    const result = await db.transaction(async (tx) => {
      const [connection] = await tx.select({ id: openFinanceConnections.id }).from(openFinanceConnections).where(eq(openFinanceConnections.userId, userId)).limit(1);
      if (connection) return { error: "Remova todas as conexões antes de remover as credenciais." };
      const deleted = await tx.delete(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).returning({ userId: openFinanceCredentials.userId });
      return deleted.length ? { ok: true } : { error: "Nenhuma credencial salva." };
    });
    if ("ok" in result) revalidatePath("/configuracoes/integracao");
    return result;
  } catch (error) {
    return { error: safeError(error) };
  }
}

export async function removeOpenFinanceConnection(input: unknown) {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = removeOpenFinanceConnectionSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirme explicitamente a remoção da conexão." };
  try {
    const result = await db.transaction(async (tx) => {
      const [connection] = await tx.select({ id: openFinanceConnections.id, status: openFinanceConnections.status }).from(openFinanceConnections).where(and(eq(openFinanceConnections.id, parsed.data.connectionId), eq(openFinanceConnections.userId, userId))).for("update").limit(1);
      if (!connection) return { error: "Conexão não encontrada." };
      if (connection.status === "SYNCING") return { error: "Aguarde a sincronizacao terminar antes de remover a conexao." };
      const localAccounts = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id)));
      const accountIds = localAccounts.map((account) => account.id);
      let deletedTransactions = 0;
      let deletedInvoices = 0;
      if (accountIds.length) {
        const invoiceRows = await tx.select({ id: openFinanceInvoices.id, userId: openFinanceInvoices.userId, accountId: openFinanceInvoices.accountId }).from(openFinanceInvoices).where(and(eq(openFinanceInvoices.userId, userId), inArray(openFinanceInvoices.accountId, accountIds)));
        deletedInvoices = invoiceRows.length;
        if (parsed.data.deleteImported) {
          const [transactionRows, tombstoneRows] = await Promise.all([
            tx.select({ id: transactions.id, userId: transactions.userId, accountId: transactions.accountId, origin: transactions.origin }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.origin, "PLUGGY"), inArray(transactions.accountId, accountIds))),
            tx.select({ userId: openFinanceDeleted.userId, accountId: openFinanceDeleted.accountId, externalId: openFinanceDeleted.externalId }).from(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), inArray(openFinanceDeleted.accountId, accountIds))),
          ]);
          const plan = planConnectionDataDeletion({ userId, accountIds, transactions: transactionRows, invoices: invoiceRows, tombstones: tombstoneRows });
          deletedTransactions = plan.transactionIds.length;
          if (plan.transactionIds.length) await tx.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.origin, "PLUGGY"), inArray(transactions.id, plan.transactionIds)));
          if (plan.tombstoneExternalIds.length) await tx.delete(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), inArray(openFinanceDeleted.accountId, accountIds), inArray(openFinanceDeleted.externalId, plan.tombstoneExternalIds)));
        }
        if (deletedInvoices) await tx.delete(openFinanceInvoices).where(and(eq(openFinanceInvoices.userId, userId), inArray(openFinanceInvoices.accountId, accountIds)));
        await tx.update(accounts).set({ financeMode: "manual", externalAccountId: null, externalConnectionId: null, bankBalanceCents: null, bankBalanceAt: null, creditLimitCents: null, availableCreditCents: null, creditSnapshotAt: null }).where(and(eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id)));
      }
      await tx.delete(openFinanceConnections).where(and(eq(openFinanceConnections.id, connection.id), eq(openFinanceConnections.userId, userId)));
      return { ok: true, deletedTransactions, deletedInvoices, importedPreserved: !parsed.data.deleteImported };
    });
    if ("ok" in result) { revalidatePath("/configuracoes/integracao"); revalidatePath("/lancamentos"); revalidatePath("/contas"); revalidatePath("/painel"); revalidatePath("/importar"); }
    return result;
  } catch (error) {
    return { error: safeError(error) };
  }
}

// Chamado pelo painel a cada visita: só sincroniza se a última tentativa tem 5+ min.
export async function autoSyncOpenFinance(): Promise<{ synced: boolean; error?: string }> {
  const userId = await requireUserId();
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { synced: false, error: restriction };
  let synced = false;
  let failed = false;
  try {
    const rows = await db.select({ id: openFinanceConnections.id }).from(openFinanceConnections).where(eq(openFinanceConnections.userId, userId));
    for (const row of rows) {
      try {
        const result = await syncOpenFinance(row.id, "auto");
        if (!result || ("skipped" in result && result.skipped)) continue;
        if ("error" in result && result.error) failed = true;
        else synced = true;
      } catch {
        failed = true;
        console.error("Open Finance auto sync failed", { code: "AUTO_SYNC_FAILED" });
        try {
          await db.update(openFinanceConnections).set({ status: "ERROR", lastErrorCode: "AUTO_SYNC_FAILED" })
            .where(and(eq(openFinanceConnections.id, row.id), eq(openFinanceConnections.userId, userId)));
        } catch {
          console.error("Open Finance auto sync error could not be saved", { code: "AUTO_SYNC_ERROR_WRITE_FAILED" });
        }
      }
    }
  } catch {
    failed = true;
    console.error("Open Finance auto sync unavailable", { code: "AUTO_SYNC_UNAVAILABLE" });
  }
  return { synced, ...(failed ? { error: "Não foi possível concluir a sincronização automática. Confira as integrações e tente novamente." } : {}) };
}

export async function syncOpenFinance(input: unknown, mode: "manual" | "auto" = "manual") {
  const userId = await requireUserId();
  return syncOpenFinanceForUser(userId, input, mode, { revalidate: revalidatePath });
}
