import { beforeEach, describe, expect, it, vi } from "vitest";

// Profile policy is covered separately; these fixtures exercise deletion and sync ownership.
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: async () => null }));

const VALID_CONN_ID = "c0000000000000000000000001";
const VALID_ACC_ID = "a0000000000000000000000001";
const VALID_TX_ID = "t0000000000000000000000001";
const VALID_INV_ID = "i0000000000000000000000001";

type MockConnection = { id: string; userId: string; status?: string; label?: string; lastErrorCode?: string; lastAttemptAt?: Date; importFromDate?: Date; itemIdEnvelope?: string };
type MockAccount = { id: string; userId: string; name?: string; type?: "CHECKING" | "CREDIT_CARD" | "INVESTMENT"; externalConnectionId?: string; externalAccountId?: string; financeMode?: string; archived?: boolean; closingDay?: number; dueDay?: number };
type MockPluggyAccount = { id: string; itemId: string; type: "BANK" | "CREDIT"; subtype?: string; name?: string; currencyCode: string; balance?: number; updatedAt?: string; creditData?: { creditLimit?: number; availableCreditLimit?: number } };
type MockBill = { id: string; dueDate: string; totalAmount: number; totalAmountCurrencyCode: string; minimumPaymentAmount: number };
type MockPluggyTransaction = { id: string; accountId: string; description: string; date: string; amount: number; currencyCode: string; type: "DEBIT" | "CREDIT"; status: "POSTED" | "PENDING"; operationType?: string; billId?: string; billForecastDate?: string; creditCardMetadata?: { payeeMCC?: number | null; installmentNumber?: number; totalInstallments?: number; purchaseDate?: string; billPostDate?: string; billId?: string } };
type MockQuery = {
  where: (...args: unknown[]) => MockQuery;
  for: (...args: unknown[]) => MockQuery;
  limit: () => Promise<unknown[]>;
  then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise<unknown>;
};
type MockDelete = {
  where: (...args: unknown[]) => MockDelete;
  returning: () => Promise<unknown[]>;
  then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise<unknown>;
};
type MockRootUpdate = {
  set(values: unknown): MockRootUpdate;
  where(...args: unknown[]): MockRootUpdate;
  returning(): Promise<Array<{ id: string }>>;
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown): Promise<unknown>;
};
type MockInsert = { values(value: unknown): { onConflictDoNothing(): Promise<void>; onConflictDoUpdate(config: { target?: unknown[] }): Promise<void> } };
type MockTransaction = {
  select(): { from(table: unknown): MockQuery };
  insert(table: unknown): MockInsert;
  delete(table: unknown): MockDelete;
  update(): { set(values: unknown): { where(): Promise<void> } };
};

const mocks = vi.hoisted(() => {
  const state = {
    userId: "user-a",
    connections: [] as MockConnection[],
    accounts: [] as MockAccount[],
    transactions: [] as Array<{ id?: string; userId?: string; accountId?: string; externalId?: string | null; origin?: string }>,
    invoices: [] as Array<{ id: string; userId: string; accountId: string; externalId: string }>,
    tombstones: [] as Array<{ userId: string; accountId: string; externalId: string }>,
    credentials: [] as Array<{ userId: string; clientIdEnvelope?: string; clientSecretEnvelope?: string }>,
    remoteAccounts: [] as MockPluggyAccount[],
    remoteBills: [] as MockBill[],
    remoteTransactions: [] as MockPluggyTransaction[],
    shouldThrow: false,
  };

  const checkRateLimit = vi.fn((...args: [string, number, number, number]) => { void args; return { allowed: true }; });

  const deletedItems = {
    transactions: [] as string[],
    invoices: [] as string[],
    tombstones: [] as string[],
    connections: [] as string[],
    credentials: [] as string[],
  };

  const insertedTombstones: Array<{ userId: string; accountId: string; externalId: string }> = [];
  const updatedAccounts: Array<{ values?: unknown }> = [];
  const rootUpdates: Array<{ table: unknown; values?: unknown }> = [];
  const upsertedTransactions: Array<Record<string, unknown>> = [];
  const transactionBatchSizes: number[] = [];
  const transactionConflictTargets: unknown[][] = [];
  const upsertedInvoices: Array<Record<string, unknown>> = [];

  return {
    state,
    checkRateLimit,
    deletedItems,
    insertedTombstones,
    updatedAccounts,
    rootUpdates,
    upsertedTransactions,
    transactionBatchSizes,
    transactionConflictTargets,
    upsertedInvoices,
    fromHandler: (table: unknown): MockQuery => { void table; return {} as MockQuery; },
    deleteHandler: (table: unknown): MockDelete => { void table; return {} as MockDelete; },
  };
});

vi.mock("@/lib/auth", () => ({ requireUserId: async () => mocks.state.userId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: Parameters<typeof mocks.checkRateLimit>) => mocks.checkRateLimit(...args) }));
vi.mock("@/server/open-finance/crypto", () => ({ decryptSecret: () => "decrypted", encryptSecret: () => "encrypted", secretFingerprint: () => "fingerprint" }));
vi.mock("@/server/open-finance/client", () => ({
  authenticatePluggy: async () => "api-key",
  getPluggyItem: async () => ({ status: "UPDATED", executionStatus: "SUCCESS", connector: null }),
  getPluggyItemStatus: async () => ({ status: "UPDATED", executionStatus: "SUCCESS" }),
  pluggyItemAllowsManualUpdate: () => true,
  requestPluggyItemUpdate: async () => ({ accepted: true, status: "UPDATING", executionStatus: null }),
  getPluggyAccounts: async () => mocks.state.remoteAccounts,
  investmentRemoteId: (connectionId: string) => `investments:${connectionId}`,
  getPluggyInvestmentSnapshot: async (_key: string, _itemId: string, remoteId: string) => ({ balance: 350, transactions: { transactions: mocks.state.remoteTransactions.filter((row) => row.accountId === remoteId), invalid: 0 } }),
  getPluggyBills: async () => mocks.state.remoteBills,
  getPluggyTransactions: async (_key: string, accountId: string) => ({ transactions: mocks.state.remoteTransactions.filter((row: MockPluggyTransaction) => row.accountId === accountId), invalid: 0 }),
  PluggyHttpError: class PluggyHttpError extends Error {
    constructor(readonly status: number, readonly code: string, readonly providerMessage: string, readonly endpoint: string) { super(`PLUGGY_HTTP_${status}_${code}`); }
  },
  pluggyErrorForUser: (error: { status: number; code: string }) => error.status === 403 && error.code === "LIST_ITEMS_FEATURE_NOT_ENABLED" ? "Esse item so existe em Demo. Confira a aplicacao." : "Pluggy error.",
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => mocks.fromHandler(table),
    }),
    update: (table: unknown) => {
      const operation = {} as MockRootUpdate;
      Object.assign(operation, {
        set: (values: unknown) => { mocks.rootUpdates.push({ table, values }); return operation; },
        where: () => operation,
        returning: async () => [{ id: "c0000000000000000000000001" }],
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve([]).then(resolve, reject),
      });
      return operation;
    },
    transaction: async (callback: (tx: MockTransaction) => Promise<unknown>) => {
      if (mocks.state.shouldThrow) {
        throw new Error('Failed query: select "user_id" from "open_finance_deleted"');
      }
      const tx = {
        select: () => ({
          from: (table: unknown) => mocks.fromHandler(table),
        }),
        insert: (table: unknown) => ({
          values: (val: unknown) => ({
            onConflictDoNothing: async () => {
              if (mocks.state.shouldThrow) throw new Error("Insert failed");
              mocks.insertedTombstones.push(val as { userId: string; accountId: string; externalId: string });
            },
            onConflictDoUpdate: async (config: { target?: unknown[] }) => {
              if (table === transactions) {
                const rows = (Array.isArray(val) ? val : [val]) as Array<Record<string, unknown>>;
                mocks.transactionBatchSizes.push(rows.length);
                mocks.upsertedTransactions.push(...rows);
                mocks.transactionConflictTargets.push(config.target ?? []);
              }
              if (table === openFinanceInvoices) mocks.upsertedInvoices.push(val as Record<string, unknown>);
            },
          }),
        }),
        delete: (table: unknown) => mocks.deleteHandler(table),
        update: () => ({
          set: (vals: unknown) => ({
            where: async () => {
              if (mocks.state.shouldThrow) throw new Error("Update failed");
              mocks.updatedAccounts.push({ values: vals });
            },
          }),
        }),
      };
      return callback(tx);
    },
  },
}));

import {
  accounts,
  openFinanceConnections,
  openFinanceCredentials,
  openFinanceDeleted,
  openFinanceInvoices,
  transactions,
} from "@/db/schema";
import {
  discoverOpenFinanceAccounts,
  deleteAllOpenFinanceData,
  deletePluggyTransaction,
  getOpenFinanceDeletionCounts,
  getOpenFinanceSetup,
  removeOpenFinanceConnection,
  removeOpenFinanceCredentials,
  saveOpenFinanceSetup,
  syncOpenFinance,
} from "@/server/actions/open-finance";
import { isBeforeCutoff } from "@/server/open-finance/cutoff";

function setupHandlers() {
  mocks.fromHandler = (table: unknown) => {
    const getRows = () => {
      if (mocks.state.shouldThrow) {
        throw new Error('Failed query: select "user_id" from "open_finance_deleted"');
      }
      if (table === openFinanceConnections) return mocks.state.connections;
      if (table === accounts) return mocks.state.accounts;
      if (table === transactions) return mocks.state.transactions;
      if (table === openFinanceInvoices) return mocks.state.invoices;
      if (table === openFinanceDeleted) return mocks.state.tombstones;
      if (table === openFinanceCredentials) return mocks.state.credentials;
      return [];
    };
    const builder = {} as MockQuery;
    Object.assign(builder, {
      where: vi.fn(() => builder),
      for: vi.fn(() => builder),
      limit: vi.fn(async () => {
        const rows = getRows();
        return rows.slice(0, 1);
      }),
      then: (resolve: (val: unknown) => unknown, reject: (err: unknown) => unknown) => {
        try {
          return Promise.resolve(getRows()).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      },
    });

    return builder;
  };

  mocks.deleteHandler = (table: unknown) => {
    const op = {} as MockDelete;
    Object.assign(op, {
      where: vi.fn(() => op),
      returning: vi.fn(async () => {
        if (mocks.state.shouldThrow) throw new Error("Delete returning failed");
        if (table === openFinanceCredentials) {
          mocks.deletedItems.credentials.push("deleted");
          return [{ userId: mocks.state.userId }];
        }
        return [];
      }),
      then: (resolve: (val: unknown) => unknown, reject: (err: unknown) => unknown) => {
        try {
          if (mocks.state.shouldThrow) throw new Error("Delete failed");
          if (table === transactions) mocks.deletedItems.transactions.push("deleted");
          if (table === openFinanceInvoices) mocks.deletedItems.invoices.push("deleted");
          if (table === openFinanceDeleted) mocks.deletedItems.tombstones.push("deleted");
          if (table === openFinanceConnections) mocks.deletedItems.connections.push("deleted");
          return Promise.resolve().then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      },
    });
    return op;
  };
}

describe("Open Finance deletion actions", () => {
  beforeEach(() => {
    setupHandlers();
    process.env.PLUGGY_CLIENT_ID = "test-client-id";
    process.env.PLUGGY_CLIENT_SECRET = "test-client-secret";
    process.env.OPEN_FINANCE_ALLOWED_USER_IDS = "user-a";
    mocks.state.userId = "user-a";
    mocks.checkRateLimit.mockReset();
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.state.shouldThrow = false;
    mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", label: "Banco Teste" }];
    mocks.state.accounts = [
      { id: VALID_ACC_ID, userId: "user-a", externalConnectionId: VALID_CONN_ID, financeMode: "integracao" },
    ];
    mocks.state.transactions = [
      { id: VALID_TX_ID, userId: "user-a", accountId: VALID_ACC_ID, externalId: "ext-1", origin: "PLUGGY" },
    ];
    mocks.state.invoices = [{ id: VALID_INV_ID, userId: "user-a", accountId: VALID_ACC_ID, externalId: "bill-1" }];
    mocks.state.tombstones = [{ userId: "user-a", accountId: VALID_ACC_ID, externalId: "tomb-1" }];
    mocks.state.credentials = [{ userId: "user-a" }];

    mocks.deletedItems.transactions = [];
    mocks.deletedItems.invoices = [];
    mocks.deletedItems.tombstones = [];
    mocks.deletedItems.connections = [];
    mocks.deletedItems.credentials = [];
    mocks.insertedTombstones.length = 0;
    mocks.updatedAccounts.length = 0;
    mocks.rootUpdates.length = 0;
    mocks.upsertedTransactions.length = 0;
    mocks.transactionBatchSizes.length = 0;
    mocks.transactionConflictTargets.length = 0;
    mocks.upsertedInvoices.length = 0;
    mocks.state.remoteAccounts = [];
    mocks.state.remoteBills = [];
    mocks.state.remoteTransactions = [];
  });

  describe("Open Finance input validation", () => {
    it("rejects malformed connection IDs before lookup in account discovery or sync", async () => {
      expect(await discoverOpenFinanceAccounts("bad-id")).toEqual({ error: "Conexão inválida." });
      expect(await syncOpenFinance("bad-id")).toEqual({ error: "Conexão inválida." });
    });

    it("keeps setup validation errors for invalid fields and invalid/future dates", async () => {
      expect(await saveOpenFinanceSetup({ clientId: "x", clientSecret: "", itemId: "item", importFromDate: "2026-01-01" })).toEqual({ error: "Confira os campos informados." });
      expect(await saveOpenFinanceSetup({ clientId: "", clientSecret: "", itemId: "item", importFromDate: "2026-13-01" })).toEqual({ error: "A data inicial precisa ser válida e não futura." });
      const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      expect(await saveOpenFinanceSetup({ clientId: "", clientSecret: "", itemId: "item", importFromDate: future })).toEqual({ error: "A data inicial precisa ser válida e não futura." });
    });

    it("rate limits setup attempts by user to ten per hour", async () => {
      const result = await saveOpenFinanceSetup({});
      expect(result).toEqual({ error: "Confira os campos informados." });
      expect(mocks.checkRateLimit).toHaveBeenCalledWith("open-finance-setup:user-a", 10, expect.any(Number), 60 * 60 * 1000);
      mocks.checkRateLimit.mockReturnValue({ allowed: false });
      expect(await saveOpenFinanceSetup({})).toMatchObject({ error: expect.stringContaining("Muitas tentativas") });
    });

    it("maps stored provider errors to fixed user messages and hides provider text", async () => {
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", lastErrorCode: JSON.stringify({ status: 403, code: "LIST_ITEMS_FEATURE_NOT_ENABLED", message: "private provider response" }) }];
      const setup = await getOpenFinanceSetup();
      expect(setup.connections[0]?.lastErrorMessage).toContain("Demo");
      expect(setup.connections[0]?.lastErrorMessage).not.toContain("private provider response");
    });
  });

  describe("syncOpenFinance diagnostics", () => {
    it("imports investment BUY/SELL as transfers and saves the investment balance", async () => {
      const remoteId = `investments:${VALID_CONN_ID}`;
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", itemIdEnvelope: "encrypted", importFromDate: new Date("2026-09-01T00:00:00Z"), status: "UPDATED" }];
      mocks.state.accounts = [{ id: VALID_ACC_ID, userId: "user-a", name: "Investimentos", type: "INVESTMENT", externalConnectionId: VALID_CONN_ID, externalAccountId: remoteId, financeMode: "integracao", archived: false }];
      mocks.state.remoteTransactions = [
        { id: "buy", accountId: remoteId, description: "Aplicação", date: "2026-10-01T00:00:00Z", amount: 100, currencyCode: "BRL", type: "CREDIT", status: "POSTED", operationType: "INVESTMENT_TRANSFER" },
        { id: "sell", accountId: remoteId, description: "Resgate", date: "2026-10-02T00:00:00Z", amount: 50, currencyCode: "BRL", type: "DEBIT", status: "POSTED", operationType: "INVESTMENT_TRANSFER" },
      ];
      expect(await syncOpenFinance(VALID_CONN_ID)).toMatchObject({ ok: true, imported: 2, status: "UPDATED" });
      expect(mocks.upsertedTransactions).toEqual([
        expect.objectContaining({ externalId: "buy", kind: "INCOME", isTransfer: true, amountCents: 10000 }),
        expect.objectContaining({ externalId: "sell", kind: "EXPENSE", isTransfer: true, amountCents: 5000 }),
      ]);
      expect(mocks.updatedAccounts).toContainEqual({ values: expect.objectContaining({ bankBalanceCents: 35000 }) });
    });
    it("enforces a 60-second cooldown using lastAttemptAt", async () => {
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", itemIdEnvelope: "encrypted", lastAttemptAt: new Date(Date.now() - 10_000) }];
      const result = await syncOpenFinance(VALID_CONN_ID);
      expect(result).toMatchObject({ error: expect.stringContaining("60 segundos") });
      expect(mocks.rootUpdates).toHaveLength(0);
    });
    it("reports no linked accounts instead of marking an empty sync successful", async () => {
      mocks.state.accounts = [];
      const result = await syncOpenFinance(VALID_CONN_ID);
      expect(result).toMatchObject({ status: "ERROR", imported: 0, error: expect.stringContaining("Nenhuma conta local") });
      expect(mocks.rootUpdates.map((update) => update.values)).toContainEqual(expect.objectContaining({ status: "ERROR", lastErrorCode: "NO_LINKED_ACCOUNTS" }));
    });

    it("does not advance lastSyncedAt when any linked account fails", async () => {
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", itemIdEnvelope: "encrypted", importFromDate: new Date("2026-09-01T00:00:00.000Z"), status: "UPDATED" }];
      mocks.state.credentials = [{ userId: "user-a", clientIdEnvelope: "encrypted", clientSecretEnvelope: "encrypted" }];
      mocks.state.accounts = [{ id: VALID_ACC_ID, userId: "user-a", name: "Conta", type: "CHECKING", externalConnectionId: VALID_CONN_ID, externalAccountId: "missing-remote", financeMode: "integracao", archived: false }];
      const result = await syncOpenFinance(VALID_CONN_ID);
      expect(result).toMatchObject({ ok: true, status: "ERROR" });
      const completion = mocks.rootUpdates.find((update) => (update.values as { status?: string } | undefined)?.status === "ERROR");
      expect(completion?.values).not.toHaveProperty("lastSyncedAt");
    });

    it("syncs the bank account and card purchases/bill from the same Pluggy item", async () => {
      const cardAccountId = "a1111111111111111111111111";
      const cardExternalId = "pluggy-card";
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", itemIdEnvelope: "encrypted", importFromDate: new Date("2026-09-01T00:00:00.000Z"), status: "UPDATED" }];
      mocks.state.credentials = [{ userId: "user-a", clientIdEnvelope: "encrypted", clientSecretEnvelope: "encrypted" }];
      mocks.state.accounts = [
        { id: VALID_ACC_ID, userId: "user-a", name: "Conta corrente", type: "CHECKING", externalConnectionId: VALID_CONN_ID, externalAccountId: "pluggy-bank", financeMode: "integracao", archived: false },
        { id: cardAccountId, userId: "user-a", name: "Cartão Itaú", type: "CREDIT_CARD", externalConnectionId: VALID_CONN_ID, externalAccountId: cardExternalId, financeMode: "integracao", archived: false, closingDay: 25, dueDay: 5 },
      ];
      mocks.state.remoteAccounts = [
        { id: "pluggy-bank", itemId: "item", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Checking", currencyCode: "BRL", balance: 500, updatedAt: "2026-11-06T12:00:00.000Z" },
        { id: cardExternalId, itemId: "item", type: "CREDIT", subtype: "CREDIT_CARD", name: "Card", currencyCode: "BRL", balance: 120, updatedAt: "2026-11-06T12:00:00.000Z", creditData: { creditLimit: 1000, availableCreditLimit: 800 } },
      ];
      mocks.state.remoteBills = [{ id: "bill-1", dueDate: "2026-10-05T00:00:00.000Z", totalAmount: 100, totalAmountCurrencyCode: "BRL", minimumPaymentAmount: 20 }];
      mocks.state.remoteTransactions = [
        { id: "bank-tx", accountId: "pluggy-bank", description: "bank row", date: "2026-09-10T00:00:00.000Z", amount: 30, currencyCode: "BRL", type: "DEBIT", status: "POSTED" },
        { id: "bank-tx-2", accountId: "pluggy-bank", description: "bank row 2", date: "2026-09-10T00:00:00.000Z", amount: 10, currencyCode: "BRL", type: "DEBIT", status: "POSTED" },
        { id: "card-purchase", accountId: cardExternalId, description: "card purchase", date: "2026-09-11T12:00:00.000Z", amount: 40, currencyCode: "BRL", type: "DEBIT", status: "POSTED", creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, purchaseDate: "2026-09-10", billId: "bill-1" } },
        { id: "card-charge", accountId: cardExternalId, description: "card charge", date: "2026-10-11T12:00:00.000Z", amount: 40, currencyCode: "BRL", type: "DEBIT", status: "PENDING", creditCardMetadata: { installmentNumber: 2, totalInstallments: 3, purchaseDate: "2026-09-10", billPostDate: "2026-10-10" } },
        { id: "card-payment", accountId: cardExternalId, description: "payment record", date: "2026-09-12T00:00:00.000Z", amount: 40, currencyCode: "BRL", type: "CREDIT", status: "POSTED", operationType: "PAGAMENTO_FATURA" },
      ];

      const result = await syncOpenFinance(VALID_CONN_ID);

      expect(result).toMatchObject({ ok: true, imported: 4, status: "UPDATED" });
      expect(mocks.upsertedTransactions.map((row) => row.externalId)).toEqual(["bank-tx", "bank-tx-2", "card-purchase", "card-charge"]);
      expect(mocks.upsertedTransactions[2]).toMatchObject({ installmentNumber: 1, installmentTotal: 3, date: new Date("2026-09-10T12:00:00.000Z"), invoiceRef: "2026-10" });
      expect(mocks.upsertedTransactions[3]).toMatchObject({ installmentNumber: 2, installmentTotal: 3, date: new Date("2026-10-10T12:00:00.000Z"), invoiceRef: "2026-11" });
      expect(mocks.transactionBatchSizes).toEqual([2, 2]);
      expect(mocks.transactionConflictTargets).toEqual([
        [transactions.userId, transactions.accountId, transactions.externalId],
        [transactions.userId, transactions.accountId, transactions.externalId],
      ]);
      expect(mocks.upsertedInvoices).toHaveLength(1);
      expect(mocks.updatedAccounts).toContainEqual({ values: expect.objectContaining({ creditLimitCents: 100000, availableCreditCents: 80000 }) });
      expect(result.accounts).toEqual(expect.arrayContaining([
        expect.objectContaining({ accountName: "Conta corrente", inserted: 2, status: "OK" }),
        expect.objectContaining({ accountName: "Cartão Itaú", inserted: 2, ignoredByType: 1, status: "OK" }),
      ]));

      mocks.state.transactions = mocks.upsertedTransactions.map((row) => ({ userId: "user-a", accountId: String(row.accountId), externalId: String(row.externalId), origin: "PLUGGY" }));
      mocks.state.connections[0]!.lastAttemptAt = new Date(Date.now() - 61_000);
      const secondSync = await syncOpenFinance(VALID_CONN_ID);
      expect(secondSync).toMatchObject({ ok: true, imported: 4, status: "UPDATED" });
      expect(secondSync.accounts).toEqual(expect.arrayContaining([
        expect.objectContaining({ accountName: "Conta corrente", inserted: 0, updated: 2 }),
        expect.objectContaining({ accountType: "CREDIT_CARD", inserted: 0, updated: 2 }),
      ]));
    });
  });

  describe("deletePluggyTransaction", () => {
    it("writes an ownership-scoped tombstone and deletes only the selected Pluggy row", async () => {
      const result = await deletePluggyTransaction({
        transactionId: VALID_TX_ID,
        confirmation: "EXCLUIR LANCAMENTO PLUGGY",
      });
      expect(result).toEqual({ ok: true });
      expect(mocks.insertedTombstones).toContainEqual(
        expect.objectContaining({ userId: "user-a", accountId: VALID_ACC_ID, externalId: "ext-1" }),
      );
      expect(mocks.deletedItems.transactions.length).toBe(1);
    });

    it("rejects another user's imported row before any delete or tombstone write", async () => {
      mocks.state.userId = "user-b";
      const result = await deletePluggyTransaction({
        transactionId: VALID_TX_ID,
        confirmation: "EXCLUIR LANCAMENTO PLUGGY",
      });
      expect(result).toHaveProperty("error");
      expect(mocks.insertedTombstones.length).toBe(0);
      expect(mocks.deletedItems.transactions.length).toBe(0);
    });

    it("rejects invalid confirmation payload", async () => {
      const result = await deletePluggyTransaction({
        transactionId: VALID_TX_ID,
        confirmation: "WRONG CONFIRMATION",
      });
      expect(result).toHaveProperty("error");
    });

    it("defensively catches database runtime errors and returns a safe error", async () => {
      mocks.state.shouldThrow = true;
      const result = await deletePluggyTransaction({
        transactionId: VALID_TX_ID,
        confirmation: "EXCLUIR LANCAMENTO PLUGGY",
      });
      expect(result).toHaveProperty("error");
      expect(result).not.toHaveProperty("ok");
    });
  });

  describe("getOpenFinanceDeletionCounts", () => {
    it("returns counts of transactions, invoices, and tombstones for linked accounts", async () => {
      const result = await getOpenFinanceDeletionCounts({ connectionId: VALID_CONN_ID });
      expect(result).toEqual({ transactions: 1, invoices: 1, tombstones: 1 });
    });

    it("returns zero counts when connection has no linked accounts", async () => {
      mocks.state.accounts = [];
      const result = await getOpenFinanceDeletionCounts({ connectionId: VALID_CONN_ID });
      expect(result).toEqual({ transactions: 0, invoices: 0, tombstones: 0 });
    });

    it("rejects if connection is not found", async () => {
      mocks.state.connections = [];
      const result = await getOpenFinanceDeletionCounts({ connectionId: VALID_CONN_ID });
      expect(result).toHaveProperty("error");
    });

    it("defensively catches database errors and returns safe error", async () => {
      mocks.state.shouldThrow = true;
      const result = await getOpenFinanceDeletionCounts({ connectionId: VALID_CONN_ID });
      expect(result).toHaveProperty("error");
    });
  });

  describe("deleteAllOpenFinanceData", () => {
    it("refuses deletion while the connection is syncing", async () => {
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", status: "SYNCING" }];
      const result = await deleteAllOpenFinanceData({ connectionId: VALID_CONN_ID, confirmation: "EXCLUIR DADOS PLUGGY" });
      expect(result).toHaveProperty("error");
      expect(mocks.deletedItems.transactions).toHaveLength(0);
      expect(mocks.deletedItems.invoices).toHaveLength(0);
    });
    it("deletes transactions, invoices, and tombstones when confirmed", async () => {
      const result = await deleteAllOpenFinanceData({
        connectionId: VALID_CONN_ID,
        confirmation: "EXCLUIR DADOS PLUGGY",
      });
      expect(result).toEqual({ ok: true, transactions: 1, invoices: 1, tombstones: 1 });
      expect(mocks.deletedItems.transactions.length).toBe(1);
      expect(mocks.deletedItems.invoices.length).toBe(1);
      expect(mocks.deletedItems.tombstones.length).toBe(1);
    });

    it("rejects invalid confirmation", async () => {
      const result = await deleteAllOpenFinanceData({
        connectionId: VALID_CONN_ID,
        confirmation: "INVALID",
      });
      expect(result).toHaveProperty("error");
    });

    it("handles connection with zero linked accounts gracefully", async () => {
      mocks.state.accounts = [];
      const result = await deleteAllOpenFinanceData({
        connectionId: VALID_CONN_ID,
        confirmation: "EXCLUIR DADOS PLUGGY",
      });
      expect(result).toEqual({ ok: true, transactions: 0, invoices: 0, tombstones: 0 });
    });

    it("defensively catches database errors and returns safe error", async () => {
      mocks.state.shouldThrow = true;
      const result = await deleteAllOpenFinanceData({
        connectionId: VALID_CONN_ID,
        confirmation: "EXCLUIR DADOS PLUGGY",
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("removeOpenFinanceConnection", () => {
    it("refuses connection removal while it is syncing", async () => {
      mocks.state.connections = [{ id: VALID_CONN_ID, userId: "user-a", status: "SYNCING" }];
      const result = await removeOpenFinanceConnection({ connectionId: VALID_CONN_ID, confirmation: "REMOVER CONEXAO", deleteImported: true });
      expect(result).toHaveProperty("error");
      expect(mocks.deletedItems.connections).toHaveLength(0);
      expect(mocks.deletedItems.transactions).toHaveLength(0);
    });
    it("removes connection, resets accounts, and deletes transactions/invoices/tombstones when deleteImported=true", async () => {
      const result = await removeOpenFinanceConnection({
        connectionId: VALID_CONN_ID,
        confirmation: "REMOVER CONEXAO",
        deleteImported: true,
      });
      expect(result).toEqual({
        ok: true,
        deletedTransactions: 1,
        deletedInvoices: 1,
        importedPreserved: false,
      });
      expect(mocks.deletedItems.connections.length).toBe(1);
      expect(mocks.deletedItems.transactions.length).toBe(1);
      expect(mocks.deletedItems.invoices.length).toBe(1);
      expect(mocks.deletedItems.tombstones.length).toBe(1);
      expect(mocks.updatedAccounts.length).toBe(1);
    });

    it("removes connection and invoices but preserves imported transactions and tombstones when deleteImported=false", async () => {
      const result = await removeOpenFinanceConnection({
        connectionId: VALID_CONN_ID,
        confirmation: "REMOVER CONEXAO",
        deleteImported: false,
      });
      expect(result).toEqual({
        ok: true,
        deletedTransactions: 0,
        deletedInvoices: 1,
        importedPreserved: true,
      });
      expect(mocks.deletedItems.connections.length).toBe(1);
      expect(mocks.deletedItems.transactions.length).toBe(0);
      expect(mocks.deletedItems.invoices.length).toBe(1);
      expect(mocks.deletedItems.tombstones.length).toBe(0);
      expect(mocks.updatedAccounts.length).toBe(1);
    });

    it("rejects invalid confirmation", async () => {
      const result = await removeOpenFinanceConnection({
        connectionId: VALID_CONN_ID,
        confirmation: "INVALID",
        deleteImported: false,
      });
      expect(result).toHaveProperty("error");
    });

    it("defensively catches database errors and returns safe error", async () => {
      mocks.state.shouldThrow = true;
      const result = await removeOpenFinanceConnection({
        connectionId: VALID_CONN_ID,
        confirmation: "REMOVER CONEXAO",
        deleteImported: false,
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("removeOpenFinanceCredentials", () => {
    it("removes credentials when no connections exist and confirmed", async () => {
      mocks.state.connections = [];
      const result = await removeOpenFinanceCredentials({
        confirmation: "REMOVER CREDENCIAIS",
      });
      expect(result).toEqual({ ok: true });
      expect(mocks.deletedItems.credentials.length).toBe(1);
    });

    it("blocks removal when active connections exist", async () => {
      const result = await removeOpenFinanceCredentials({
        confirmation: "REMOVER CREDENCIAIS",
      });
      expect(result).toHaveProperty("error");
      expect(mocks.deletedItems.credentials.length).toBe(0);
    });

    it("rejects invalid confirmation", async () => {
      mocks.state.connections = [];
      const result = await removeOpenFinanceCredentials({
        confirmation: "INVALID",
      });
      expect(result).toHaveProperty("error");
    });

    it("defensively catches database errors and returns safe error", async () => {
      mocks.state.connections = [];
      mocks.state.shouldThrow = true;
      const result = await removeOpenFinanceCredentials({
        confirmation: "REMOVER CREDENCIAIS",
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("isBeforeCutoff date boundary handling", () => {
    it("preserves transactions occurring on or after cutoff in raw date, UTC, or America/Sao_Paulo", () => {
      expect(isBeforeCutoff("2026-10-01T00:00:00.000Z", "2026-10-01")).toBe(false);
      expect(isBeforeCutoff("2026-10-01T03:00:00.000Z", "2026-10-01")).toBe(false);
      expect(isBeforeCutoff("2026-10-01T00:00:00-03:00", "2026-10-01")).toBe(false);
      expect(isBeforeCutoff("2026-09-30T22:00:00-03:00", "2026-10-01")).toBe(false);
      expect(isBeforeCutoff("2026-10-02T15:30:00.000Z", "2026-10-01")).toBe(false);
    });

    it("identifies transactions strictly before cutoff in all time representations", () => {
      expect(isBeforeCutoff("2026-09-30T10:00:00.000Z", "2026-10-01")).toBe(true);
      expect(isBeforeCutoff("2026-09-15T00:00:00-03:00", "2026-10-01")).toBe(true);
      expect(isBeforeCutoff("invalid-date", "2026-10-01")).toBe(true);
    });
  });
});
