import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ restriction: vi.fn(), sync: vi.fn(), select: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: mocks.restriction }));
vi.mock("./sync", () => ({ syncOpenFinanceForUser: mocks.sync }));
vi.mock("@/server/queries", () => ({ getBalances: vi.fn() }));
import { appendRefreshNotice, FINANCIAL_REFRESH_TIMEOUT_MS, readWithOpenFinanceRefresh, refreshFinancialData, type FinancialRefreshDependencies } from "./refresh";
import { runDailySummaryBatch } from "@/server/telegram/daily-summary";

const now = new Date("2026-11-12T11:00:00Z");
function dependencies(): FinancialRefreshDependencies {
  return { connections: vi.fn().mockResolvedValue([{ id: "connection", lastSyncedAt: new Date(now.getTime() - 30_000), dataAt: null }]), sync: vi.fn().mockResolvedValue({ skipped: true }), now: () => now };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe("atualização compartilhada antes das leituras", () => {
  it("adapter de produção delega ao mesmo núcleo com modo automático (cooldown 5 min) e AbortSignal", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    mocks.restriction.mockResolvedValue(null);
    const rows = [{ id: "connection", lastSyncedAt: new Date(now.getTime() - 30_000) }];
    const query = { from: () => query, where: () => query, then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve) };
    mocks.select.mockReturnValue(query);
    mocks.sync.mockResolvedValue({ skipped: true });
    expect(await refreshFinancialData("owner")).toBe("Nada novo desde 07:59 (12/11).");
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith("owner", "connection", "auto", { signal: expect.any(AbortSignal) });
  });
  it("sincroniza antes de ler, usando a identidade do servidor", async () => {
    const deps = dependencies();
    vi.mocked(deps.sync).mockResolvedValue({ lastSyncedAt: now });
    const read = vi.fn(async () => { expect(deps.sync).toHaveBeenCalledWith("owner", "connection", expect.any(AbortSignal)); return "Saldo salvo"; });
    expect(await readWithOpenFinanceRefresh("owner", read, deps)).toBe("Saldo salvo\n\nAtualizado há 0 s.");
  });
  it("cooldown usa os dados já salvos e informa que nada mudou desde o horário do dado", async () => {
    const deps = dependencies();
    expect(await readWithOpenFinanceRefresh("owner", async () => "Saldo", deps)).toBe("Saldo\n\nNada novo desde 07:59 (12/11).");
    expect(deps.sync).toHaveBeenCalledTimes(1);
  });
  it("usa o horário do dado do banco, não o da última tentativa de sync", async () => {
    const deps = dependencies();
    vi.mocked(deps.connections).mockResolvedValue([{ id: "connection", lastSyncedAt: now, dataAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) }]);
    vi.mocked(deps.sync).mockResolvedValue({ lastSyncedAt: now, dataAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) });
    expect(await refreshFinancialData("owner", deps)).toBe("Dados do banco de 05:00 (12/11); podem estar desatualizados.");
  });
  it("avisa quando a Pluggy aceitou a atualização mas ainda não concluiu", async () => {
    const deps = dependencies();
    vi.mocked(deps.sync).mockResolvedValue({ lastSyncedAt: now, itemUpdate: "pending" });
    expect(await refreshFinancialData("owner", deps)).toBe("O banco ainda está processando a atualização; dados de 08:00 (12/11).");
  });
  it("avisa quando o conector recusou o pedido de atualização", async () => {
    const deps = dependencies();
    vi.mocked(deps.sync).mockResolvedValue({ lastSyncedAt: new Date(now.getTime() - 30_000), itemUpdate: "unavailable" });
    expect(await refreshFinancialData("owner", deps)).toBe("Não consegui solicitar atualização ao banco; dados de 07:59 (12/11).");
  });
  it("falha não impede leitura e informa a hora conhecida sem expor erro", async () => {
    const deps = dependencies();
    vi.mocked(deps.sync).mockRejectedValue(new Error("private token"));
    const result = await readWithOpenFinanceRefresh("owner", async () => "Saldo salvo", deps);
    expect(result).toContain("Saldo salvo");
    expect(result).toContain("Não consegui atualizar agora; dados de 07:59 (12/11). Os dados podem estar desatualizados.");
    expect(result).not.toContain("private");
  });
  it("sem integração não dispara sync nem acrescenta aviso", async () => {
    const deps = dependencies();
    vi.mocked(deps.connections).mockResolvedValue([]);
    expect(await readWithOpenFinanceRefresh("manual-owner", async () => "Saldo manual", deps)).toBe("Saldo manual");
    expect(deps.sync).not.toHaveBeenCalled();
    mocks.restriction.mockResolvedValue("Perfil manual");
    expect(await refreshFinancialData("manual-owner")).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("aplica teto de 8s ao usuário, cancela trabalho e entrega uma única resposta salva", async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    let signal: AbortSignal | undefined;
    vi.mocked(deps.sync).mockImplementation(async (_user, _connection, value) => {
      signal = value;
      return new Promise(() => {});
    });
    const read = vi.fn().mockResolvedValue("Dados salvos");
    const pending = readWithOpenFinanceRefresh("owner", read, deps);
    await vi.advanceTimersByTimeAsync(FINANCIAL_REFRESH_TIMEOUT_MS);
    expect(await pending).toContain("Dados salvos\n\nNão consegui atualizar agora");
    expect(signal?.aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("conexões são processadas em sequência dentro do mesmo teto e isolam falhas", async () => {
    const deps = dependencies();
    vi.mocked(deps.connections).mockResolvedValue([{ id: "one", lastSyncedAt: now, dataAt: null }, { id: "two", lastSyncedAt: now, dataAt: null }]);
    let active = 0;
    vi.mocked(deps.sync).mockImplementation(async (_owner, id) => {
      expect(++active).toBe(1);
      await Promise.resolve(); active--;
      if (id === "one") throw new Error("unavailable");
      return { lastSyncedAt: now };
    });
    expect(await readWithOpenFinanceRefresh("owner", async () => "Resumo salvo", deps)).toContain("Resumo salvo\n\nNão consegui atualizar agora");
    expect(deps.sync).toHaveBeenCalledTimes(2);
  });
  it("não inventa horário sem snapshot e preserva o limite de 4096 sem quebrar emoji", async () => {
    const deps = dependencies();
    vi.mocked(deps.connections).mockResolvedValue([{ id: "one", lastSyncedAt: null, dataAt: null }]);
    vi.mocked(deps.sync).mockResolvedValue({ error: "unavailable" });
    expect(await refreshFinancialData("owner", deps)).toContain("sem horário de atualização disponível");
    const result = appendRefreshNotice("😀".repeat(3000), "Atualizado há 1 s.");
    expect(result.length).toBeLessThanOrEqual(4096);
    expect(result).not.toMatch(/[\uD800-\uDBFF]\n/);
  });
  it("cron atualiza após claim, usa fallback por usuário e envia aos demais com pool de três", async () => {
    const prefs = { enabled: true, summary: true, hours: [8] as [8], spending: true, dueBills: true, budget: true, cardInvoice: true, negativeForecast: true };
    const candidates = vi.fn().mockResolvedValue(["one", "two", "three", "four", "duplicate"].map(userId => ({ userId, chatId: `${userId}-chat`, prefs })));
    const claim = vi.fn(async (userId: string) => userId !== "duplicate");
    const send = vi.fn().mockResolvedValue(undefined), finish = vi.fn().mockResolvedValue(undefined);
    let active = 0, maximum = 0;
    const render = vi.fn(async (userId: string) => {
      expect(claim).toHaveBeenCalledWith(userId, "2026-11-12:ds");
      const deps = dependencies();
      vi.mocked(deps.sync).mockImplementation(async () => {
        maximum = Math.max(maximum, ++active); await Promise.resolve(); active--;
        if (userId === "one") throw new Error("unavailable");
        return { lastSyncedAt: now };
      });
      return readWithOpenFinanceRefresh(userId, async () => `Resumo ${userId}`, deps);
    });
    const result = await runDailySummaryBatch({ key: "2026-11-12:ds", day: "2026-11-12" }, { candidates, claim, render, send, finish }, now);
    expect(result).toMatchObject({ sent: 4, skipped: 1, failed: 0 });
    expect(maximum).toBeLessThanOrEqual(3);
    expect(send).toHaveBeenCalledWith("one-chat", expect.stringContaining("Não consegui atualizar agora; dados de 07:59"));
    expect(send).toHaveBeenCalledWith("two-chat", expect.stringContaining("Atualizado há 0 s."));
    expect(render).not.toHaveBeenCalledWith("duplicate", expect.anything());
    expect(finish).toHaveBeenCalledWith("one", "2026-11-12:ds", "SENT");
  });
});
