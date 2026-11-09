import { describe, expect, it } from "vitest";
import { canDeletePluggyTransaction, isExternalIdentityTombstoned, planConnectionDataDeletion } from "./deletion-policy";
import {
  deleteAllOpenFinanceSchema,
  deletePluggyTransactionSchema,
  removeOpenFinanceConnectionSchema,
  removeOpenFinanceCredentialsSchema,
} from "./schemas";

describe("Open Finance deletion policies", () => {
  it("allows an individually deleted imported row only for its owner and Pluggy origin", () => {
    const ownedPluggy = { id: "tx-1", userId: "user-a", accountId: "account-a", externalId: "ext-1", origin: "PLUGGY" };
    expect(canDeletePluggyTransaction(ownedPluggy, "user-a")).toBe(true);
    expect(canDeletePluggyTransaction(ownedPluggy, "user-b")).toBe(false);
    expect(canDeletePluggyTransaction({ ...ownedPluggy, origin: "CSV" }, "user-a")).toBe(false);
    expect(canDeletePluggyTransaction({ ...ownedPluggy, externalId: null }, "user-a")).toBe(false);
  });

  it("skips only the exact tombstoned external identity on later syncs", () => {
    const tombstones = new Set(["pluggy-tx-deleted"]);
    expect(isExternalIdentityTombstoned("pluggy-tx-deleted", tombstones)).toBe(true);
    expect(isExternalIdentityTombstoned("another-transaction", tombstones)).toBe(false);
  });

  it("plans connection cleanup without deleting manual, CSV, or another user's rows", () => {
    // These fixtures represent rows returned by the user- and connection-scoped database queries.
    const plan = planConnectionDataDeletion({
      userId: "user-a",
      accountIds: ["account-a"],
      transactions: [
        { id: "pluggy-owned", userId: "user-a", accountId: "account-a", origin: "PLUGGY" },
        { id: "manual-owned", userId: "user-a", accountId: "account-a", origin: "MANUAL" },
        { id: "csv-owned", userId: "user-a", accountId: "account-a", origin: "CSV" },
        { id: "other-user", userId: "user-b", accountId: "account-a", origin: "PLUGGY" },
        { id: "other-account", userId: "user-a", accountId: "account-b", origin: "PLUGGY" },
      ],
      invoices: [
        { id: "invoice-owned", userId: "user-a", accountId: "account-a" },
        { id: "invoice-other-user", userId: "user-b", accountId: "account-a" },
      ],
      tombstones: [
        { userId: "user-a", accountId: "account-a", externalId: "deleted-owned" },
        { userId: "user-b", accountId: "account-a", externalId: "deleted-other-user" },
      ],
    });
    expect(plan).toEqual({ transactionIds: ["pluggy-owned"], invoiceIds: ["invoice-owned"], tombstoneExternalIds: ["deleted-owned"] });
  });

  it("requires explicit confirmation values for destructive actions", () => {
    const connectionId = "a".repeat(26);
    expect(deletePluggyTransactionSchema.safeParse({ transactionId: connectionId, confirmation: "EXCLUIR LANCAMENTO PLUGGY" }).success).toBe(true);
    expect(deletePluggyTransactionSchema.safeParse({ transactionId: connectionId, confirmation: "" }).success).toBe(false);
    expect(deleteAllOpenFinanceSchema.safeParse({ connectionId, confirmation: "EXCLUIR DADOS PLUGGY" }).success).toBe(true);
    expect(deleteAllOpenFinanceSchema.safeParse({ connectionId, confirmation: "" }).success).toBe(false);
    expect(removeOpenFinanceCredentialsSchema.safeParse({ confirmation: "REMOVER CREDENCIAIS" }).success).toBe(true);
    expect(removeOpenFinanceConnectionSchema.safeParse({ connectionId, confirmation: "REMOVER CONEXAO", deleteImported: false }).success).toBe(true);
    expect(removeOpenFinanceConnectionSchema.safeParse({ connectionId, confirmation: "REMOVER CONEXAO", deleteImported: "false" }).success).toBe(false);
  });
});
