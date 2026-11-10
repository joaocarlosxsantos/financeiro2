import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

type Selection = { rows?: unknown[]; error?: Error };
const mocks = vi.hoisted(() => ({
  authError: null as Error | null,
  selections: [] as Selection[],
  filters: [] as unknown[],
  inserted: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ values: unknown; condition?: unknown }>,
  select: vi.fn(),
  transaction: vi.fn(),
  billRulesStatus: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUserId: async () => {
  if (mocks.authError) throw mocks.authError;
  return "session-owner";
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/queries", () => ({ getBillRulesStatus: (...args: unknown[]) => mocks.billRulesStatus(...args) }));
vi.mock("@/server/usage-profile", () => ({
  getProfileRestriction: async () => null,
  getUsageProfile: async () => "hibrido",
}));
vi.mock("@/db", () => ({ db: {
  select: (...args: unknown[]) => mocks.select(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args),
  update: () => ({ set: (values: unknown) => ({ where: async (condition: unknown) => { mocks.updates.push({ values, condition }); } }) }),
} }));

import { createTransfer } from "./transactions";
import { generateBillsForMonth } from "./bills";
import { autoSyncOpenFinance } from "./open-finance";

const connId = "c0000000000000000000000001";
const sqlParams = (condition: unknown) => new PgDialect().sqlToQuery(condition as SQL).params;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authError = null;
  mocks.selections.length = mocks.filters.length = mocks.inserted.length = mocks.updates.length = 0;
  mocks.billRulesStatus.mockResolvedValue({ pending: [] });
  mocks.select.mockImplementation(() => {
    const next = mocks.selections.shift() ?? { rows: [] };
    const result = () => next.error ? Promise.reject(next.error) : Promise.resolve(next.rows ?? []);
    const query = {
      from: () => query,
      where: (condition: unknown) => { mocks.filters.push(condition); return query; },
      limit: result,
      then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
    };
    return query;
  });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    insert: () => ({ values: async (rows: Array<Record<string, unknown>>) => { mocks.inserted.push(...rows); } }),
  }));
});

describe("fronteiras das actions", () => {
  it("transferência usa a sessão e ignora userId extra enviado pelo cliente", async () => {
    mocks.selections.push({ rows: [{ id: "account-a", financeMode: "manual" }, { id: "account-b", financeMode: "manual" }] });
    // JS callers can send surplus serialized arguments; these must never select an owner.
    const call = createTransfer as unknown as (...args: unknown[]) => ReturnType<typeof createTransfer>;
    const result = await call("account-a", "account-b", 10000, "2026-11-10", null, { userId: "forged-owner" });
    expect(result.ok).toBe(true);
    expect(sqlParams(mocks.filters[0])).toContain("session-owner");
    expect(sqlParams(mocks.filters[0])).not.toContain("forged-owner");
    expect(mocks.inserted).toHaveLength(2);
    expect(mocks.inserted.every((row) => row.userId === "session-owner")).toBe(true);
  });

  it("não transfere entre contas que não pertencem à sessão", async () => {
    mocks.selections.push({ rows: [] });
    expect((await createTransfer("foreign-a", "foreign-b", 10000, "2026-11-10")).error).toBeTruthy();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("não usa dados do cliente como alternativa a uma sessão ausente", async () => {
    mocks.authError = new Error("signed out");
    await expect(createTransfer("account-a", "account-b", 10000, "2026-11-10")).rejects.toThrow("signed out");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejeita período inválido antes de consultar regras ou gravar contas", async () => {
    const result = await generateBillsForMonth("2026-13");
    expect(result.created).toBe(0);
    expect(result.error).toBeTruthy();
    expect(mocks.billRulesStatus).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("encaminha período válido normalizado e apenas o usuário da sessão", async () => {
    await generateBillsForMonth("2026-11");
    expect(mocks.billRulesStatus).toHaveBeenCalledWith("session-owner", { year: 2026, month: 11 });
  });

  it("falha de leitura do auto-sync vira resultado seguro sem rejeitar o painel", async () => {
    mocks.selections.push({ error: new Error("sensitive database detail") });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await autoSyncOpenFinance();
      expect(result.synced).toBe(false);
      expect(result).toHaveProperty("error");
      expect(JSON.stringify(result)).not.toContain("sensitive");
      expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
    } finally { log.mockRestore(); }
  });

  it("erro por conexão é registrado e não interrompe as demais", async () => {
    mocks.selections.push({ rows: [{ id: connId }, { id: "c0000000000000000000000002" }] }, { error: new Error("private detail") }, { error: new Error("another private detail") });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await autoSyncOpenFinance();
      expect(result.synced).toBe(false);
      expect(result).toHaveProperty("error");
      expect(mocks.updates).toHaveLength(2);
      expect(mocks.updates.every((update) => (update.values as { lastErrorCode: string }).lastErrorCode === "AUTO_SYNC_FAILED")).toBe(true);
      expect(sqlParams(mocks.updates[0].condition)).toContain("session-owner");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    } finally { log.mockRestore(); }
  });

  it("cooldown é um adiamento normal e não mostra erro no painel", async () => {
    mocks.selections.push({ rows: [{ id: connId }] }, { rows: [{ id: connId, lastAttemptAt: new Date() }] }, { rows: [{}] });
    expect(await autoSyncOpenFinance()).toEqual({ synced: false });
    expect(mocks.updates).toHaveLength(0);
  });
});
