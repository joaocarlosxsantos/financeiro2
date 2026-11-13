import { and, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, categoryRules, openFinanceConnections, openFinanceCredentials, openFinanceDeleted, openFinanceInvoices, transactions } from "@/db/schema";
import { getProfileRestriction } from "@/server/usage-profile";
import { amountToCents, isCompatiblePluggyAccount, openFinanceConnectionIdSchema, shouldImportPluggyTransaction, transactionKind } from "./schemas";
import { decryptSecret } from "./crypto";
import { authenticatePluggy, getPluggyAccounts, getPluggyBills, getPluggyInvestmentSnapshot, investmentRemoteId, getPluggyItemStatus, getPluggyTransactions, PluggyHttpError, pluggyErrorForUser, requestPluggyItemUpdate } from "./client";
import { createId } from "@/lib/id";
import { resolveTransactionInvoiceRef } from "@/lib/invoices";
import { anchorPluggyCivilDate, isBeforeCutoff } from "./cutoff";
import { categorizeBatch, disabledCategorizerProvider, type CategorizationCategory } from "@/server/categorization";
import { isExternalIdentityTombstoned } from "./deletion-policy";

export const SYNC_COOLDOWN_MS = 60 * 1000;
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const ITEM_UPDATE_POLL_MS = 1_000;
/** Botão manual espera mais; leituras automáticas ficam dentro do teto de 12s. */
export const DEFAULT_ITEM_UPDATE_WAIT_MS = 20_000;
export const AUTO_ITEM_UPDATE_WAIT_MS = 5_000;

export type ItemUpdateOutcome = "updated" | "pending" | "unavailable" | "skipped";

const TRANSITIVE_EXECUTION_STATES = new Set([
  "CREATED", "LOGIN_IN_PROGRESS", "LOGIN_MFA_IN_PROGRESS", "ACCOUNTS_IN_PROGRESS",
  "CREDITCARDS_IN_PROGRESS", "TRANSACTIONS_IN_PROGRESS", "INVESTMENT_TRANSACTIONS_IN_PROGRESS",
  "PAYMENT_DATA_IN_PROGRESS", "IDENTITY_IN_PROGRESS", "MERGING",
]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** null = ainda em andamento. */
function classifyItemStatus(status: string, executionStatus: string | null): ItemUpdateOutcome | null {
  const execution = executionStatus ?? "";
  if (status === "WAITING_USER_INPUT" || execution === "WAITING_USER_INPUT" || execution === "USER_AUTHORIZATION_PENDING") return "unavailable";
  if (status === "UPDATING" || TRANSITIVE_EXECUTION_STATES.has(execution)) return null;
  return status === "UPDATED" && (execution === "SUCCESS" || execution === "PARTIAL_SUCCESS") ? "updated" : "unavailable";
}

/** Pede atualização do item (claim/cooldown já garantem quota) e aguarda por tempo limitado; recusa é fail-open. */
async function requestItemUpdate(apiKey: string, itemId: string, waitMs: number, signal?: AbortSignal): Promise<ItemUpdateOutcome> {
  let acceptedStatus = "UPDATING";
  let acceptedExecution: string | null = null;
  try {
    const accepted = await requestPluggyItemUpdate(apiKey, itemId, signal);
    acceptedStatus = accepted.status;
    acceptedExecution = accepted.executionStatus;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.info("Open Finance item update unavailable", {
      status: error instanceof PluggyHttpError ? error.status : 0,
      code: error instanceof PluggyHttpError ? error.code : "UNKNOWN",
    });
    return "unavailable";
  }
  const settled = classifyItemStatus(acceptedStatus, acceptedExecution);
  if (settled) return settled;
  const deadline = Date.now() + Math.max(0, waitMs);
  for (;;) {
    signal?.throwIfAborted();
    const status = await getPluggyItemStatus(apiKey, itemId, signal);
    const outcome = classifyItemStatus(status.status, status.executionStatus);
    if (outcome) return outcome;
    if (Date.now() >= deadline) return "pending";
    await sleep(Math.min(ITEM_UPDATE_POLL_MS, Math.max(0, deadline - Date.now())));
  }
}

export const safeError = (error: unknown) => error instanceof PluggyHttpError
  ? pluggyErrorForUser(error)
  : "Não foi possível concluir. Confira a conexão e tente novamente.";

function persistedError(error: unknown): string {
  if (error instanceof PluggyHttpError) return JSON.stringify({ status: error.status, code: error.code, message: error.providerMessage.slice(0, 200) });
  return safeError(error).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
}

export async function resolvePluggyApiKey(userId: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const [credentials] = await db
    .select({
      clientIdEnvelope: openFinanceCredentials.clientIdEnvelope,
      clientSecretEnvelope: openFinanceCredentials.clientSecretEnvelope,
    })
    .from(openFinanceCredentials)
    .where(eq(openFinanceCredentials.userId, userId))
    .limit(1);

  if (!credentials) {
    throw new Error("Credenciais Pluggy não configuradas para este usuário.");
  }

  const clientId = decryptSecret(credentials.clientIdEnvelope, userId, "clientId");
  const clientSecret = decryptSecret(credentials.clientSecretEnvelope, userId, "clientSecret");
  return authenticatePluggy(clientId, clientSecret, signal);
}

/** Núcleo único: identidade já autenticada pelo chamador; cooldown e claim compartilhados. */
export async function syncOpenFinanceForUser(userId: string, input: unknown, mode: "manual" | "auto" = "manual", options: { signal?: AbortSignal; revalidate?: (path: string) => void; waitForUpdateMs?: number } = {}) {
  const { signal } = options;
  const revalidatePath = options.revalidate ?? (() => {});
  const waitForUpdateMs = options.waitForUpdateMs ?? (mode === "auto" ? AUTO_ITEM_UPDATE_WAIT_MS : DEFAULT_ITEM_UPDATE_WAIT_MS);
  signal?.throwIfAborted();
  const cooldownMs = mode === "auto" ? AUTO_SYNC_COOLDOWN_MS : SYNC_COOLDOWN_MS;
  const restriction = await getProfileRestriction(userId, "integration");
  if (restriction) return { error: restriction };
  const parsed = openFinanceConnectionIdSchema.safeParse({ connectionId: input });
  if (!parsed.success) return { error: "Conexão inválida." };
  const connectionId = parsed.data.connectionId;
  const [connection] = await db.select().from(openFinanceConnections).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
  if (!connection) return { error: "Conexão não encontrada." };
  signal?.throwIfAborted();
  const now = Date.now();
  const lastAttemptTime = connection?.lastAttemptAt instanceof Date ? connection.lastAttemptAt.getTime() : null;
  if (lastAttemptTime !== null && now - lastAttemptTime < cooldownMs) return { skipped: true, error: `Aguarde pelo menos ${mode === "auto" ? "5 minutos" : "60 segundos"} entre sincronizações.` };
  const lock = await db.update(openFinanceConnections).set({ status: "SYNCING", lastAttemptAt: new Date(now), lastErrorCode: null }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId), or(isNull(openFinanceConnections.lastAttemptAt), lte(openFinanceConnections.lastAttemptAt, new Date(now - cooldownMs))), or(ne(openFinanceConnections.status, "SYNCING"), lt(openFinanceConnections.lastAttemptAt, new Date(now - 20 * 60_000))))).returning({ id: openFinanceConnections.id });
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
    signal?.throwIfAborted();
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
    const apiKey = await resolvePluggyApiKey(userId, signal);
    const itemId = decryptSecret(connection.itemIdEnvelope, userId, "itemId");
    const itemUpdate = await requestItemUpdate(apiKey, itemId, waitForUpdateMs, signal);
    const item = await getPluggyItemStatus(apiKey, itemId, signal);
    upstreamStatus = item.status;
    if ((item.status !== "UPDATED" || item.executionStatus !== "SUCCESS") && itemUpdate !== "pending") throw new Error(`PLUGGY_ITEM_${item.status}_${item.executionStatus ?? "UNKNOWN"}`);
    const remoteAccounts = await getPluggyAccounts(apiKey, itemId, signal);
    const invId = investmentRemoteId(connection.id);
    const investment = linked.some((row) => row.type === "INVESTMENT" && row.externalAccountId === invId)
      ? await getPluggyInvestmentSnapshot(apiKey, itemId, invId, signal) : null;
    // Conta virtual "BANK": reaproveita o fluxo de saldo + lançamentos.
    if (investment) remoteAccounts.push({ id: invId, itemId, type: "BANK", name: "Investimentos", currencyCode: "BRL", balance: investment.balance });
    const cutoff = connection.importFromDate.toISOString().slice(0, 10);
    const prepared: Array<{ local: typeof linked[number]; remote: typeof remoteAccounts[number]; summary: Summary; snapshot: number | null; snapshotAt: Date; bills: Awaited<ReturnType<typeof getPluggyBills>>; transactions: Awaited<ReturnType<typeof getPluggyTransactions>> }> = [];
    for (const local of linked) {
      signal?.throwIfAborted();
      const summary = summariesByAccountId.get(local.id)!;
      const remote = remoteAccounts.find((item) => item.id === local.externalAccountId);
      if (!remote || !isCompatiblePluggyAccount(local.type, remote.type) || (local.type === "INVESTMENT") !== (remote.id === invId)) {
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
      const bills = remote.type === "CREDIT" ? await getPluggyBills(apiKey, remote.id, signal) : [];
      const remoteTx = investment && remote.id === invId ? investment.transactions : await getPluggyTransactions(apiKey, remote.id, cutoff, signal);
      summary.read = remoteTx.transactions.length + remoteTx.invalid;
      summary.invalid += remoteTx.invalid;
      prepared.push({ local, remote, summary, snapshot, snapshotAt, bills, transactions: remoteTx });
    }
    signal?.throwIfAborted();
    await db.transaction(async (tx) => {
      signal?.throwIfAborted();
      for (const batch of prepared) {
        signal?.throwIfAborted();
        const [current] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, batch.local.id), eq(accounts.userId, userId), eq(accounts.externalConnectionId, connection.id), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false))).for("update").limit(1);
        if (!current) { batch.summary.status = "ERROR"; batch.summary.error = "Conta desvinculada durante a sincronização."; continue; }
        const billMonth = new Map(batch.bills.map((bill) => [bill.id, new Date(bill.dueDate).toISOString().slice(0, 7)]));
        const tombstoneRows = await tx.select({ externalId: openFinanceDeleted.externalId }).from(openFinanceDeleted).where(and(eq(openFinanceDeleted.userId, userId), eq(openFinanceDeleted.accountId, batch.local.id)));
        const tombstonedExternalIds = new Set(tombstoneRows.map((row) => row.externalId));
        const existingRows = await tx.select({ externalId: transactions.externalId }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.accountId, batch.local.id), eq(transactions.origin, "PLUGGY")));
        const existingExternalIds = new Set(existingRows.map((row) => row.externalId).filter((id): id is string => Boolean(id)));
        await tx.update(accounts).set(batch.remote.type === "BANK" ? { bankBalanceCents: batch.snapshot, bankBalanceAt: batch.snapshotAt } : { bankBalanceCents: batch.snapshot, bankBalanceAt: batch.snapshotAt, creditLimitCents: amountToCents(batch.remote.creditData?.creditLimit), availableCreditCents: amountToCents(batch.remote.creditData?.availableCreditLimit), creditSnapshotAt: batch.snapshotAt }).where(and(eq(accounts.id, batch.local.id), eq(accounts.userId, userId), eq(accounts.financeMode, "integracao")));
        const validRows: Array<{ row: typeof batch.transactions.transactions[number]; amountCents: number; kind: ReturnType<typeof transactionKind>; date: Date; invoiceRef: string | null; installmentNumber: number | null; installmentTotal: number | null }> = [];
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
          const isCard = batch.local.type === "CREDIT_CARD";
          const metadata = isCard ? row.creditCardMetadata : null;
          const installmentNumber = metadata?.installmentNumber ?? null;
          const total = metadata?.totalInstallments ?? null;
          const installmentTotal = installmentNumber !== null && total !== null && total >= installmentNumber ? total : null;
          const cardDate = installmentNumber === 1 ? metadata?.purchaseDate
            : installmentNumber !== null ? metadata?.billPostDate : null;
          const date = anchorPluggyCivilDate(cardDate?.slice(0, 10) ?? row.date);
          const billId = row.billId ?? metadata?.billId;
          const invoiceRef = isCard ? (billId ? billMonth.get(billId) : row.billForecastDate?.slice(0, 7))
            ?? resolveTransactionInvoiceRef({ accountType: batch.local.type, closingDay: batch.local.closingDay, dueDay: batch.local.dueDay, date }) : null;
          validRows.push({ row, amountCents: Math.abs(value), kind, date, invoiceRef, installmentNumber, installmentTotal });
          existingExternalIds.add(row.id);
          if (wasExisting) batch.summary.updated++;
          else batch.summary.inserted++;
        }
        const categorized = await categorizeBatch(validRows.map(({ row, kind }) => ({ description: row.description, kind, operationType: row.operationType, payeeMCC: row.creditCardMetadata?.payeeMCC })), { categories: categoryOptions, userRules, providerCache, ownAccountNames: ownAccountRows.map((account) => account.name), provider: disabledCategorizerProvider });
        signal?.throwIfAborted();
        for (const key of Object.keys(categorizationCounts) as (keyof typeof categorizationCounts)[]) categorizationCounts[key] += categorized.counts[key];
        for (const cacheUpdate of categorized.aiCacheUpdates) await tx.insert(categoryRules).values({ userId, normalizedPattern: cacheUpdate.normalizedKey, categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() }).onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.normalizedPattern], set: { categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() } });
        if (validRows.length) {
          const upsertRows = validRows.map((candidate, index) => {
            const category = categorized.results[index]!;
            return { id: createId(), userId, accountId: batch.local.id, date: candidate.date, description: candidate.row.description, amountCents: candidate.amountCents, kind: candidate.kind, nature: category.nature ?? "VARIABLE", categoryId: category.categoryId, isTransfer: candidate.row.operationType === "INVESTMENT_TRANSFER" || category.isTransfer, origin: "PLUGGY" as const, externalId: candidate.row.id, externalStatus: candidate.row.status, invoiceRef: candidate.invoiceRef, installmentNumber: candidate.installmentNumber, installmentTotal: candidate.installmentTotal };
          });
          await tx.insert(transactions).values(upsertRows).onConflictDoUpdate({
            target: [transactions.userId, transactions.accountId, transactions.externalId],
            targetWhere: sql`${transactions.externalId} is not null`,
            set: {
              date: sql`excluded.date`, description: sql`excluded.description`,
              amountCents: sql`excluded.amount_cents`, kind: sql`excluded.kind`,
              categoryId: sql`COALESCE(${transactions.categoryId}, excluded.category_id)`,
              nature: sql`CASE WHEN ${transactions.categoryId} IS NULL THEN excluded.nature ELSE ${transactions.nature} END`,
              isTransfer: sql`CASE WHEN ${batch.local.type === "INVESTMENT"} AND excluded.is_transfer THEN true WHEN ${transactions.categoryId} IS NULL THEN excluded.is_transfer ELSE ${transactions.isTransfer} END`,
              externalStatus: sql`excluded.external_status`, invoiceRef: sql`excluded.invoice_ref`,
              installmentNumber: sql`COALESCE(excluded.installment_number, ${transactions.installmentNumber})`,
              installmentTotal: sql`COALESCE(excluded.installment_total, ${transactions.installmentTotal})`,
              updatedAt: new Date(),
            },
          });
        }
        if (batch.remote.type === "CREDIT") {
          for (const bill of batch.bills) {
            signal?.throwIfAborted();
            const cents = amountToCents(bill.totalAmount);
            const minimum = amountToCents(bill.minimumPaymentAmount);
            if (bill.totalAmountCurrencyCode !== "BRL") continue;
            const dueDate = new Date(bill.dueDate);
            const invoiceRef = dueDate.toISOString().slice(0, 7);
            await tx.insert(openFinanceInvoices).values({ id: createId(), userId, accountId: batch.local.id, externalId: bill.id, invoiceRef, dueDate, totalAmountCents: cents, minimumPaymentCents: minimum, syncedAt: new Date() }).onConflictDoUpdate({ target: [openFinanceInvoices.userId, openFinanceInvoices.accountId, openFinanceInvoices.externalId], set: { invoiceRef, dueDate, totalAmountCents: cents, minimumPaymentCents: minimum, syncedAt: new Date() } });
          }
        }
        signal?.throwIfAborted();
        batch.summary.status = "OK";
      }
      signal?.throwIfAborted();
    });
    signal?.throwIfAborted();
    const imported = summaries.reduce((total, row) => total + row.inserted + row.updated, 0);
    const accountErrors = summaries.filter((summary) => summary.status === "ERROR").length;
    const finalStatus = accountErrors ? "ERROR" : "UPDATED";
    const lastSyncedAt = finalStatus === "UPDATED" ? new Date() : connection.lastSyncedAt;
    const dataAt = prepared.length ? new Date(Math.min(...prepared.map((batch) => batch.snapshotAt.getTime()))) : null;
    const notice = itemUpdate === "pending" ? "A Pluggy ainda está processando a atualização do banco; usei o último snapshot disponível."
      : itemUpdate === "unavailable" ? "Não consegui pedir atualização ao banco agora; usei o último snapshot disponível."
      : null;
    await db.update(openFinanceConnections).set({ status: finalStatus, ...(finalStatus === "UPDATED" ? { lastSyncedAt } : {}), lastErrorCode: accountErrors ? "SYNC_ACCOUNT_ERRORS" : null }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId), eq(openFinanceConnections.lastAttemptAt, new Date(now))));
    console.info("Open Finance sync summary", { ...counts(), categorization: categorizationCounts, itemUpdate });
    revalidatePath("/configuracoes/integracao"); revalidatePath("/contas"); revalidatePath("/painel"); revalidatePath("/lancamentos");
    return { ok: true, status: finalStatus, lastSyncedAt, dataAt, itemUpdate, imported, accounts: summaries, categorization: categorizationCounts, ...(accountErrors ? { error: "Algumas contas não puderam ser sincronizadas. Consulte o resumo por conta." } : {}), ...(notice ? { notice } : {}) };
  } catch (error) {
    if (signal?.aborted) {
      // Timeout/teto do chamador: devolve o status anterior em vez de marcar a conexão como ERROR.
      const previousStatus = connection.status && connection.status !== "SYNCING" ? connection.status : "UPDATED";
      await db.update(openFinanceConnections).set({ status: previousStatus, lastErrorCode: null }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId), eq(openFinanceConnections.lastAttemptAt, new Date(now))));
      console.info("Open Finance sync aborted", counts());
      return { aborted: true, status: "ABORTED", imported: 0, accounts: summaries };
    }
    const detail = persistedError(error);
    const message = safeError(error);
    for (const summary of summaries) if (summary.status === "PENDING") { summary.status = "ERROR"; summary.error = message; }
    await db.update(openFinanceConnections).set({ status: upstreamStatus && upstreamStatus !== "UPDATED" ? upstreamStatus : "ERROR", lastErrorCode: detail }).where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId), eq(openFinanceConnections.lastAttemptAt, new Date(now))));
    console.error("Open Finance sync failed", counts());
    revalidatePath("/configuracoes/integracao");
    return { error: message, status: "ERROR", imported: 0, accounts: summaries };
  }
}
