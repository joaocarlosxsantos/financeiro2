import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher, type NotificationDrivers } from "./dispatcher";
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults, eventSchema, isQuiet, pushPayload, validPushEndpoint } from "./policy";

const event = { userId: "owner", category: "budget", type: "BUDGET_80", body: "Orçamento atingiu80%", actionUrl: "/orcamento", dedupeKey: "b:1:80:2026-11" };
function drivers(): NotificationDrivers {
  return { preferences: vi.fn().mockResolvedValue(defaults), receipt: vi.fn().mockResolvedValue("id"),
    in_app: vi.fn().mockResolvedValue(1), push: vi.fn().mockResolvedValue(1), telegram: vi.fn().mockResolvedValue(1) };
}
const noon = new Date("2026-11-12T15:00:00Z");
describe("NotificationDispatcher", () => {
  it("previsão avulsa nunca envia push/Telegram; as métricas ficam no resumo", async () => {
    const d = drivers();
    const result = await new NotificationDispatcher(d).dispatch({ ...event, category: "negativeForecast", type: "OLD_FORECAST", body: "Saldo previsto negativo" }, noon);
    expect(result).toEqual({ in_app: "sent", push: "skipped", telegram: "skipped" });
    expect(d.push).not.toHaveBeenCalled(); expect(d.telegram).not.toHaveBeenCalled();
  });
  it.each(["in_app", "push", "telegram"] as const)("falha em %s não bloqueia os outros canais", async failed => {
    const d = drivers(); vi.mocked(d[failed]).mockRejectedValue(new Error("private-provider-data"));
    const result = await new NotificationDispatcher(d).dispatch(event, noon);
    expect(result[failed]).toBe("failed");
    for (const channel of ["in_app", "push", "telegram"] as const) if (channel !== failed) expect(result[channel]).toBe("sent");
  });
  it("quiet hours em São Paulo preserva in_app e suprime canais externos", async () => {
    const d = drivers(); const result = await new NotificationDispatcher(d).dispatch(event, new Date("2026-11-13T02:00:00Z"));
    expect(result).toEqual({ in_app: "sent", push: "skipped", telegram: "skipped" });
    expect(d.push).not.toHaveBeenCalled(); expect(d.telegram).not.toHaveBeenCalled();
    expect(isQuiet(defaults, new Date("2026-11-12T11:00:00Z"))).toBe(false);
  });
  it("categoria/canais desativados não enviam; input não permite URLs arbitrárias", async () => {
    const d = drivers(); vi.mocked(d.preferences).mockResolvedValue({ ...defaults, budget: false });
    expect(await new NotificationDispatcher(d).dispatch(event, noon)).toEqual({ in_app: "skipped", push: "skipped", telegram: "skipped" });
    expect(d.receipt).not.toHaveBeenCalled();
    await expect(new NotificationDispatcher(d).dispatch({ ...event, actionUrl: "//evil.test" })).rejects.toThrow();
  });
  it("push tem título fixo e modo discreto não contém o corpo financeiro", () => {
    const payload = pushPayload(eventSchema.parse({ ...event, body: "Saldo R$1000" }), defaults, "id");
    expect(payload.title).toBe("Mutano Contas"); expect(payload.body).not.toContain("1000");
  });
  it("endpoints restritos aos gateways: sem IP, localhost, credenciais ou hosts enganosos", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/token", "https://web.push.apple.com/Q/token", "https://updates.push.services.mozilla.com/wpush/v2/token"]) expect(validPushEndpoint(url)).toBe(true);
    for (const url of ["http://fcm.googleapis.com/a", "https://localhost/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://secret@fcm.googleapis.com/x", "https://fcm.googleapis.com:8080/x"]) expect(validPushEndpoint(url)).toBe(false);
  });
});
