import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ restriction: vi.fn(), select: vi.fn(), update: vi.fn(), transaction: vi.fn(), auth: vi.fn(), item: vi.fn(), itemUpdate: vi.fn(), remote: vi.fn(), remoteTx: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction } }));
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: mocks.restriction }));
vi.mock("./crypto", () => ({ decryptSecret: () => "test-value" }));
vi.mock("./client", async importOriginal => ({ ...await importOriginal<typeof import("./client")>(), authenticatePluggy: mocks.auth, getPluggyItemStatus: mocks.item, requestPluggyItemUpdate: mocks.itemUpdate, getPluggyAccounts: mocks.remote, getPluggyTransactions: mocks.remoteTx }));
import { accounts, openFinanceConnections, openFinanceCredentials } from "@/db/schema";
import { SYNC_COOLDOWN_MS, syncOpenFinanceForUser } from "./sync";

const id = "c0000000000000000000000001";
let connection: { id: string; userId: string; lastAttemptAt: Date | null; lastSyncedAt: Date | null; importFromDate: Date; itemIdEnvelope: string };
let claimed: boolean;
let predicates: SQL[];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T11:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  connection = { id, userId: "owner", lastAttemptAt: null, lastSyncedAt: null, importFromDate: new Date("2026-11-01"), itemIdEnvelope: "test" };
  claimed = false; predicates = [];
  mocks.restriction.mockResolvedValue(null); mocks.auth.mockResolvedValue("test-key");
  mocks.item.mockResolvedValue({ status: "UPDATED", executionStatus: "SUCCESS" }); mocks.remote.mockResolvedValue([]);
  mocks.itemUpdate.mockResolvedValue({ accepted: true, status: "UPDATING", executionStatus: null });
  mocks.transaction.mockImplementation(async callback => callback({}));
  mocks.select.mockImplementation(() => {
    let table: unknown, predicate: SQL;
    const rows = () => {
      if (table === openFinanceConnections) {
        const params = new PgDialect().sqlToQuery(predicate).params;
        return params.includes("owner") ? [{ ...connection }] : [];
      }
      if (table === accounts) return [{ id: "local", name: "Test", type: "CHECKING", externalAccountId: "remote" }];
      if (table === openFinanceCredentials) return [{ clientIdEnvelope: "test", clientSecretEnvelope: "test" }];
      return [];
    };
    const query = { from: (value: unknown) => { table = value; return query; }, where: (value: SQL) => { predicate = value; return query; }, for: () => query, limit: async () => rows(), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve) };
    return query;
  });
  mocks.update.mockImplementation(() => {
    let values: { lastAttemptAt?: Date };
    const query = {
      set: (value: typeof values) => { values = value; return query; },
      where: (predicate: SQL) => { predicates.push(predicate); return query; },
      returning: async () => {
        if (claimed) return [];
        claimed = true; connection.lastAttemptAt = values.lastAttemptAt!;
        return [{ id }];
      },
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
    };
    return query;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("núcleo de sync comum ao botão, painel e Telegram", () => {
  it("cooldown manual existente bloqueia chamadas durante 60s, inclusive após falha", async () => {
    connection.lastAttemptAt = new Date(Date.now() - SYNC_COOLDOWN_MS + 1);
    expect(await syncOpenFinanceForUser("owner", id)).toMatchObject({ skipped: true });
    expect(mocks.auth).not.toHaveBeenCalled();
    connection.lastAttemptAt = new Date(Date.now() - SYNC_COOLDOWN_MS);
    await syncOpenFinanceForUser("owner", id);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(await syncOpenFinanceForUser("owner", id)).toMatchObject({ skipped: true });
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(predicates[0]);
    expect(query.sql).toContain("<=");
    expect(query.params).toContain("owner");
    expect(query.params).toContain("SYNCING");
  });
  it("duas consultas concorrentes têm apenas um vencedor do claim e uma chamada Pluggy", async () => {
    const results = await Promise.all([syncOpenFinanceForUser("owner", id), syncOpenFinanceForUser("owner", id)]);
    expect(results.filter(result => "skipped" in result && result.skipped)).toHaveLength(1);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });
  it("painel mantém 5min e compartilha lastAttemptAt com o modo manual de 60s", async () => {
    connection.lastAttemptAt = new Date(Date.now() - 61_000);
    expect(await syncOpenFinanceForUser("owner", id, "auto")).toMatchObject({ skipped: true });
    expect(mocks.auth).not.toHaveBeenCalled();
    await syncOpenFinanceForUser("owner", id, "manual");
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });
  it("não sincroniza sem integração nem acessa conexão de outro usuário", async () => {
    mocks.restriction.mockResolvedValueOnce("Perfil manual");
    expect(await syncOpenFinanceForUser("owner", id)).toMatchObject({ error: "Perfil manual" });
    expect(await syncOpenFinanceForUser("other-owner", id)).toMatchObject({ error: "Conexão não encontrada." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("pede atualização do item antes de ler o cache e aguarda o status final", async () => {
    const controller = new AbortController();
    let active = 0;
    mocks.itemUpdate.mockImplementation(async () => { expect(++active).toBe(1); return { accepted: true, status: "UPDATING", executionStatus: null }; });
    mocks.item.mockImplementation(async () => { active--; return { status: "UPDATED", executionStatus: "SUCCESS" }; });
    await syncOpenFinanceForUser("owner", id, "manual", { signal: controller.signal });
    expect(mocks.itemUpdate).toHaveBeenCalledExactlyOnceWith("test-key", "test-value", controller.signal);
    expect(mocks.item).toHaveBeenCalled();
  });
  it("conector que recusa PATCH (MFA/consentimento) não quebra: segue com o cache e avisa", async () => {
    mocks.itemUpdate.mockRejectedValue(new Error("400"));
    mocks.remote.mockResolvedValue([{ id: "remote", type: "BANK", currencyCode: "BRL", balance: 10 }]);
    mocks.remoteTx.mockResolvedValue({ transactions: [], invalid: 0 });
    mocks.transaction.mockImplementation(async callback => callback({ select: mocks.select, update: () => ({ set: () => ({ where: async () => {} }) }), insert: vi.fn() }));
    const result = await syncOpenFinanceForUser("owner", id);
    expect(result).toMatchObject({ ok: true, status: "UPDATED", itemUpdate: "unavailable", notice: expect.stringContaining("último snapshot") });
    expect(mocks.remote).toHaveBeenCalled();
  });
  it("PATCH aceito sem concluir dentro do teto segue com dados atuais e reporta pendente", async () => {
    mocks.item.mockResolvedValue({ status: "UPDATING", executionStatus: "TRANSACTIONS_IN_PROGRESS" });
    mocks.remote.mockResolvedValue([{ id: "remote", type: "BANK", currencyCode: "BRL", balance: 10 }]);
    mocks.remoteTx.mockResolvedValue({ transactions: [], invalid: 0 });
    mocks.transaction.mockImplementation(async callback => callback({ select: mocks.select, update: () => ({ set: () => ({ where: async () => {} }) }), insert: vi.fn() }));
    const result = await syncOpenFinanceForUser("owner", id, "manual", { waitForUpdateMs: 0 });
    expect(result).toMatchObject({ ok: true, status: "UPDATED", itemUpdate: "pending", notice: expect.stringContaining("ainda está processando") });
    expect(mocks.transaction).toHaveBeenCalled();
  });
  it("abortar por timeout devolve o status anterior em vez de marcar ERROR", async () => {
    const controller = new AbortController();
    mocks.auth.mockImplementation(async (_client, _secret, signal: AbortSignal) => { controller.abort(); signal.throwIfAborted(); });
    const result = await syncOpenFinanceForUser("owner", id, "manual", { signal: controller.signal });
    expect(result).toMatchObject({ aborted: true, status: "ABORTED" });
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it("cancelamento impede novos requests e transação de importação", async () => {
    const controller = new AbortController();
    mocks.auth.mockImplementation(async (_client, _secret, signal: AbortSignal) => { controller.abort(); signal.throwIfAborted(); });
    expect(await syncOpenFinanceForUser("owner", id, "manual", { signal: controller.signal })).toMatchObject({ status: "ABORTED" });
    expect(mocks.item).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("cancelamento dentro da transação aborta antes do upsert de lançamentos", async () => {
    const controller = new AbortController(), insert = vi.fn();
    mocks.remote.mockResolvedValue([{ id: "remote", type: "BANK", currencyCode: "BRL", balance: 10 }]);
    mocks.remoteTx.mockResolvedValue({ transactions: [{ id: "external", description: "Compra", date: "2026-11-12", amount: 1, type: "DEBIT", currencyCode: "BRL", status: "POSTED" }], invalid: 0 });
    mocks.transaction.mockImplementation(async callback => callback({
      select: mocks.select,
      update: () => ({ set: () => ({ where: async () => { controller.abort(); } }) }),
      insert,
    }));
    expect(await syncOpenFinanceForUser("owner", id, "manual", { signal: controller.signal })).toMatchObject({ status: "ABORTED" });
    expect(insert).not.toHaveBeenCalled();
  });
});
