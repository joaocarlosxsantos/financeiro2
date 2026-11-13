import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./crypto", () => ({ decryptSecret: () => "item-plain" }));
vi.mock("./sync", () => ({ resolvePluggyApiKey: vi.fn() }));

import { PluggyHttpError } from "./client";
import { handleScheduledRefreshCron, requestOpenFinanceRefresh, type RefreshDependencies } from "./refresh";

const now = new Date("2026-11-13T15:00:00Z");
const base = (overrides: Partial<RefreshDependencies> = {}): RefreshDependencies & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    enabled: () => true,
    history: vi.fn(async () => []),
    reserve: vi.fn(async () => { calls.push("reserve"); return "log-1"; }),
    finish: vi.fn(async (_id: string, status: string) => { calls.push(`finish:${status}`); }),
    apiKey: vi.fn(async () => "key"),
    itemId: vi.fn(async () => "item-plain"),
    patch: vi.fn(async () => { calls.push("patch"); return { status: "UPDATING", executionStatus: null }; }),
    connections: vi.fn(async () => [{ userId: "u1", connectionId: "c1" }]),
    waitForSync: vi.fn(async (ids: string[]) => ids),
    ...overrides,
  };
};

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("refresh Open Finance sob demanda", () => {
  it("com flag desligada não consulta orçamento nem chama a Pluggy", async () => {
    const deps = base({ enabled: () => false });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, deps, now)).toEqual({ ok: false, denial: "DISABLED" });
    expect(deps.history).not.toHaveBeenCalled();
    expect(deps.patch).not.toHaveBeenCalled();
  });

  it("reserva antes do PATCH e grava OK depois, com corpo vazio e uma única chamada", async () => {
    const deps = base();
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, deps, now)).toEqual({ ok: true, status: "UPDATING" });
    expect(deps.calls).toEqual(["reserve", "patch", "finish:OK"]);
    expect(deps.patch).toHaveBeenCalledWith("key", "item-plain");
  });

  it("orçamento negado não reserva nem chama a Pluggy", async () => {
    const deps = base({ history: vi.fn(async () => [{ connectionId: "c1", at: new Date("2026-11-13T14:30:00Z"), reason: "scheduled" as const }]) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, deps, now)).toEqual({ ok: false, denial: "TOO_SOON" });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.patch).not.toHaveBeenCalled();
  });

  it("erro da Pluggy (429) consome a reserva, grava o status e não repete", async () => {
    const deps = base({ patch: vi.fn(async () => { throw new PluggyHttpError(429, "RATE", "x", "/items/:id"); }) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "morning" }, deps, now)).toEqual({ ok: false, error: "HTTP_429" });
    expect(deps.patch).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith("log-1", "HTTP_429", expect.any(Date));
  });

  it("single-flight: segunda chamada concorrente no mesmo item é recusada", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const deps = base({ patch: vi.fn(async () => { await gate; return { status: "UPDATED", executionStatus: null }; }) });
    const first = requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, deps, now);
    await vi.waitFor(() => expect(deps.patch).toHaveBeenCalled());
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, deps, now)).toEqual({ ok: false, denial: "IN_FLIGHT" });
    release();
    expect(await first).toEqual({ ok: true, status: "UPDATED" });
  });
});

describe("cron agendado (8 horários SP)", () => {
  const request = (auth?: string) => new Request("https://app.test/api/cron/open-finance-refresh", { headers: auth ? { authorization: auth } : {} });
  const morning = new Date("2026-11-13T09:30:00Z"); // 06:30 SP
  const midday = new Date("2026-11-13T15:00:00Z"); // 12:00 SP

  it("exige CRON_SECRET configurado e Bearer correto", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await handleScheduledRefreshCron(request("Bearer x"), base(), morning)).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await handleScheduledRefreshCron(request("Bearer wrong"), base(), morning)).status).toBe(401);
    expect((await handleScheduledRefreshCron(request(), base(), morning)).status).toBe(401);
  });

  it("com flag desligada responde skipped sem tocar em nada", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const deps = base({ enabled: () => false });
    expect(await (await handleScheduledRefreshCron(request("Bearer s3cret"), deps, morning)).json()).toEqual({ skipped: "disabled" });
    expect(deps.connections).not.toHaveBeenCalled();
  });

  it("06:30 SP é matinal: refresh por conexão e espera pelo webhook", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const deps = base({ connections: vi.fn(async () => [{ userId: "u1", connectionId: "c1" }, { userId: "u2", connectionId: "c2" }]) });
    const response = await handleScheduledRefreshCron(request("Bearer s3cret"), deps, morning);
    expect(await response.json()).toEqual({ ok: 2, denied: 0, failed: 0, synced: 2, pending: 0 });
    expect(deps.reserve).toHaveBeenCalledWith(expect.objectContaining({ reason: "morning", connectionId: "c1" }));
    expect(deps.waitForSync).toHaveBeenCalledWith(["c1", "c2"], morning, 120_000);
  });

  it("horário agendado (12:00 SP) não espera webhook", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const deps = base();
    expect(await (await handleScheduledRefreshCron(request("Bearer s3cret"), deps, midday)).json()).toEqual({ ok: 1, denied: 0, failed: 0, synced: 0, pending: 0 });
    expect(deps.reserve).toHaveBeenCalledWith(expect.objectContaining({ reason: "scheduled" }));
    expect(deps.waitForSync).not.toHaveBeenCalled();
  });
});
