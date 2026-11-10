import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ results: [] as unknown[][], events: [] as { kind: string; value: unknown }[], select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: (...args: unknown[]) => mocks.select(...args), insert: (...args: unknown[]) => mocks.insert(...args), update: (...args: unknown[]) => mocks.update(...args) } }));
import { cronDependencies, getTelegramPreferences, setTelegramPreferences } from "./insight-store";
import { DEFAULT_PREFERENCES } from "./insights";
import { telegramDeliveries, telegramPreferences } from "@/db/schema";

beforeEach(() => {
  vi.clearAllMocks(); mocks.events.length = mocks.results.length = 0;
  const query = () => {
    const result = () => Promise.resolve(mocks.results.shift() ?? []);
    const chain = {
      from: () => chain, innerJoin: () => chain,
      where: (value: unknown) => { mocks.events.push({ kind: "where", value }); return chain; },
      values: (value: unknown) => { mocks.events.push({ kind: "values", value }); return chain; },
      set: (value: unknown) => { mocks.events.push({ kind: "set", value }); return chain; },
      onConflictDoUpdate: (value: unknown) => { mocks.events.push({ kind: "upsert", value }); return chain; },
      onConflictDoNothing: () => { mocks.events.push({ kind: "ignoreConflict", value: null }); return chain; },
      orderBy: () => chain, limit: result, returning: result,
      then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
      getSQL: () => sql`select 1`,
    };
    return chain;
  };
  mocks.select.mockImplementation(query); mocks.insert.mockImplementation(query); mocks.update.mockImplementation(query);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const compiled = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);

describe("persistência de preferências e envios", () => {
  it("default é opt-in desativado e leitura é filtrada pelo dono", async () => {
    expect(await getTelegramPreferences("owner")).toEqual(DEFAULT_PREFERENCES);
    expect(compiled(mocks.events[0].value).params).toEqual(["owner"]);
  });
  it("salva apenas preferências do dono e faz upsert pela chave do usuário", async () => {
    await setTelegramPreferences("owner", { ...DEFAULT_PREFERENCES, enabled: true });
    expect(mocks.insert).toHaveBeenCalledWith(telegramPreferences);
    expect(mocks.events.find((e) => e.kind === "values")?.value).toEqual({ userId: "owner", ...DEFAULT_PREFERENCES, enabled: true });
    expect((mocks.events.find((e) => e.kind === "upsert")?.value as { target: unknown }).target).toBe(telegramPreferences.userId);
  });
  it("constraint única inclui usuário e janela, claim concorrente não sobrescreve", async () => {
    const config = getTableConfig(telegramDeliveries);
    expect(config.indexes[0].config.unique).toBe(true);
    expect(config.indexes[0].config.columns.map((column) => "name" in column ? column.name : undefined)).toEqual(["user_id", "window_key"]);
    mocks.results.push([{ id: "delivery" }], []);
    expect(await cronDependencies.claim("owner", "2026-11-10:20")).toBe(true);
    expect(await cronDependencies.claim("owner", "2026-11-10:20")).toBe(false);
    expect(mocks.events.filter((e) => e.kind === "ignoreConflict")).toHaveLength(2);
  });
  it("atualização de status exige dono e janela", async () => {
    await cronDependencies.finish("owner", "2026-11-10:20", "FAILED");
    expect(compiled(mocks.events.find((e) => e.kind === "where")?.value).params).toEqual(["owner", "2026-11-10:20"]);
  });
  it("candidatos exigem opt-in e janela, excluem reservas e paginam por dono", async () => {
    mocks.results.push([{ userId: "owner", chatId: "123", prefs: DEFAULT_PREFERENCES }]);
    expect(await cronDependencies.candidates({ day: "2026-11-10", key: "2026-11-10:20", hour: 20 }, "previous-owner")).toHaveLength(1);
    const predicates = mocks.events.filter((e) => e.kind === "where").map((e) => compiled(e.value));
    expect(predicates[0].sql).toContain('"telegram_deliveries"."user_id" = "telegram_links"."user_id"');
    expect(predicates[0].params).toContain("2026-11-10:20");
    expect(predicates[1].params).toContain("previous-owner");
    expect(predicates[1].params).toContain(true);
    expect(predicates[1].params).toContain(20);
    expect(predicates[1].sql).toContain("not exists");
  });
  it("revalida vínculo, opt-in, horário e tipos imediatamente antes do envio", async () => {
    const prefs = { ...DEFAULT_PREFERENCES, enabled: true };
    expect(await cronDependencies.stillEnabled({ userId: "owner", chatId: "123", prefs }, { day: "2026-11-10", key: "2026-11-10:20", hour: 20 })).toBe(false);
    const predicate = compiled(mocks.events[0].value);
    expect(predicate.params).toContain("owner"); expect(predicate.params).toContain("123");
    expect(predicate.sql).toContain('"telegram_preferences"."enabled"');
    expect(predicate.sql).toContain('"telegram_preferences"."hours"');
    expect(predicate.sql).toContain('"telegram_preferences"."spending"');
  });
  it("envia texto sem parse_mode, sem logs e com timeout; erro não inclui token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-test-token");
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await cronDependencies.send("123", "Resumo financeiro");
    expect(fetch).toHaveBeenCalledWith("https://api.telegram.org/botfake-test-token/sendMessage", expect.objectContaining({ method: "POST", cache: "no-store", signal: expect.any(AbortSignal) }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({ chat_id: "123", text: "Resumo financeiro", protect_content: true });
    fetch.mockResolvedValue(Response.json({ ok: false, description: "private info" }, { status: 403 }));
    await expect(cronDependencies.send("123", "Resumo")).rejects.toThrow("telegram_send_failed");
  });
});
