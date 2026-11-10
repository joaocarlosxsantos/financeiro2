import { describe, expect, it, vi } from "vitest";
import { handleInsightsCron, runInsightBatch, type CronDependencies, type InsightRecipient } from "./cron";
import { DEFAULT_PREFERENCES, type InsightData } from "./insights";

const window = { key: "2026-11-10:20", day: "2026-11-10", hour: 20 as const };
const recipient = (userId = "owner"): InsightRecipient => ({ userId, chatId: `chat-${userId}`, prefs: { ...DEFAULT_PREFERENCES, enabled: true } });
const facts: InsightData = { summaryDay: window.day, incomeCents: 1000, expenseCents: 200, categories: [], due: [], budgets: [] };
function dependencies(users = [recipient()]): CronDependencies {
  const claims = new Set<string>();
  return {
    candidates: vi.fn().mockResolvedValue(users), data: vi.fn().mockResolvedValue(facts),
    claim: vi.fn(async (userId, key) => {
      const id = `${userId}:${key}`;
      if (claims.has(id)) return false;
      claims.add(id); return true;
    }),
    stillEnabled: vi.fn().mockResolvedValue(true), send: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(undefined),
  };
}
const request = (auth?: string) => new Request("https://app.test/api/cron/insights", { headers: auth ? { Authorization: auth } : {} });

describe("cron de insights", () => {
  it("falha fechado sem segredo, sem Bearer ou com segredo incorreto", async () => {
    const deps = dependencies();
    for (const [header, secret, status] of [["Bearer secret", undefined, 503], [undefined, "secret", 401], ["Bearer secrex", "secret", 401], ["secret", "secret", 401]] as const) {
      expect((await handleInsightsCron(request(header), secret, deps)).status).toBe(status);
    }
    expect(deps.candidates).not.toHaveBeenCalled();
  });
  it("não usa user_id/horário da query e retorna apenas contadores", async () => {
    const deps = dependencies();
    const req = new Request("https://app.test/api/cron/insights?user_id=attacker&hour=8", { headers: { Authorization: "Bearer secret" } });
    const result = await handleInsightsCron(req, "secret", deps, new Date("2026-11-10T23:00:00Z"));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(deps.data).toHaveBeenCalledWith("owner", window);
  });
  it("antes da primeira janela não lê finanças", async () => {
    const deps = dependencies();
    await handleInsightsCron(request("Bearer secret"), "secret", deps, new Date("2026-11-10T10:59:59Z"));
    expect(deps.candidates).not.toHaveBeenCalled();
  });
  it("cron duplicado ou simultâneo só envia uma vez por usuário/janela", async () => {
    const deps = dependencies();
    await Promise.all([runInsightBatch(window, deps), runInsightBatch(window, deps)]);
    await runInsightBatch(window, deps);
    expect(deps.send).toHaveBeenCalledTimes(1);
    await runInsightBatch({ ...window, key: "2026-11-11:20", day: "2026-11-11" }, deps);
    expect(deps.send).toHaveBeenCalledTimes(2);
  });
  it("preferências desativadas ou horário excluído não leem dados nem enviam", async () => {
    const deps = dependencies([{ ...recipient("off"), prefs: { ...DEFAULT_PREFERENCES, enabled: false } }, { ...recipient("other-hour"), prefs: { ...DEFAULT_PREFERENCES, enabled: true, hours: [8] } }]);
    expect(await runInsightBatch(window, deps)).toEqual({ sent: 0, skipped: 2, failed: 0 });
    expect(deps.data).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("um usuário com erro não derruba os demais, inclusive falha ao registrar erro", async () => {
    const deps = dependencies([recipient("bad"), recipient("good")]);
    vi.mocked(deps.send).mockImplementation(async (chat) => { if (chat === "chat-bad") throw new Error("secret bank data"); });
    vi.mocked(deps.finish).mockImplementation(async (user) => { if (user === "bad") throw new Error("database unavailable"); });
    expect(await runInsightBatch(window, deps)).toEqual({ sent: 1, skipped: 0, failed: 1 });
    await runInsightBatch(window, deps);
    expect(deps.send).toHaveBeenCalledTimes(2); // uma tentativa por usuário, sem reenvio
  });
  it("pausa ou desconexão antes do envio cancela a reserva", async () => {
    const deps = dependencies();
    vi.mocked(deps.stillEnabled).mockResolvedValue(false);
    expect(await runInsightBatch(window, deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(deps.finish).toHaveBeenCalledWith("owner", window.key, "CANCELLED");
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("falha ao carregar um usuário não impede envio aos demais", async () => {
    const deps = dependencies([recipient("bad"), recipient("good")]);
    vi.mocked(deps.data).mockImplementation(async (user) => { if (user === "bad") throw new Error("private data"); return facts; });
    expect(await runInsightBatch(window, deps)).toEqual({ sent: 1, skipped: 0, failed: 1 });
  });
  it("falha geral retorna erro genérico sem logs sensíveis", async () => {
    const deps = dependencies();
    vi.mocked(deps.candidates).mockRejectedValue(new Error("user_id chat_id token"));
    const log = vi.spyOn(console, "error");
    const result = await handleInsightsCron(request("Bearer secret"), "secret", deps, new Date("2026-11-10T23:00:00Z"));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "temporarily_unavailable" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("pagina além dos primeiros cem usuários sem perder o isolamento", async () => {
    const users = Array.from({ length: 101 }, (_, i) => recipient(String(i).padStart(3, "0")));
    const deps = dependencies();
    vi.mocked(deps.candidates).mockResolvedValueOnce(users.slice(0, 100)).mockResolvedValueOnce(users.slice(100));
    expect(await runInsightBatch(window, deps)).toEqual({ sent: 101, skipped: 0, failed: 0 });
    expect(deps.candidates).toHaveBeenLastCalledWith(window, "099");
  });
});
