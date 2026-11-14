import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), select: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification: mocks.send }));
vi.mock("@/db", () => ({ db: { select: mocks.select, update: mocks.update, delete: mocks.remove } }));
import { notificationDrivers } from "./drivers";
import { DEFAULT_NOTIFICATION_PREFERENCES, eventSchema } from "./policy";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("push driver", () => {
  it("bloqueia previsão avulsa também nos drivers finais", async () => {
    const event = eventSchema.parse({ userId: "owner", category: "negativeForecast", type: "OLD_FORECAST", body: "Saldo previsto negativo", dedupeKey: "old" });
    expect(await notificationDrivers.push(event, "id", DEFAULT_NOTIFICATION_PREFERENCES)).toBe(0);
    expect(await notificationDrivers.telegram(event, "id")).toBe(0);
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("Telegram inclui ação segura de retorno usando a origem validada existente", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://unsafe.test");
    const chain = { from: () => chain, innerJoin: () => chain, where: () => chain,
      limit: async () => [{ chatId: "123", prefs: { enabled: true, budget: true, hours: [8, 14, 20] } }] };
    mocks.select.mockReturnValue(chain);
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetch);
    const event = eventSchema.parse({ userId: "owner", category: "budget", type: "BUDGET", body: "Confira o orçamento", actionUrl: "/orcamento", dedupeKey: "budget" });
    expect(await notificationDrivers.telegram(event, "notice", true, new Date("2026-11-14T17:00Z"))).toBe(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Abrir no app", url: "https://mutanocontas.vercel.app/orcamento" });
    expect(body.protect_content).toBe(true); expect(body.parse_mode).toBeUndefined();
  });
  it.each([404, 410])("remove apenas subscription do dono em %i e continua nos outros dispositivos", async statusCode => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public"); vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private");
    const subs = [1, 2].map(i => ({ id: String(i), userId: "owner", endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, auth: "auth", p256dh: "public" }));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => subs }) });
    mocks.update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [{ id: "notice" }] }) }) });
    const where = vi.fn().mockResolvedValue([]); mocks.remove.mockReturnValue({ where });
    mocks.send.mockRejectedValueOnce({ statusCode }).mockResolvedValueOnce({});
    const event = eventSchema.parse({ userId: "owner", category: "budget", type: "BUDGET", body: "Aviso", dedupeKey: "key" });
    expect(await notificationDrivers.push(event, "notice", DEFAULT_NOTIFICATION_PREFERENCES)).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(predicate.params).toEqual(["owner", "1", "auth", "public"]);
    vi.unstubAllEnvs();
  });
});
