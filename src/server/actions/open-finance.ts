"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, categoryRules, openFinanceConnections, openFinanceCredentials, openFinanceDeleted, openFinanceInvoices, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { amountToCents, deleteAllOpenFinanceSchema, deletePluggyTransactionSchema, isCompatiblePluggyAccount, linkOpenFinanceAccountSchema, openFinanceConnectionIdSchema, removeOpenFinanceConnectionSchema, removeOpenFinanceCredentialsSchema, saveOpenFinanceSetupSchema, shouldImportPluggyTransaction, transactionKind } from "@/server/open-finance/schemas";
import { canDeletePluggyTransaction, isExternalIdentityTombstoned, planConnectionDataDeletion } from "@/server/open-finance/deletion-policy";
import { decryptSecret, encryptSecret, secretFingerprint } from "@/server/open-finance/crypto";
import { authenticatePluggy, getPluggyAccounts, getPluggyBills, getPluggyItemStatus, getPluggyTransactions, PluggyHttpError, pluggyErrorForUser } from "@/server/open-finance/client";
import { createId } from "@/lib/id";
import { resolveTransactionInvoiceRef } from "@/lib/invoices";
import { anchorPluggyCivilDate, isBeforeCutoff } from "@/server/open-finance/cutoff";
import { categorizeBatch, disabledCategorizerProvider, type CategorizationCategory } from "@/server/categorization";
import { checkRateLimit } from "@/lib/rate-limit";

const OPEN_FINANCE_SETUP_LIMIT = 10;
const OPEN_FINANCE_SETUP_WINDOW_MS = 60 * 60 * 1000;
const SYNC_COOLDOWN_MS = 60 * 1000;
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

function pluggyMessage(status: number, code: string): string {
  return pluggyErrorForUser(new PluggyHttpError(status, code, "", ""));
}

const safeError = (error: unknown) => error instanceof PluggyHttpError
  ? pluggyMessage(error.status, error.code)
  : "N\u00e3o foi poss\u00edvel concluir. Confira a conex\u00e3o e tente novamente.";
function persistedError(error: unknown): string {
  if (error instanceof PluggyHttpError) return JSON.stringify({ status: error.status, code: error.code, message: error.providerMessage.slice(0, 200) });
  return safeError(error).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
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

export async function getOpenFinanceSetup() {
  const userId = await requireUserId();
  const [credential] = await db.select({ updatedAt: openFinanceCredentials.updatedAt }).from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1);
  const storedConnections = await db.select({ id: openFinanceConnections.id, label: openFinanceConnections.label, status: openFinanceConnections.status, lastErrorCode: openFinanceConnections.lastErrorCode, lastAttemptAt: openFinanceConnections.lastAttemptAt, lastSyncedAt: openFinanceConnections.lastSyncedAt, importFromDate: openFinanceConnections.importFromDate }).from(openFinanceConnections).where(eq(openFinanceConnections.userId, userId));
  const connections = storedConnections.map((connection) => ({ ...connection, lastErrorMessage: connectionErrorMessage(connection.lastErrorCode) }));
  const localAccounts = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, financeMode: accounts.financeMode, externalAccountId: accounts.externalAccountId, bankBalanceCents: accounts.bankBalanceCents, bankBalanceAt: accounts.bankBalanceAt, creditLimitCents: accounts.creditLimitCents, availableCreditCents: accounts.availableCreditCents, creditSnapshotAt: accounts.creditSnapshotAt }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.archived, false)));
  const invoices = await db.select({ accountId: openFinanceInvoices.accountId, invoiceRef: openFinanceInvoices.invoiceRef, dueDate: openFinanceInvoices.dueDate, totalAmountCents: openFinanceInvoices.totalAmountCents, minimumPaymentCents: openFinanceInvoices.minimumPaymentCents }).from(openFinanceInvoices).where(eq(openFinanceInvoices.userId, userId));
  return { credentialSaved: Boolean(credential), connections, accounts: localAccounts, invoices };
}

export async function saveOpenFinanceSetup(input: unknown) {
  const userId = await requireUserId();
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
  const parsed = openFinanceConnectionIdSchema.safeParse({ connectionId: input });
  if (!parsed.success) return { error: "Conexão inválida." };
  const connectionId = parsed.data.connectionId;
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  const [credentials] = await db.select().from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1);
  if (!connection || !credentials) return { error: "Conexão não encontrada." };
  try {
    const key = await authenticatePluggy(decryptSecret(credentials.clientIdEnvelope, userId, "clientId"), decryptSecret(credentials.clientSecretEnvelope, userId, "clientSecret"));
    const rows = await getPluggyAccounts(key, decryptSecret(connection.itemIdEnvelope, userId, "itemId"));
    return { accounts: rows.map((a) => ({ id: a.id, name: a.name ?? a.subtype ?? a.type, type: a.type, currency: a.currencyCode })) };
  } catch (error) { return { error: safeError(error) }; }
}

export async function linkOpenFinanceAccount(input: { accountId: string; connectionId: string; externalAccountId: string | null; mode: "manual" | "integracao" }) {
  const userId = await requireUserId();
  const parsed = linkOpenFinanceAccountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos informados." };
  const data = parsed.data;
  const [account] = await db.select({ id: accounts.id, type: accounts.type, financeMode: accounts.financeMode }).from(accounts).where(and(eq(accounts.id, data.accountId), eq(accounts.userId, userId))).limit(1);
  if (!account) return { error: "Conta não encontrada." };
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, data.connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  if (!connection) return { error: "Conexão não encontrada." };
  if (data.mode === "integracao") {
    const [credentials] = await db.select().from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1);
    if (!credentials || !data.externalAccountId) return { error: "Escolha uma conta Pluggy válida." };
    try {
      const key = await authenticatePluggy(decryptSecret(credentials.clientIdEnvelope, userId, "clientId"), decryptSecret(credentials.clientSecretEnvelope, userId, "clientSecret"));
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
  const cooldownMs = mode === "auto" ? AUTO_SYNC_COOLDOWN_MS : SYNC_COOLDOWN_MS;
  const userId = await requireUserId();
  const parsed = openFinanceConnectionIdSchema.safeParse({ connectionId: input });
  if (!parsed.success) return { error: "Conexão inválida." };
  const connectionId = parsed.data.connectionId;
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  const [credentials] = await db.select().from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1);
  if (!connection || !credentials) return { error: "Conexão não encontrada." };
  const now = Date.now();
  const lastAttemptTime = connection?.lastAttemptAt instanceof Date ? connection.lastAttemptAt.getTime() : null;
  if (lastAttemptTime !== null && now - lastAttemptTime < cooldownMs) return { skipped: true, error: `Aguarde pelo menos ${mode === "auto" ? "5 minutos" : "60 segundos"} entre sincronizações.` };
  const lock = await db.update(openFinanceConnections).set({ status: "SYNCING", lastAttemptAt: new Date(now), lastErrorCode: null }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId), or(isNull(openFinanceConnections.lastAttemptAt), lt(openFinanceConnections.lastAttemptAt, new Date(now - cooldownMs))), or(ne(openFinanceConnections.status, "SYNCING"), lt(openFinanceConnections.lastAttemptAt, new Date(now - 20 * 60_000))))).returning({ id: openFinanceConnections.id });
  if (!lock.length) return { skipped: true, error: "Esta conexão já está sincronizando. Aguarde e tente novamente." };
  let upstreamStatus: string | null = null;
  type Summary = { accountName: string; accountType: string; read: number; ignoredByDate: number; ignoredByTombstone: number; ignoredByType: number; invalid: number; inserted: number; updated: number; status: "PENDING" | "OK" | "ERROR"; error?: string };
  const summaries: Summary[] = [];
  const categorizationCounts = { user: 0, rule: 0, dictionary: 0, provider: 0, none: 0, transfers: 0, cardPaymentSuggestions: 0 };
  const summariesByAccountId = new Map<string, Summary>();
  const counts = () => summaries.reduce((total, row) => ({
    accounts: total.accounts + 1, read: total.read + row.read, ignoredByDate: total.ignoredByDate + row.ignoredByDate,
    ignoredByTombstone: total.ignoredByTombstone + row.ignoredByTombstone, ignoredByType: total.ignoredByType + row.ignoredByType,
    invalid: total.invalid + row.invalid, inserted: total.inserted + row.inserted, updated: total.updated + row.updated,
  }), { accounts: 0, read: 0, ignoredByDate: 0, ignoredByTombstone: 0, ignoredByType: 0, invalid: 0, inserted: 0, updated: 0 });
  try {
    const linked = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, externalAccountId: accounts.externalAccountId, closingDay: accounts.closingDay, dueDay: accounts.dueDay }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false)));
    const [categoryRows, ruleRows, ownAccountRows] = await Promise.all([
      db.select({ id: categories.id, name: categories.name, kind: categories.kind, nature: categories.nature, keywords: categories.keywords }).from(categories).where(and(eq(categories.userId, userId), eq(categories.archived, false))),
      db.select({ normalizedPattern: categoryRules.normalizedPattern, categoryId: categoryRules.categoryId, source: categoryRules.source }).from(categoryRules).where(eq(categoryRules.userId, userId)),
      db.select({ name: accounts.name }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.archived, false))),
    ]);
    const categoryOptions: CategorizationCategory[] = categoryRows;
    const userRules = new Map(ruleRows.filter((rule) => rule.source === "USER").map((rule) => [rule.normalizedPattern, rule.categoryId]));
    const providerCache = new Map(ruleRows.filter((rule) => rule.source === "AI").flatMap((rule) => {
      const category = categoryRows.find((candidate) => candidate.id === rule.categoryId);
      return category ? [[rule.normalizedPattern, { categoryKey: category.name, confidence: 1 }] as const] : [];
    }));
    if (!linked.length) {
      const error = "Nenhuma conta local está vinculada a esta conexão. Vincule uma conta antes de sincronizar.";
      await db.update(openFinanceConnections).set({ status: "ERROR", lastErrorCode: "NO_LINKED_ACCOUNTS" }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId)));
      console.error("Open Finance sync summary", { ...counts(), status: "ERROR" });
      revalidatePath("/configuracoes/integracao");
      return { error, status: "ERROR", imported: 0, accounts: summaries };
    }
    for (const row of linked) {
      const summary: Summary = { accountName: row.name, accountType: row.type, read: 0, ignoredByDate: 0, ignoredByTombstone: 0, ignoredByType: 0, invalid: 0, inserted: 0, updated: 0, status: "PENDING" };
      summaries.push(summary);
      summariesByAccountId.set(row.id, summary);
    }
    const apiKey = await authenticatePluggy(decryptSecret(credentials.clientIdEnvelope, userId, "clientId"), decryptSecret(credentials.clientSecretEnvelope, userId, "clientSecret"));
    const itemId = decryptSecret(connection.itemIdEnvelope, userId, "itemId");
    const item = await getPluggyItemStatus(apiKey, itemId);
    upstreamStatus = item.status;
    if (item.status !== "UPDATED" || item.executionStatus !== "SUCCESS") throw new Error(`PLUGGY_ITEM_${item.status}_${item.executionStatus ?? "UNKNOWN"}`);
    const remoteAccounts = await getPluggyAccounts(apiKey, itemId);
    const cutoff = connection.importFromDate.toISOString().slice(0, 10);
    const prepared: Array<{ local: typeof linked[number]; remote: typeof remoteAccounts[number]; summary: Summary; snapshot: number | null; snapshotAt: Date; bills: Awaited<ReturnType<typeof getPluggyBills>>; transactions: Awaited<ReturnType<typeof getPluggyTransactions>> }> = [];
    for (const local of linked) {
      const summary = summariesByAccountId.get(local.id)!;
      const remote = remoteAccounts.find((item) => item.id === local.externalAccountId);
      if (!remote || !isCompatiblePluggyAccount(local.type, remote.type)) {
        summary.status = "ERROR";
        summary.error = "Conta externa não encontrada ou incompatível com o tipo da conta local.";
        continue;
      }
      if (remote.currencyCode !== "BRL") {
        summary.status = "ERROR";
        summary.error = "Moeda da conta não suportada.";
        continue;
      }
      const snapshot = amountToCents(remote.balance);
      const snapshotAt = remote.updatedAt ? new Date(remote.updatedAt) : new Date();
      const bills = remote.type === "CREDIT" ? await getPluggyBills(apiKey, remote.id) : [];
      const remoteTx = await getPluggyTransactions(apiKey, remote.id, cutoff);
      summary.read = remoteTx.transactions.length + remoteTx.invalid;
      summary.invalid += remoteTx.invalid;
      prepared.push({ local, remote, summary, snapshot, snapshotAt, bills, transactions: remoteTx });
    }
    await db.transaction(async (tx) => {
      for (const batch of prepared) {
        const [current] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, batch.local.id), eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false))).for("update").limit(1);
        if (!current) { batch.summary.status = "ERROR"; batch.summary.error = "Conta desvinculada durante a sincronização."; continue; }
        const billMonth = new Map(batch.bills.map((bill) => [bill.id, new Date(bill.dueDate).toISOString().slice(0, 7)]));
        const tombstoneRows = await tx.select({ externalId: openFinanceDeleted.externalId }).from(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), eq(openFinanceDeleted.accountId, batch.local.id)));
        const tombstonedExternalIds = new Set(tombstoneRows.map((row) => row.externalId));
        const existingRows = await tx.select({ externalId: transactions.externalId }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.accountId, batch.local.id), eq(transactions.origin, "PLUGGY")));
        const existingExternalIds = new Set(existingRows.map((row) => row.externalId).filter((id): id is string => Boolean(id)));
        await tx.update(accounts).set(batch.remote.type === "BANK" ? { bankBalanceCents: batch.snapshot, bankBalanceAt: batch.snapshotAt } : { bankBalanceCents: batch.snapshot, bankBalanceAt: batch.snapshotAt, creditLimitCents: amountToCents(batch.remote.creditData?.creditLimit), availableCreditCents: amountToCents(batch.remote.creditData?.availableCreditLimit), creditSnapshotAt: batch.snapshotAt }).where(and(eq(accounts.id, batch.local.id), eq(accounts.userId, userId), eq(accounts.financeMode, "integracao")));
        const validRows: Array<{ row: typeof batch.transactions.transactions[number]; amountCents: number; kind: ReturnType<typeof transactionKind>; date: Date; invoiceRef: string | null; wasExisting: boolean }> = [];
        for (const row of batch.transactions.transactions) {
          if (row.accountId !== batch.remote.id) { batch.summary.invalid++; continue; }
          if (isBeforeCutoff(row.date, cutoff)) { batch.summary.ignoredByDate++; continue; }
          if (isExternalIdentityTombstoned(row.id, tombstonedExternalIds)) { batch.summary.ignoredByTombstone++; continue; }
          if (!shouldImportPluggyTransaction(batch.remote.type, row)) { batch.summary.ignoredByType++; continue; }
          if (row.currencyCode !== "BRL") { batch.summary.invalid++; continue; }
          let value: number | null;
          try { value = amountToCents(row.amount); } catch { batch.summary.invalid++; continue; }
          if (value === null || value === 0) { batch.summary.invalid++; continue; }
          if (existingExternalIds.has(row.id)) {
            if (validRows.some((candidate) => candidate.row.id === row.id)) { batch.summary.invalid++; continue; }
          }
          const wasExisting = existingExternalIds.has(row.id);
          const kind = transactionKind(batch.remote.type, row.type);
      const date = anchorPluggyCivilDate(row.date);
          const invoiceRef = batch.local.type === "CREDIT_CARD" ? (row.billId ? billMonth.get(row.billId) ?? null : row.billForecastDate?.slice(0, 7) ?? null) ?? resolveTransactionInvoiceRef({ accountType: batch.local.type, closingDay: batch.local.closingDay, dueDay: batch.local.dueDay, date }) : null;
          validRows.push({ row, amountCents: Math.abs(value), kind, date, invoiceRef, wasExisting });
          existingExternalIds.add(row.id);
          if (wasExisting) batch.summary.updated++;
          else batch.summary.inserted++;
        }
        const categorized = await categorizeBatch(validRows.map(({ row, kind }) => ({ description: row.description, kind, operationType: row.operationType, payeeMCC: row.creditCardMetadata?.payeeMCC })), { categories: categoryOptions, userRules, providerCache, ownAccountNames: ownAccountRows.map((account) => account.name), provider: disabledCategorizerProvider });
        for (const key of Object.keys(categorizationCounts) as (keyof typeof categorizationCounts)[]) categorizationCounts[key] += categorized.counts[key];
        for (const cacheUpdate of categorized.aiCacheUpdates) await tx.insert(categoryRules).values({ userId, normalizedPattern: cacheUpdate.normalizedKey, categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() }).onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.normalizedPattern], set: { categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() } });
        if (validRows.length) {
          const upsertRows = validRows.map((candidate, index) => {
            const category = categorized.results[index]!;
            return { id: createId(), userId, accountId: batch.local.id, date: candidate.date, description: candidate.row.description, amountCents: candidate.amountCents, kind: candidate.kind, nature: category.nature ?? "VARIABLE", categoryId: category.categoryId, isTransfer: category.isTransfer, origin: "PLUGGY" as const, externalId: candidate.row.id, externalStatus: candidate.row.status, invoiceRef: candidate.invoiceRef };
          });
          await tx.insert(transactions).values(upsertRows).onConflictDoUpdate({ target: [transactions.userId, transactions.accountId, transactions.externalId], targetWhere: sql`${transactions.externalId} is not null`, set: { date: sql`excluded.date`, description: sql`excluded.description`, amountCents: sql`excluded.amount_cents`, kind: sql`excluded.kind`, categoryId: sql`COALESCE(${transactions.categoryId}, excluded.category_id)`, nature: sql`CASE WHEN ${transactions.categoryId} IS NULL THEN excluded.nature ELSE ${transactions.nature} END`, isTransfer: sql`CASE WHEN ${transactions.categoryId} IS NULL THEN excluded.is_transfer ELSE ${transactions.isTransfer} END`, externalStatus: sql`excluded.external_status`, invoiceRef: sql`excluded.invoice_ref`, updatedAt: new Date() } });
        }
        if (batch.remote.type === "CREDIT") {
          for (const bill of batch.bills) {
            const cents = amountToCents(bill.totalAmount);
            const minimum = amountToCents(bill.minimumPaymentAmount);
            if (bill.totalAmountCurrencyCode !== "BRL") continue;
            const dueDate = new Date(bill.dueDate);
            const invoiceRef = dueDate.toISOString().slice(0, 7);
            await tx.insert(openFinanceInvoices).values({ id: createId(), userId, accountId: batch.local.id, externalId: bill.id, invoiceRef, dueDate, totalAmountCents: cents, minimumPaymentCents: minimum, syncedAt: new Date() }).onConflictDoUpdate({ target: [openFinanceInvoices.userId, openFinanceInvoices.accountId, openFinanceInvoices.externalId], set: { invoiceRef, dueDate, totalAmountCents: cents, minimumPaymentCents: minimum, syncedAt: new Date() } });
          }
        }
        batch.summary.status = "OK";
      }
    });
    const imported = summaries.reduce((total, row) => total + row.inserted + row.updated, 0);
    const accountErrors = summaries.filter((summary) => summary.status === "ERROR").length;
    const finalStatus = accountErrors ? "ERROR" : "UPDATED";
    await db.update(openFinanceConnections).set({ status: finalStatus, ...(finalStatus === "UPDATED" ? { lastSyncedAt: new Date() } : {}), lastErrorCode: accountErrors ? "SYNC_ACCOUNT_ERRORS" : null }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId)));
    console.info("Open Finance sync summary", { ...counts(), categorization: categorizationCounts });
    revalidatePath("/configuracoes/integracao"); revalidatePath("/contas"); revalidatePath("/painel"); revalidatePath("/lancamentos");
    return { ok: true, status: finalStatus, imported, accounts: summaries, categorization: categorizationCounts, ...(accountErrors ? { error: "Algumas contas não puderam ser sincronizadas. Consulte o resumo por conta." } : {}) };
  } catch (error) {
    const detail = persistedError(error);
    const message = safeError(error);
    for (const summary of summaries) if (summary.status === "PENDING") { summary.status = "ERROR"; summary.error = message; }
    await db.update(openFinanceConnections).set({ status: upstreamStatus && upstreamStatus !== "UPDATED" ? upstreamStatus : "ERROR", lastErrorCode: detail }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId)));
    console.error("Open Finance sync failed", counts());
    revalidatePath("/configuracoes/integracao");
    return { error: message, status: "ERROR", imported: 0, accounts: summaries };
  }
}
