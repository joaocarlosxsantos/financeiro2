import { afterEach, describe, expect, it, vi } from "vitest";
import { handleNotificationCron, notificationWindow, type NotificationCronDependencies } from "./cron";
import { eventSchema } from "./policy";
const now = new Date("2026-11-12T11:00:00Z");
const request = (token = "secret") => new Request("https://app.test/api/cron/daily-summary?userId=attacker", { headers: { authorization: `Bearer ${token}` } });
afterEach(() => vi.unstubAllEnvs());
function deps(): NotificationCronDependencies {
  return { users: vi.fn().mockResolvedValue([{ id: "owner-without-telegram" }]),
    events: vi.fn(async userId => [eventSchema.parse({ userId, category: "summary", type: "DAILY", body: "Resumo", dedupeKey: "day" })]),
    dispatch: vi.fn().mockResolvedValue({ in_app: "sent", push: "sent", telegram: "skipped" }) };
}
describe("unified notification crons", () => {
  it("não exige Telegram vinculado para in_app/push e usa o dono obtido no servidor", async () => {
    vi.stubEnv("CRON_SECRET", "secret"); const d = deps();
    expect(await (await handleNotificationCron(request(), "daily", d, now)).json()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(d.events).toHaveBeenCalledWith("owner-without-telegram", "daily", now);
    expect(d.dispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-without-telegram" }), now);
  });
  it("sem segredo ou credencial incorreta não consulta usuários", async () => {
    const d = deps(); vi.stubEnv("CRON_SECRET", ""); expect((await handleNotificationCron(request(), "daily", d, now)).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "secret"); expect((await handleNotificationCron(request("wrong"), "daily", d, now)).status).toBe(401);
    expect(d.users).not.toHaveBeenCalled();
  });
  it("janelas estáveis e mês anterior correto, sem envios fora de horário", () => {
    expect(notificationWindow("insights", now)).toBe("2026-11-12:8");
    expect(notificationWindow("insights", new Date("2026-11-12T17:00:00Z"))).toBe("2026-11-12:14");
    expect(notificationWindow("monthly", new Date("2027-01-01T11:00:00Z"))).toBe("2026-12:month");
    expect(notificationWindow("monthly", now)).toBeNull();
    expect(notificationWindow("daily", new Date("2026-11-12T04:00:00Z"))).toBeNull();
  });
  it("falha de um destinatário não derruba os demais", async () => {
    vi.stubEnv("CRON_SECRET", "secret"); const d = deps();
    vi.mocked(d.users).mockResolvedValue([{ id: "bad" }, { id: "good" }]);
    vi.mocked(d.events).mockImplementation(async userId => { if (userId === "bad") throw new Error("private"); return []; });
    expect(await (await handleNotificationCron(request(), "daily", d, now)).json()).toEqual({ sent: 0, skipped: 1, failed: 1 });
  });
});
