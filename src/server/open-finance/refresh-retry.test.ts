import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./crypto", () => ({ decryptSecret: () => "item-plain" }));
vi.mock("./sync", () => ({ resolvePluggyApiKey: vi.fn() }));
const scheduled: Array<() => Promise<void>> = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => { scheduled.push(task); } }));

import { parseRetryAfterSeconds } from "./client";
import { PluggyHttpError } from "./client";
import { requestOpenFinanceRefresh, retryAfterFor, type RefreshDependencies } from "./refresh";
import { scheduleOpenFinanceRefresh, telegramReplyWithOpenFinanceAge, openFinanceAgeLine } from "./on-demand";
import { REFRESH_MIN_INTERVAL_MS } from "./refresh-budget";

const now = new Date("2026-11-13T15:00:00Z");
const deps = (overrides: Partial<RefreshDependencies> = {}): RefreshDependencies => ({
  enabled: () => true,
  history: vi.fn(async () => []),
  reserve: vi.fn(async () => "log-1"),
  finish: vi.fn(async () => {}),
  apiKey: vi.fn(async () => "key"),
  itemId: vi.fn(async () => "item-plain"),
  patch: vi.fn(async () => ({ status: "UPDATING", executionStatus: null })),
  connections: vi.fn(async () => [{ userId: "u1", connectionId: "c1" }]),
  waitForSync: vi.fn(async (ids: string[]) => ids),
  ...overrides,
});

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); scheduled.length = 0; });

describe("Retry-After da Pluggy", () => {
  it("interpreta segundos, data HTTP e valores inválidos", () => {
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds("999999")).toBe(86_400);
    expect(parseRetryAfterSeconds("Fri, 13 Nov 2026 15:10:00 GMT", Date.parse("2026-11-13T15:00:00Z"))).toBe(600);
    expect(parseRetryAfterSeconds("lixo")).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
  });

  it("429 com Retry-After persiste o prazo e bloqueia nova tentativa", async () => {
    const error = new PluggyHttpError(429, "RATE", "x", "/items/:id", 600);
    const d = deps({ patch: vi.fn(async () => { throw error; }) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "on_demand" }, d, now)).toEqual({ ok: false, error: "HTTP_429" });
    const finishCall = (d.finish as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(finishCall[1]).toBe("HTTP_429");
    expect(Math.abs((finishCall[2] as Date).getTime() - (Date.now() + 600_000))).toBeLessThan(5_000);
  });

  it("retryAfterFor sem cabeçalho usa intervalo mínimo; com prazo na base respeita", () => {
    expect(retryAfterFor(new PluggyHttpError(429, "R", "x", "/e"), now)?.getTime()).toBe(now.getTime() + REFRESH_MIN_INTERVAL_MS);
    expect(retryAfterFor(new PluggyHttpError(429, "R", "x", "/e", 60), now)?.getTime()).toBe(now.getTime() + 60_000);
    expect(retryAfterFor(new PluggyHttpError(400, "R", "x", "/e"), now)).toBeNull();
  });

  it("linha com retryAfterAt no futuro bloqueia sob demanda e matinal, sem chamar a Pluggy", async () => {
    const d = deps({ history: vi.fn(async () => [{ connectionId: "c2", at: new Date("2026-11-13T14:00:00Z"), reason: "on_demand" as const, retryAfterAt: new Date("2026-11-13T16:00:00Z") }]) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "on_demand" }, d, now)).toEqual({ ok: false, denial: "RATE_LIMITED" });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "morning" }, d, now)).toEqual({ ok: false, denial: "RATE_LIMITED" });
    expect(d.patch).not.toHaveBeenCalled();
  });
});

describe("gatilhos sob demanda", () => {
  it("flag desligada não agenda nada", () => {
    const schedule = vi.fn();
    expect(scheduleOpenFinanceRefresh("u1", deps({ enabled: () => false }), schedule)).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("flag ligada agenda em background e dispara um refresh on_demand por conexão", async () => {
    const d = deps({ connections: vi.fn(async () => [{ userId: "u1", connectionId: "c1" }, { userId: "u1", connectionId: "c9" }]) });
    expect(scheduleOpenFinanceRefresh("u1", d)).toBe(true);
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    await scheduled[0]!();
    expect(d.connections).toHaveBeenCalledWith("u1");
    expect(d.patch).toHaveBeenCalledTimes(2);
  });

  it("Telegram com flag desligada devolve o texto intacto", async () => {
    expect(await telegramReplyWithOpenFinanceAge("u1", async () => "Saldo: R$ 10", deps({ enabled: () => false }))).toBe("Saldo: R$ 10");
    expect(scheduled).toHaveLength(0);
  });

  it("linha de idade formata data de São Paulo e idade", () => {
    expect(openFinanceAgeLine(new Date("2026-11-13T14:30:00Z"), new Date("2026-11-13T15:00:00Z"))).toBe("Dados do banco de 11:30 (13/11), há 30 min.");
    expect(openFinanceAgeLine(null, now)).toBe("Dados do banco sem horário de atualização disponível.");
  });
});
