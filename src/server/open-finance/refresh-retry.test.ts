import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./crypto", () => ({ decryptSecret: () => "item-plain" }));
vi.mock("./sync", () => ({ resolvePluggyApiKey: vi.fn() }));

import { parseRetryAfterSeconds, PluggyHttpError } from "./client";
import { requestOpenFinanceRefresh, retryAfterFor, type RefreshDependencies } from "./refresh";
import { openFinanceAgeLine } from "./data-age";
import { refreshReasonFor, REFRESH_MIN_INTERVAL_MS } from "./refresh-budget";

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

afterEach(() => { vi.clearAllMocks(); });

describe("Retry-After da Pluggy", () => {
  it("interpreta segundos, data HTTP e valores inválidos", () => {
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds("999999")).toBe(86_400);
    expect(parseRetryAfterSeconds("Fri, 13 Nov 2026 15:10:00 GMT", Date.parse("2026-11-13T15:00:00Z"))).toBe(600);
    expect(parseRetryAfterSeconds("lixo")).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
  });

  it("429 com Retry-After persiste o prazo", async () => {
    const error = new PluggyHttpError(429, "RATE", "x", "/items/:id", 600);
    const d = deps({ patch: vi.fn(async () => { throw error; }) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, d, now)).toEqual({ ok: false, error: "HTTP_429" });
    const finishCall = (d.finish as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(finishCall[1]).toBe("HTTP_429");
    expect(Math.abs((finishCall[2] as Date).getTime() - (Date.now() + 600_000))).toBeLessThan(5_000);
  });

  it("retryAfterFor sem cabeçalho usa intervalo mínimo; com prazo respeita", () => {
    expect(retryAfterFor(new PluggyHttpError(429, "R", "x", "/e"), now)?.getTime()).toBe(now.getTime() + REFRESH_MIN_INTERVAL_MS);
    expect(retryAfterFor(new PluggyHttpError(429, "R", "x", "/e", 60), now)?.getTime()).toBe(now.getTime() + 60_000);
    expect(retryAfterFor(new PluggyHttpError(400, "R", "x", "/e"), now)).toBeNull();
  });

  it("linha com retryAfterAt no futuro bloqueia agendado e matinal, sem chamar a Pluggy", async () => {
    const d = deps({ history: vi.fn(async () => [{ connectionId: "c2", at: new Date("2026-11-13T14:00:00Z"), reason: "scheduled" as const, retryAfterAt: new Date("2026-11-13T16:00:00Z") }]) });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "scheduled" }, d, now)).toEqual({ ok: false, denial: "RATE_LIMITED" });
    expect(await requestOpenFinanceRefresh({ userId: "u1", connectionId: "c1", reason: "morning" }, d, now)).toEqual({ ok: false, denial: "RATE_LIMITED" });
    expect(d.patch).not.toHaveBeenCalled();
  });
});

describe("classificação por horário e aviso de idade", () => {
  it("06:00 a 08:59 SP é matinal; demais horários são agendados", () => {
    expect(refreshReasonFor(new Date("2026-11-13T09:30:00Z"))).toBe("morning"); // 06:30
    expect(refreshReasonFor(new Date("2026-11-13T11:00:00Z"))).toBe("morning"); // 08:00
    expect(refreshReasonFor(new Date("2026-11-13T12:00:00Z"))).toBe("scheduled"); // 09:00
    expect(refreshReasonFor(new Date("2026-11-14T02:00:00Z"))).toBe("scheduled"); // 23:00
  });

  it("linha de idade formata data de São Paulo e idade", () => {
    expect(openFinanceAgeLine(new Date("2026-11-13T14:30:00Z"), new Date("2026-11-13T15:00:00Z"))).toBe("Dados do banco de 11:30 (13/11), há 30 min.");
    expect(openFinanceAgeLine(null, now)).toBe("Dados do banco sem horário de atualização disponível.");
  });
});
